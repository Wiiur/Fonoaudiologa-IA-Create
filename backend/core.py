import os
import re
import uuid
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

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get("DB_NAME", "fono_db")]

# ==========================================
# 2. MODELO DE USUÁRIO E AUTENTICAÇÃO
# ==========================================
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Literal["doctor", "secretary", "patient", "unassigned"] = "unassigned"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    dev_user_id: Optional[str] = Header(default=None, alias="user-id"),
) -> User:
    # 1. Modo Desenvolvedor (Frontend Local)
    if dev_user_id:
        return User(
            user_id=dev_user_id,
            role="doctor",
            email="dev@clinica.com",
            name="Willian Rafael de Oliveira"
        )

    # 2. Fluxo de Sessão / Bearer Token
    token = session_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")

    return User(**user_doc)

# ==========================================
# 3. MÓDULO DE SEGURANÇA E LGPD
# ==========================================
def anonymize_text(text: str, patient_name: str = "") -> str:
    """Filtro LGPD: Remove PII (CPF, Telefones, E-mails e Nome) antes de enviar para a IA."""
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
    """Registra log de auditoria silencioso para conformidade com LGPD Art. 37."""
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
    """Trava Anti-IDOR: Garante que apenas o profissional responsável acesse o paciente."""
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
        print(f"🚨 TENTATIVA DE INVASÃO IDOR: Usuário {current_user.email} tentou acessar paciente {patient_id}")
        raise HTTPException(status_code=403, detail="ALERTA LGPD: Acesso negado.")

    return patient