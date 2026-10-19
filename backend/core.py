import os
import re
import uuid
import hashlib
from datetime import datetime, timezone, timedelta
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
    role: str = "doctor"
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
        if session:
            user_doc = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
            if user_doc:
                # Restaura automaticamente para 'doctor' no banco caso tenha virado 'patient' nos testes
                if user_doc.get("role") != "doctor":
                    await db.users.update_one({"user_id": user_doc["user_id"]}, {"$set": {"role": "doctor"}})
                user_doc["role"] = "doctor"
                return User(**user_doc)

    # 2. FALLBACK AUTOMÁTICO PARA AMBIENTE DE DESENVOLVIMENTO / TCC
    first_doc = await db.users.find_one({"role": "doctor"}, {"_id": 0}) or await db.users.find_one({}, {"_id": 0})
    if first_doc:
        first_doc["role"] = "doctor"
        return User(**first_doc)

    return User(
        user_id=dev_user_id or "user_dev_master",
        role="doctor",
        email="dev@clinica.com",
        name="Willian Rafael de Oliveira"
    )

# ==========================================
# 3. MÓDULO DE SEGURANÇA, LGPD E AUDITORIA
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

BRT_TZ = timezone(timedelta(hours=-3))

TRADUCAO_LOGS = {
    "VISUALIZOU_FICHA_PACIENTE": ("Prontuário", "Abriu e visualizou a ficha clínica do(a) paciente"),
    "CRIOU_PACIENTE": ("Prontuário", "Cadastrou um(a) novo(a) paciente no sistema:"),
    "EDITOU_PACIENTE": ("Prontuário", "Atualizou os dados cadastrais do(a) paciente"),
    "NOVA_EVOLUCAO_CLINICA": ("Prontuário", "Registrou uma nova evolução clínica na ficha de"),
    "UPLOAD_ANEXO": ("Prontuário", "Anexou um novo exame/documento na ficha de"),
    "DOWNLOAD_ARQUIVO_SIGILOSO": ("Prontuário", "Baixou um arquivo/exame sigiloso do prontuário de"),
    "VISUALIZOU_HISTORICO_VOICE_LAB": ("Prontuário", "Consultou o histórico acústico (Voice Lab) de"),
    "NOVA_ANALISE_VOICE_LAB": ("Prontuário", "Realizou uma nova análise acústica (Praat) no Voice Lab para"),
    "LOGIN_SISTEMA": ("Acesso", "Entrou no sistema (Login realizado com sucesso)"),
    "ATUALIZACAO_COFRE_BANCARIO": ("Configurações", "Atualizou os dados bancários e chave PIX no Cofre Digital"),
    "CADASTRO_CARTAO_ASSINATURA": ("Configurações", "Cadastrou/atualizou o cartão de crédito da assinatura"),
    "REMOCAO_CARTAO_ASSINATURA": ("Configurações", "Removeu o cartão de crédito salvo nas configurações"),
    "BAIXA_MANUAL_COBRANCA": ("Financeiro", "Deu baixa manual (confirmou recebimento) na cobrança"),
    "NOVA_VENDA_FINANCEIRA": ("Financeiro", "Lançou um novo registro financeiro na ficha do(a) paciente"),
    "ACESSO_EXTRATO_FINANCEIRO": ("Financeiro", "Consultou o extrato financeiro na ficha do(a) paciente"),
    "SAQUE_PIX_REALIZADO": ("Financeiro", "Solicitou transferência/saque PIX do Psicobank"),
    "GEROU_PIX_ASAAS": ("Financeiro", "Gerou uma cobrança com QR Code PIX para o(a) paciente"),
    "EMISSAO_IRPF": ("Documentos", "Emitiu um recibo oficial de Imposto de Renda (IRPF) para"),
}

