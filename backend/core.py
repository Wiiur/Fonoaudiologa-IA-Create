import os
import re
import uuid
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Literal
from dotenv import load_dotenv
from fastapi import HTTPException, Cookie, Header
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

# ==========================================
# 1. VARIÁVEIS DE AMBIENTE E BANCO DE DADOS
# ==========================================
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

ASAAS_API_URL = os.getenv("ASAAS_API_URL", os.getenv("ASAAS_BASE_URL", "https://sandbox.asaas.com/api/v3"))
ASAAS_API_KEY = os.getenv("ASAAS_API_KEY", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")

# Chave Mestre exclusiva para você (Dev) cadastrar doutores no Beta
ADMIN_SECRET_KEY = os.getenv("ADMIN_SECRET_KEY", "vox_admin_master_2026")
ALLOW_DEV_BYPASS = os.getenv("ALLOW_DEV_BYPASS", "true").lower() == "true"

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "fono_db")]

def hash_password(password: str) -> str:
    """Gera hash SHA-256 seguro para senhas de acesso ao Beta"""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

# ==========================================
# 2. MODELO DE USUÁRIO E AUTENTICAÇÃO
# ==========================================
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Literal["doctor", "secretary", "patient", "unassigned"] = "unassigned"
    crfa_number: Optional[str] = None
    crfa_state: Optional[str] = None
    professional_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    dev_user_id: Optional[str] = Header(default=None, alias="user-id"),
) -> User:
    # 1. PRIORIDADE MÁXIMA: Token de Sessão Real (Cookie ou Bearer Token)
    token = session_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]

    if token:
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=401, detail="Sessão inválida. Faça login novamente.")

        expires_at = session["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Sua sessão expirou. Faça login novamente.")

        user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
        if not user_doc:
            raise HTTPException(status_code=401, detail="Usuário não encontrado.")
        if user_doc.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Acesso ao Beta revogado pelo administrador.")

        return User(**user_doc)

    # 2. FALLBACK MODO DESENVOLVEDOR LOCAL (Apenas se ALLOW_DEV_BYPASS=true no .env)
    if dev_user_id and ALLOW_DEV_BYPASS:
        return User(
            user_id=dev_user_id,
            role="doctor",
            email="dev@clinica.com",
            name="Willian Rafael de Oliveira"
        )

    raise HTTPException(status_code=401, detail="Não autenticado. Acesso restrito ao Beta Fechado.")

# ==========================================
# 3. MÓDULO DE SEGURANÇA E LGPD
# ==========================================
def anonymize_text(text: str, patient_name: str = "") -> str:
    if not text:
        return ""
    texto_limpo = str(text)
    texto_limpo = re.sub(r"\b\d{3}\.\d{3}\.\d{3}-\d{2}\b", "[CPF_PROTEGIDO]", texto_limpo)
    texto_limpo = re.sub(r"\b(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?\d{4,5}[-\s]?\d{4}\b", "[TEL_PROTEGIDO]", texto_limpo)
    texto_limpo = re.sub(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,7}\b", "[EMAIL_PROTEGIDO]", texto_limpo)

    if patient_name:
        nome_parts = patient_name.split()
        if nome_parts:
            primeiro_nome = nome_parts[0]
            texto_limpo = re.compile(re.escape(patient_name), re.IGNORECASE).sub("[PACIENTE]", texto_limpo)
            if len(primeiro_nome) > 2:
                texto_limpo = re.compile(re.escape(primeiro_nome), re.IGNORECASE).sub("[PACIENTE]", texto_limpo)

    return texto_limpo

async def log_audit_access(user_email: str, action: str, target_patient_id: str):
    try:
        await db.audit_logs.insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_email": user_email,
            "action": action,
            "target_patient_id": target_patient_id,
            "compliance": "LGPD Art. 37 - Rastreabilidade"
        })
    except Exception as e:
        print(f"⚠️ Erro ao salvar log de auditoria: {e}")

async def verify_patient_ownership(patient_id: str, current_user: User):
    if current_user.role == "secretary":
        patient = await db.patients.find_one({"$or": [{"_id": patient_id}, {"patient_id": patient_id}]})
        if not patient:
            raise HTTPException(status_code=404, detail="Paciente não encontrado.")
        return patient

    if current_user.role == "patient":
        patient = await db.patients.find_one({"linked_user_id": current_user.user_id})
        if not patient or (patient.get("patient_id") != patient_id and str(patient.get("_id")) != patient_id):
            raise HTTPException(status_code=403, detail="Acesso bloqueado: Você só pode acessar seus próprios dados.")
        return patient

    patient = await db.patients.find_one({
        "$or": [{"_id": patient_id}, {"id": patient_id}, {"patient_id": patient_id}]
    })
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado no banco de dados.")

    if str(patient.get("owner_user_id")) != str(current_user.user_id):
        raise HTTPException(status_code=403, detail="ALERTA LGPD: Acesso negado.")

    return patient