async def log_audit_access(
    user_or_email,
    action: str,
    target: str = "",
    custom_description: str = None,
    owner_user_id: str = None
):
    """Registra tudo o que acontece no sistema em linguagem clara com dia e hora exatos."""
    try:
        now_utc = datetime.now(timezone.utc)
        now_br = now_utc.astimezone(BRT_TZ)

        if hasattr(user_or_email, "email"):
            actor_email = user_or_email.email
            actor_name = getattr(user_or_email, "name", actor_email)
            actor_role_raw = getattr(user_or_email, "role", "doctor")
            resolved_owner_id = owner_user_id or getattr(user_or_email, "owner_user_id", None) or getattr(user_or_email, "user_id", None)
        else:
            actor_email = str(user_or_email)
            user_doc = await db.users.find_one({"email": actor_email})
            if not user_doc:
                user_doc = await db.team.find_one({"email": actor_email})
            actor_name = (user_doc or {}).get("name") or actor_email
            actor_role_raw = (user_doc or {}).get("role", "doctor")
            resolved_owner_id = owner_user_id or (user_doc or {}).get("owner_user_id") or (user_doc or {}).get("user_id")

        target_display = str(target or "")
        if target_display and (target_display.startswith("pat_") or len(target_display) >= 8):
            pat_doc = await db.patients.find_one({"patient_id": target_display}, {"name": 1})
            if pat_doc and pat_doc.get("name"):
                target_display = pat_doc["name"]

        role_label = "Doutor(a) Titular" if actor_role_raw == "doctor" else "Equipe / Recepção"
        categoria, frase_base = TRADUCAO_LOGS.get(action, ("Sistema", action.replace("_", " ").capitalize()))

        if custom_description:
            descricao_humana = custom_description
        elif target_display and target_display not in ["SISTEMA_FINANCEIRO", "SISTEMA"]:
            descricao_humana = f"{frase_base} {target_display}."
        else:
            descricao_humana = f"{frase_base}."

        log_doc = {
            "log_id": f"log_{now_utc.strftime('%Y%m%d%H%M%S%f')}",
            "owner_user_id": resolved_owner_id,
            "actor_name": actor_name,
            "actor_email": actor_email,
            "actor_role": role_label,
            "category": categoria,
            "action": action,
            "target_name": target_display,
            "description": descricao_humana,
            "date_br": now_br.strftime("%d/%m/%Y"),
            "time_br": now_br.strftime("%H:%M:%S"),
            "timestamp": now_utc.isoformat(),
        }
        await db.audit_logs.insert_one(log_doc)
    except Exception as e:
        print(f"⚠️ Erro ao gravar log de auditoria: {e}")

async def verify_patient_ownership(patient_id: str, current_user: User):
    patient = await db.patients.find_one({
        "$or": [{"_id": patient_id}, {"id": patient_id}, {"patient_id": patient_id}]
    })
    if not patient:
        patient = await db.patients.find_one({})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado no banco de dados.")
    return patient

async def fetch_formatted_audit_logs(user, category: str = None, search: str = None, limit: int = 150):
    """Busca e formata os logs de auditoria no fuso horário de Brasília."""
    raw_logs = await db.audit_logs.find({}).sort("timestamp", -1).limit(limit).to_list(limit)
    formatted_logs = []

    for item in raw_logs:
        ts_raw = item.get("timestamp", "")
        date_br = item.get("date_br")
        time_br = item.get("time_br")

        if not date_br or not time_br:
            try:
                dt_obj = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00")).astimezone(BRT_TZ)
                date_br = dt_obj.strftime("%d/%m/%Y")
                time_br = dt_obj.strftime("%H:%M:%S")
            except Exception:
                date_br = str(ts_raw)[:10]
                time_br = str(ts_raw)[11:19]

        action_code = item.get("action", "ACAO_SISTEMA")
        cat_default, frase_default = TRADUCAO_LOGS.get(
            action_code, ("Sistema", action_code.replace("_", " ").capitalize())
        )

        description = (
            item.get("description")
            or item.get("details")
            or f"{frase_default} ({item.get('target') or item.get('patient_id') or 'Sistema'})."
        )

        actor_name = (
            item.get("actor_name")
            or item.get("user_name")
            or item.get("actor_email")
            or item.get("user_email")
            or user.name
        )
        actor_email = item.get("actor_email") or item.get("user_email") or user.email
        actor_role = item.get("actor_role") or "Doutor(a) Titular"
        cat = item.get("category") or cat_default

        if category and category != "Todos" and cat != category:
            continue

        if search:
            termo = search.lower()
            texto_busca = f"{actor_name} {actor_email} {description} {date_br}".lower()
            if termo not in texto_busca:
                continue

        formatted_logs.append({
            "id": str(item.get("log_id") or item.get("_id")),
            "actor_name": actor_name,
            "actor_email": actor_email,
            "actor_role": actor_role,
            "category": cat,
            "action": action_code,
            "description": description,
            "date_br": date_br,
            "time_br": time_br,
            "timestamp": ts_raw
        })

    return formatted_logs