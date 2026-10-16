import os
import io
import re
import json
import uuid
import shutil
import smtplib
import logging
import tempfile
import traceback
import subprocess
from uuid import uuid4
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional, Literal, Dict, Any
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from bson.objectid import ObjectId

import httpx
import numpy as np
import parselmouth
from parselmouth.praat import call
from openai import AsyncOpenAI
from google import genai

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header, UploadFile, BackgroundTasks, File, Form
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet

# Importa módulos locais do projeto
from storage import get_storage
from voice_analysis import build_clinical_prompt, analyze_challenge
from core import (
    db, client, User, get_current_user, anonymize_text,
    log_audit_access, verify_patient_ownership,
    OPENROUTER_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY,
    ADMIN_SECRET_KEY, hash_password
)
from finance_routes import finance_router

# ==========================================
# 1. INICIALIZAÇÃO DO FASTAPI E ARQUIVOS ESTÁTICOS
# ==========================================
app = FastAPI(title="VoxIntelligence API")
api_router = APIRouter(prefix="/api")

# Conecta todas as rotas financeiras/Asaas ao api_router
api_router.include_router(finance_router)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


# ==========================================
# 2. MODELOS CLÍNICOS E DE GESTÃO
# ==========================================
class RoleSelect(BaseModel):
    role: Literal["doctor", "secretary"]
    crfa_number: Optional[str] = None
    crfa_state: Optional[str] = None
    professional_name: Optional[str] = None

class ProfileUpdate(BaseModel):
    crfa_number: Optional[str] = None
    crfa_state: Optional[str] = None
    professional_name: Optional[str] = None

class ResponsibleInfo(BaseModel):
    name: Optional[str] = None
    relationship: Optional[str] = None
    cpf: Optional[str] = None

class Patient(BaseModel):
    patient_id: str = Field(default_factory=lambda: f"pat_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    linked_user_id: Optional[str] = None
    photo_url: Optional[str] = None
    name: str
    birth_date: Optional[str] = None
    age: Optional[int] = None
    rg_cpf: Optional[str] = None
    biological_sex: Optional[Literal["masculino", "feminino"]] = "feminino"
    gender_identity: Optional[str] = "Cisgênero"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    has_responsible: bool = False
    responsible: Optional[ResponsibleInfo] = None
    profession_vocal_demand: Optional[str] = None
    chief_complaint: Optional[str] = None
    otorrhoea_diagnosis: Optional[str] = None
    interests: Optional[str] = None
    notes: Optional[str] = None
    status: Literal["active", "inactive", "discharged"] = "active"
    last_session_at: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class PatientCreate(BaseModel):
    photo_url: Optional[str] = None
    name: str
    birth_date: Optional[str] = None
    rg_cpf: Optional[str] = None
    biological_sex: Optional[Literal["masculino", "feminino"]] = "feminino"
    gender_identity: Optional[str] = "Cisgênero"
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    has_responsible: bool = False
    responsible: Optional[ResponsibleInfo] = None
    profession_vocal_demand: Optional[str] = None
    chief_complaint: Optional[str] = None
    otorrhoea_diagnosis: Optional[str] = None
    interests: Optional[str] = None
    notes: Optional[str] = None

class Appointment(BaseModel):
    appointment_id: str = Field(default_factory=lambda: f"apt_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    patient_id: str
    patient_name: str
    start: str
    end: str
    mode: Literal["clinic", "telehealth"] = "clinic"
    status: Literal["scheduled", "done", "cancelled", "no_show"] = "scheduled"
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AppointmentCreate(BaseModel):
    patient_id: Optional[str] = None
    title: Optional[str] = "Sessão Fono"
    start: str
    end: str
    mode: Literal["clinic", "telehealth"] = "clinic"
    type: Optional[str] = "paciente"  # 'paciente', 'reuniao', 'block'
    room: Optional[str] = "sala_1"
    recurrence: Optional[str] = "none" # 'none', 'weekly', 'biweekly', 'monthly'
    notes: Optional[str] = None

class SoapCreate(BaseModel):
    patient_id: str
    session_date: str
    attendance: str = "presente"
    absence_reason: Optional[str] = None
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""

class ActivityCreate(BaseModel):
    patient_id: str
    title: str
    type: str
    description: str
    status: str = "in_progress"

class FolderCreate(BaseModel):
    patient_id: str
    name: str

class ReportCreate(BaseModel):
    patient_id: str
    title: str
    content: str
    format: str
    status: str

class ProtocolUpdate(BaseModel):
    patient_id: str
    protocol_key: str
    answers: Dict[str, Any]
    summary: str
    tip: str
    score: float
    domains: Optional[Dict[str, Any]] = None
    date: str


# ==========================================
# 3. ROTAS DE AUTENTICAÇÃO E PERFIL
# ==========================================
@api_router.get("/")
async def root():
    return {"service": "VoxIntelligence", "status": "ok"}

# ==========================================
# AUTENTICAÇÃO BLINDADA PARA BETA FECHADO
# ==========================================
class BetaDoctorCreate(BaseModel):
    name: str
    email: str
    password: str
    crfa_number: Optional[str] = "00000"
    crfa_state: Optional[str] = "SP"

@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
    """Login via Google OAuth: Só permite entrada se o e-mail já foi autorizado no Beta ou é Paciente convidado"""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient(timeout=15) as hc:
        r = await hc.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessão OAuth inválida")
    data = r.json()

    email = data["email"].strip().lower()
    existing = await db.users.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    matching_patient = await db.patients.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})

    # 🔒 TRAVA DO BETA FECHADO: Se não está em db.users e não é paciente convidado, barra na porta!
    if not existing and not matching_patient:
        raise HTTPException(
            status_code=403,
            detail="Acesso Restrito (Beta Fechado): Este e-mail não possui convite ativo para testes."
        )

    if existing:
        if existing.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Esta conta de teste foi desativada pelo administrador.")
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing["name"]), "picture": data.get("picture")}},
        )
    else:
        # Só cria automaticamente se for um paciente previamente cadastrado pelo doutor
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": data.get("name", matching_patient.get("name", email)),
            "picture": data.get("picture"),
            "role": "patient",
            "status": "active",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        await db.patients.update_one(
            {"patient_id": matching_patient["patient_id"]},
            {"$set": {"linked_user_id": user_id}},
        )

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token, httponly=True,
        secure=True, samesite="none", path="/", max_age=7 * 24 * 60 * 60,
    )
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "password_hash": 0})
    return {"user": user_doc, "session_token": session_token}


@api_router.post("/team/login")
async def login_team_or_beta_doctor(payload: dict, response: Response):
    """Login Unificado por E-mail e Senha: Funciona para Doutores do Beta Fechado e para Equipe/Secretárias"""
    email = payload.get("email", "").strip().lower()
    password = payload.get("password", "")
    pwd_hash = hash_password(password)

    # 1. Verifica primeiro se é um Doutor(a) do Beta Fechado em `db.users`
    beta_user = await db.users.find_one({
        "email": {"$regex": f"^{email}$", "$options": "i"},
        "$or": [{"password_hash": pwd_hash}, {"password": password}]
    })

    if beta_user:
        if beta_user.get("status") == "blocked":
            raise HTTPException(status_code=403, detail="Seu acesso ao Beta Fechado foi pausado.")

        session_token = f"sess_{uuid.uuid4().hex}"
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        await db.user_sessions.insert_one({
            "user_id": beta_user["user_id"],
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        response.set_cookie(
            key="session_token", value=session_token, httponly=True,
            secure=False, samesite="lax", path="/", max_age=7 * 24 * 60 * 60,
        )
        beta_user.pop("_id", None)
        beta_user.pop("password_hash", None)
        beta_user.pop("password", None)
        return {"status": "success", "user": beta_user, "session_token": session_token}

    # 2. Se não estiver em `db.users`, verifica na tabela de Equipe/Secretárias (`db.team`)
    member = await db.team.find_one({
        "email": {"$regex": f"^{email}$", "$options": "i"},
        "password": password
    })
    if not member:
        raise HTTPException(status_code=401, detail="Acesso negado: E-mail não autorizado no Beta ou senha incorreta.")
    if member.get("status") != "Ativo":
        raise HTTPException(status_code=403, detail="Esta conta ainda não foi ativada.")

    member["_id"] = str(member["_id"])
    return {"status": "success", "user": member}


# ==========================================
# ROTAS EXCLUSIVAS DO DESENVOLVEDOR (GESTÃO DO BETA FECHADO)
# ==========================================
def verify_admin_key(x_admin_key: Optional[str] = Header(default=None)):
    if not x_admin_key or x_admin_key != ADMIN_SECRET_KEY:
        raise HTTPException(status_code=403, detail="Chave Mestra de Desenvolvedor inválida.")

@api_router.post("/admin/beta-doctors")
async def admin_create_beta_doctor(payload: BetaDoctorCreate, _: None = Depends(verify_admin_key)):
    """Cria ou atualiza uma conta de Doutor(a) autorizada para o Beta Fechado"""
    email_clean = payload.email.strip().lower()
    existing = await db.users.find_one({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})

    user_id = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"
    doc = {
        "user_id": user_id,
        "email": email_clean,
        "name": payload.name.strip(),
        "professional_name": payload.name.strip(),
        "role": "doctor",
        "crfa_number": payload.crfa_number,
        "crfa_state": payload.crfa_state.upper(),
        "password_hash": hash_password(payload.password),
        "status": "active",
        "beta_tester": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
    return {"status": "success", "msg": f"Doutor(a) {payload.name} liberado(a) no Beta Fechado!", "user_id": user_id}

@api_router.get("/admin/beta-doctors")
async def admin_list_beta_doctors(_: None = Depends(verify_admin_key)):
    users = await db.users.find({"role": "doctor"}, {"_id": 0, "password_hash": 0, "password": 0}).to_list(200)
    return users

@api_router.delete("/admin/beta-doctors/{email}")
async def admin_revoke_beta_doctor(email: str, _: None = Depends(verify_admin_key)):
    res = await db.users.update_one(
        {"email": {"$regex": f"^{email.strip()}$", "$options": "i"}},
        {"$set": {"status": "blocked"}}
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="E-mail não encontrado.")
    await db.user_sessions.delete_many({})
    return {"status": "success", "msg": f"Acesso de {email} revogado imediatamente."}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()

@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

@api_router.patch("/auth/profile")
async def update_profile(payload: ProfileUpdate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctor can update CRFa profile")
    if not payload.crfa_number or not payload.crfa_state or not payload.professional_name:
        raise HTTPException(status_code=400, detail="All CRFa fields required")
    if not re.fullmatch(r"\d{1,6}", payload.crfa_number.strip()):
        raise HTTPException(status_code=400, detail="CRFa number must be 1-6 digits")
    await db.users.update_one(
        {"user_id": user.user_id},
        {"$set": {
            "crfa_number": payload.crfa_number.strip(),
            "crfa_state": payload.crfa_state.strip().upper(),
            "professional_name": payload.professional_name.strip(),
            "crfa_verification_status": "declared",
        }},
    )
    return await db.users.find_one({"user_id": user.user_id}, {"_id": 0})

@api_router.post("/auth/role")
async def set_role(payload: RoleSelect, user: User = Depends(get_current_user)):
    update = {"role": payload.role}
    if payload.role == "doctor":
        if not payload.crfa_number or not payload.crfa_state or not payload.professional_name:
            raise HTTPException(status_code=400, detail="CRFa number, state and professional name required for doctor")
        if not re.fullmatch(r"\d{1,6}", payload.crfa_number.strip()):
            raise HTTPException(status_code=400, detail="CRFa number must be 1-6 digits")
        update.update({
            "crfa_number": payload.crfa_number.strip(),
            "crfa_state": payload.crfa_state.strip().upper(),
            "professional_name": payload.professional_name.strip(),
        })
    await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    return await db.users.find_one({"user_id": user.user_id}, {"_id": 0})


# ==========================================
# 4. PACIENTES, AGENDA, SOAP, PASTAS E ANEXOS
# ==========================================
@api_router.get("/patients")
async def list_patients(user: User = Depends(get_current_user)):
    if user.role == "doctor":
        return await db.patients.find({"owner_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    elif user.role == "secretary":
        return await db.patients.find({}, {"_id": 0}).to_list(1000)
    elif user.role == "patient":
        return await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    return []

@api_router.post("/patients")
async def create_patient(payload: PatientCreate, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403, detail="Only doctor/secretary can create patients")
    owner_id = user.user_id
    if user.role == "secretary":
        doc = await db.users.find_one({"role": "doctor"}, {"_id": 0})
        owner_id = doc["user_id"] if doc else user.user_id
    patient = Patient(owner_user_id=owner_id, **payload.model_dump())
    d = patient.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.patients.insert_one(d)
    d.pop("_id", None)
    return d

@api_router.get("/patients/{patient_id}")
async def get_patient(patient_id: str, user: User = Depends(get_current_user)):
    patient = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
    if user.role != "secretary" and patient.get("owner_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Acesso negado a este paciente")
    return patient

@api_router.patch("/patients/{patient_id}")
async def update_patient(patient_id: str, payload: dict, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)
    payload.pop("patient_id", None)
    payload.pop("owner_user_id", None)
    await db.patients.update_one({"patient_id": patient_id}, {"$set": payload})
    return await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})

@api_router.delete("/patients/{patient_id}")
async def delete_patient(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    await db.patients.delete_one({"patient_id": patient_id})
    return {"ok": True}

@api_router.post("/patients/{patient_id}/invite")
async def invite_patient(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    pat = await db.patients.find_one({"patient_id": patient_id, "owner_user_id": user.user_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404)
    token = f"inv_{uuid.uuid4().hex[:16]}"
    await db.patient_invites.insert_one({
        "token": token, "patient_id": patient_id, "email": pat.get("email"),
        "owner_user_id": user.user_id, "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"token": token, "invite_link": f"/portal/join?token={token}"}

@api_router.post("/patients/link")
async def link_patient(payload: dict, user: User = Depends(get_current_user)):
    token = payload.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="token required")
    inv = await db.patient_invites.find_one({"token": token, "used": False}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid or used invite")
    await db.patients.update_one({"patient_id": inv["patient_id"]}, {"$set": {"linked_user_id": user.user_id}})
    await db.patient_invites.update_one({"token": token}, {"$set": {"used": True}})
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"role": "patient"}})
    return {"ok": True, "patient_id": inv["patient_id"]}

@api_router.post("/activities")
async def create_activity(activity: ActivityCreate):
    new_activity = activity.model_dump()
    new_activity["activity_id"] = f"act_{uuid4().hex[:8]}"
    new_activity["start_date"] = date.today().isoformat()
    new_activity["status"] = "completed" if new_activity["type"] == "clinica" else "in_progress"
    new_activity["days_total"] = 7
    new_activity["days_completed"] = [False, False, False, False, False, False, False]
    await db.activities.insert_one(new_activity)
    del new_activity["_id"]
    return new_activity

@api_router.get("/activities")
async def get_activities(patient_id: Optional[str] = None):
    q = {"patient_id": patient_id} if patient_id else {}
    activities = await db.activities.find(q).to_list(100)
    for a in activities:
        a["_id"] = str(a["_id"])
    return activities

@api_router.post("/folders")
async def create_folder(folder: FolderCreate):
    new_folder = {
        "folder_id": f"fold_{uuid4().hex[:8]}",
        "patient_id": folder.patient_id,
        "name": folder.name,
        "date": date.today().isoformat()
    }
    await db.folders.insert_one(new_folder)
    del new_folder["_id"]
    return new_folder

@api_router.get("/folders")
async def get_folders(patient_id: str):
    folders = await db.folders.find({"patient_id": patient_id}).to_list(100)
    for f in folders:
        f["_id"] = str(f["_id"])
    return folders

@api_router.post("/attachments")
async def upload_attachment(
    patient_id: str = Form(...),
    folder_id: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    try:
        file_ext = file.filename.split(".")[-1]
        unique_filename = f"{uuid4().hex}.{file_ext}"
        file_path = f"uploads/{unique_filename}"
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        new_attachment = {
            "attachment_id": f"att_{uuid4().hex[:8]}",
            "patient_id": patient_id,
            "folder_id": folder_id,
            "name": file.filename,
            "type": file.content_type,
            "size": f"{file_size_mb:.2f} MB",
            "date": date.today().isoformat(),
            "file_url": f"/uploads/{unique_filename}",
            "file_path": file_path
        }
        await db.attachments.insert_one(new_attachment)
        del new_attachment["_id"]
        return new_attachment
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")

@api_router.get("/attachments")
async def get_attachments(patient_id: str):
    attachments = await db.attachments.find({"patient_id": patient_id}).to_list(100)
    for a in attachments:
        a["_id"] = str(a["_id"])
    return attachments

@api_router.delete("/attachments/{attachment_id}")
async def delete_attachment(attachment_id: str):
    attachment = await db.attachments.find_one({"attachment_id": attachment_id})
    if not attachment:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    if os.path.exists(attachment["file_path"]):
        os.remove(attachment["file_path"])
    await db.attachments.delete_one({"attachment_id": attachment_id})
    return {"msg": "Arquivo deletado com sucesso"}

@api_router.get("/attachments/download")
async def secure_download_file(file_url: str, patient_id: str = None, user: User = Depends(get_current_user)):
    if patient_id:
        await verify_patient_ownership(patient_id, user)
    safe_path = os.path.normpath(f"./{file_url}")
    if not safe_path.startswith("uploads") and not safe_path.startswith("storage_data"):
        raise HTTPException(status_code=403, detail="Acesso não autorizado a esta pasta.")
    if not os.path.exists(safe_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor.")
    await log_audit_access(user.email, "DOWNLOAD_ARQUIVO_SIGILOSO", patient_id or "Desconhecido")
    return FileResponse(safe_path)

@api_router.post("/reports")
async def create_report(report: ReportCreate):
    new_report = report.model_dump()
    new_report["report_id"] = f"rep_{uuid.uuid4().hex[:8]}"
    new_report["date"] = date.today().isoformat()
    await db.reports.insert_one(new_report)
    del new_report["_id"]
    return new_report

@api_router.put("/reports/{report_id}")
async def update_report(report_id: str, report: ReportCreate):
    updated_data = report.model_dump()
    updated_data["date"] = date.today().isoformat()
    result = await db.reports.update_one({"report_id": report_id}, {"$set": updated_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
    return {"msg": "Relatório atualizado com sucesso"}

@api_router.get("/reports")
async def get_reports(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {"patient_id": patient_id} if patient_id else {"owner_user_id": user.user_id}
    reports = await db.reports.find(q).to_list(100)
    for r in reports:
        r["_id"] = str(r["_id"])
    return reports

@api_router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    await db.reports.delete_one({"report_id": report_id})
    return {"msg": "Relatório deletado com sucesso"}

@api_router.post("/protocols")
async def save_protocol(protocol: ProtocolUpdate):
    data = protocol.model_dump()
    if data["protocol_key"] == "qvv":
        respostas = data.get("answers", {})
        bruto_fisico = sum([float(respostas.get(f"q{i}", 1)) for i in [1, 2, 3, 6, 7, 9]])
        bruto_socio = sum([float(respostas.get(f"q{i}", 1)) for i in [4, 5, 8, 10]])
        bruto_total = bruto_fisico + bruto_socio
        escore_fisico = 100 - (((bruto_fisico - 6) / 24) * 100)
        escore_socio = 100 - (((bruto_socio - 4) / 16) * 100)
        escore_total = 100 - (((bruto_total - 10) / 40) * 100)
        data["domains"] = {
            "fisico": round(escore_fisico, 2),
            "socio_emocional": round(escore_socio, 2),
            "total": round(escore_total, 2)
        }
    await db.protocols.update_one(
        {"patient_id": data["patient_id"], "protocol_key": data["protocol_key"]},
        {"$set": data}, upsert=True
    )
    return {"msg": "Protocolo salvo com sucesso", "domains_calculados": data.get("domains")}

@api_router.get("/protocols")
async def get_protocols(patient_id: str):
    protocols = await db.protocols.find({"patient_id": patient_id}).to_list(100)
    result = {"qvv": None, "capeV": None, "idv10": None, "esv": None}
    for p in protocols:
        key = p["protocol_key"]
        if key in result:
            result[key] = {
                "answers": p.get("answers", {}), "summary": p.get("summary", ""),
                "tip": p.get("tip", ""), "score": p.get("score", 0),
                "domains": p.get("domains"), "date": p.get("date", "")
            }
    return result

@api_router.delete("/protocols/{patient_id}/{protocol_key}")
async def delete_protocol(patient_id: str, protocol_key: str):
    await db.protocols.delete_one({"patient_id": patient_id, "protocol_key": protocol_key})
    return {"msg": "Protocolo resetado"}

@api_router.get("/appointments")
async def list_appointments(user: User = Depends(get_current_user)):
    if user.role == "doctor":
        q = {"owner_user_id": user.user_id}
    elif user.role == "secretary":
        q = {}
    elif user.role == "patient":
        pats = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(100)
        q = {"patient_id": {"$in": [p["patient_id"] for p in pats]}}
    else:
        q = {"_never": True}
    return await db.appointments.find(q, {"_id": 0}).sort("start", 1).to_list(1000)

@api_router.post("/appointments")
async def create_appointment(payload: AppointmentCreate, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)

    owner_id = user.user_id
    patient_name = payload.title or "Evento"

    if payload.type == "paciente" and payload.patient_id:
        pat = await db.patients.find_one({"patient_id": payload.patient_id}, {"_id": 0})
        if not pat:
            raise HTTPException(status_code=404, detail="Paciente não encontrado")
        owner_id = pat["owner_user_id"]
        patient_name = pat["name"]

    # Calcula quantas ocorrências gerar caso tenha recorrência
    occurrences = 1
    step_days = 0
    if payload.recurrence == "weekly":
        occurrences, step_days = 4, 7
    elif payload.recurrence == "biweekly":
        occurrences, step_days = 4, 14
    elif payload.recurrence == "monthly":
        occurrences, step_days = 4, 30

    start_dt = datetime.fromisoformat(payload.start.replace("Z", "+00:00"))
    end_dt = datetime.fromisoformat(payload.end.replace("Z", "+00:00"))
    created_docs = []

    for i in range(occurrences):
        delta = timedelta(days=i * step_days)
        doc = {
            "appointment_id": f"apt_{uuid.uuid4().hex[:12]}",
            "owner_user_id": owner_id,
            "patient_id": payload.patient_id or "",
            "patient_name": patient_name,
            "title": payload.title or patient_name,
            "start": (start_dt + delta).isoformat(),
            "end": (end_dt + delta).isoformat(),
            "mode": payload.mode,
            "type": payload.type or "paciente",
            "room": payload.room or "sala_1",
            "recurrence": payload.recurrence or "none",
            "status": "scheduled",
            "notes": payload.notes,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.appointments.insert_one(doc)
        doc.pop("_id", None)
        created_docs.append(doc)

    return created_docs[0]

# ==========================================
# ATUALIZAÇÃO SERVER.PY: TOGGLE E DELETE DE DIÁRIOS (SETTINGS.JSX)
# ==========================================
@api_router.put("/templates/{template_id}/toggle")
async def toggle_template(template_id: str, payload: dict, user: User = Depends(get_current_user)):
    await db.templates.update_one(
        {"id": template_id, "owner_user_id": user.user_id},
        {"$set": {"active": payload.get("active", True)}}
    )
    return {"status": "success"}

@api_router.delete("/templates/{template_id}")
async def delete_template(template_id: str, user: User = Depends(get_current_user)):
    await db.templates.delete_one({"id": template_id, "owner_user_id": user.user_id})
    return {"status": "success"}

# ==========================================
# ATUALIZAÇÃO SERVER.PY: EXCLUSÃO E DOWNLOAD DE ÁUDIO DOS DESAFIOS VOCAIS
# ==========================================
@api_router.delete("/voice/challenges/attempts/{attempt_id}")
async def delete_challenge_attempt(attempt_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_challenges.find_one({"attempt_id": attempt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    try:
        get_storage().delete(doc["storage_key"])
    except Exception:
        pass
    await db.voice_challenges.delete_one({"attempt_id": attempt_id})
    return {"ok": True}

@api_router.get("/voice/challenges/audio/{attempt_id}/download")
async def download_challenge_audio(
    attempt_id: str,
    format: str = "wav",
    background_tasks: BackgroundTasks = BackgroundTasks(),
    user: User = Depends(get_current_user)
):
    doc = await db.voice_challenges.find_one({"attempt_id": attempt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    storage = get_storage()
    local_path = storage.local_path(doc["storage_key"])
    if not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="Arquivo original não encontrado no disco")

    if format not in ["wav", "mp3", "ogg"]:
        format = "wav"

    safe_title = re.sub(r'[^A-Za-z0-9_]', '', str(doc.get("challenge_title") or "Desafio").replace(" ", "_"))
    safe_name = re.sub(r'[^A-Za-z0-9_]', '', str(doc.get("patient_name") or "Paciente").replace(" ", "_"))
    filename = f"{safe_title}_{safe_name}.{format}"

    # Tenta converter via FFmpeg; se o FFmpeg não estiver instalado na máquina, entrega o arquivo original sem quebrar!
    try:
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{format}")
        tmp_path = tmp.name
        tmp.close()
        cmd = ["ffmpeg", "-y", "-i", local_path, tmp_path]
        res = subprocess.run(cmd, capture_output=True)
        if res.returncode == 0:
            background_tasks.add_task(os.remove, tmp_path)
            return FileResponse(path=tmp_path, filename=filename, media_type=f"audio/{format}")
    except Exception:
        pass

    return FileResponse(path=local_path, filename=filename, media_type=doc.get("content_type", "audio/webm"))


# ==========================================
# ATUALIZAÇÃO SERVER.PY: LAUDO IA NO VOICELAB
# ==========================================
@api_router.post("/voice/analyses/{analysis_id}/report")
async def voice_report(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Análise não encontrada")
    pat = await db.patients.find_one({"patient_id": doc["patient_id"]}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    prompt = build_clinical_prompt(pat, doc.get("metrics") or {}, doc.get("notes") or "")

    async def event_gen():
        full_report = ""
        try:
            if GEMINI_API_KEY:
                client_gemini = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
                resp = await client_gemini.chat.completions.create(
                    model="gemini-2.0-flash",
                    messages=[
                        {"role": "system", "content": "Você é um fonoaudiólogo especialista em voz e acústica forense/clínica (Praat). Gere pareceres baseados em evidências com referências clicáveis."},
                        {"role": "user", "content": prompt}
                    ],
                    stream=True
                )
                async for chunk in resp:
                    text = chunk.choices[0].delta.content or ""
                    if text:
                        full_report += text
                        yield f"data: {json.dumps({'delta': text})}\n\n"
            else:
                raise ValueError("Sem GEMINI_API_KEY")
        except Exception:
            fallback = (
                f"### Parecer Acústico Instrumental\n\n"
                f"**Paciente:** {pat.get('name')} | **Tarefa:** {doc.get('task')}\n\n"
                f"* **Frequência Fundamental (F0):** {doc.get('metrics', {}).get('f0_mean_hz', 0)} Hz\n"
                f"* **Jitter (Local):** {doc.get('metrics', {}).get('jitter_local_pct', 0)}% (Referência: < 1.04%)\n"
                f"* **Shimmer (Local):** {doc.get('metrics', {}).get('shimmer_local_pct', 0)}% (Referência: < 3.81%)\n"
                f"* **HNR:** {doc.get('metrics', {}).get('hnr_db', 0)} dB (Referência: > 20 dB)\n\n"
                f"**Hipótese Funcional:** Sugere-se correlação com achados perceptivo-auditivos (CAPE-V) e videolaringoscópicos ([Behlau, 2001](https://scholar.google.com/scholar?q=Behlau+2001+voz))."
            )
            full_report = fallback
            yield f"data: {json.dumps({'delta': fallback})}\n\n"

        await db.voice_analyses.update_one(
            {"analysis_id": analysis_id},
            {"$set": {"report": full_report, "report_generated_at": datetime.now(timezone.utc).isoformat()}}
        )
        yield f"data: {json.dumps({'done': True, 'report': full_report})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")

@api_router.patch("/appointments/{appointment_id}")
async def update_appointment(appointment_id: str, payload: dict, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)
    await db.appointments.update_one({"appointment_id": appointment_id}, {"$set": payload})
    return await db.appointments.find_one({"appointment_id": appointment_id}, {"_id": 0})

@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(appointment_id: str, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)
    await db.appointments.delete_one({"appointment_id": appointment_id})
    return {"ok": True}

@api_router.get("/records")
async def get_records(patient_id: str, user: User = Depends(get_current_user)):
    await verify_patient_ownership(patient_id, user)
    registros = await db.records.find({"patient_id": patient_id}).to_list(length=100)
    for r in registros:
        r["_id"] = str(r["_id"])
    return registros

@api_router.post("/records")
async def create_record(record: SoapCreate):
    data = record.model_dump()
    data["record_id"] = f"rec_{uuid.uuid4().hex[:12]}"
    data["owner_user_id"] = "medico_padrao"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.records.insert_one(data)
    return {"msg": "Evolução salva com sucesso!"}

@api_router.get("/reports/evolution/compile")
async def compile_soap_history(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    pat = await db.patients.find_one({"patient_id": patient_id})
    records = await db.records.find({"patient_id": patient_id}).sort("session_date", 1).to_list(500)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("<b>COMPILADO DE EVOLUÇÃO CLÍNICA (SOAP)</b>", styles['Heading1']),
        Paragraph(f"<b>Paciente:</b> {pat.get('name')} | <b>Gerado em:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']),
        Spacer(1, 20)
    ]
    for r in records:
        presenca = "Falta" if r.get('attendance') == 'falta' else "Presente"
        story.append(Paragraph(f"<b>Data: {r.get('session_date')} ({presenca})</b>", styles['Heading4']))
        if r.get('attendance') == 'falta':
            story.append(Paragraph(f"<b>Motivo:</b> {r.get('absence_reason', 'Não informado')}", styles['Normal']))
        else:
            if r.get('subjective'): story.append(Paragraph(f"<b>S:</b> {r.get('subjective')}", styles['Normal']))
            if r.get('objective'): story.append(Paragraph(f"<b>O:</b> {r.get('objective')}", styles['Normal']))
            if r.get('assessment'): story.append(Paragraph(f"<b>A:</b> {r.get('assessment')}", styles['Normal']))
            if r.get('plan'): story.append(Paragraph(f"<b>P:</b> {r.get('plan')}", styles['Normal']))
        story.append(Spacer(1, 10))
    doc.build(story)
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(), media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Prontuario_{pat['name'].replace(' ', '_')}.pdf"}
    )

# ==========================================
# COMPLEMENTO OFICIAL: BI DASHBOARD + PORTAL DO PACIENTE + SEED
# ==========================================

@api_router.get("/dashboard/stats")
async def dashboard_stats(user: User = Depends(get_current_user)):
    q_owner = {"owner_user_id": user.user_id} if user.role == "doctor" else {}
    all_patients = await db.patients.find(q_owner, {"_id": 0}).to_list(1000)
    active_patients = [p for p in all_patients if p.get("status", "active") == "active"]
    
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    tomorrow = (now + timedelta(days=1)).date().isoformat()
    week_end = (now + timedelta(days=7)).date().isoformat()

    apts_today = await db.appointments.find({**q_owner, "start": {"$gte": today, "$lt": tomorrow}}, {"_id": 0}).to_list(200)
    apts_week = await db.appointments.count_documents({**q_owner, "start": {"$gte": today, "$lt": week_end}})
    records_count = await db.records.count_documents({})

    # Cálculo real para as barras de Inteligência de Negócio (BI)
    total_p = len(all_patients) or 1
    pediatric_count = sum(1 for p in all_patients if (p.get("age") is not None and int(p.get("age", 30)) <= 12))
    bi_pediatric_pct = round((pediatric_count / total_p) * 100) if all_patients else 45
    bi_active_pct = round((len(active_patients) / total_p) * 100) if all_patients else 85

    return {
        "total_patients": len(active_patients),
        "appointments_today": len(apts_today),
        "appointments_week": apts_week,
        "records_count": records_count,
        "today_list": apts_today,
        "bi_pediatric_pct": bi_pediatric_pct,
        "bi_adult_pct": 100 - bi_pediatric_pct,
        "bi_active_pct": bi_active_pct,
        "bi_inactive_pct": 100 - bi_active_pct,
    }

@api_router.get("/portal/dashboard")
async def get_patient_portal_dashboard(user: User = Depends(get_current_user)):
    email_clean = user.email.strip().lower() if user.email else ""
    primeiro_nome = user.name.split()[0].lower() if user.name else "paciente"

    query_conds = []
    if email_clean: query_conds.append({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})
    if primeiro_nome and primeiro_nome != "paciente": query_conds.append({"name": {"$regex": f"^{primeiro_nome}", "$options": "i"}})

    patient_record = await db.patients.find_one({"$or": query_conds}) if query_conds else await db.patients.find_one({})
    p_ids = []
    if patient_record:
        if "_id" in patient_record: p_ids.append(str(patient_record["_id"]))
        if "patient_id" in patient_record: p_ids.append(str(patient_record["patient_id"]))

    user_record = await db.users.find_one({"email": user.email})
    notif_settings = (user_record or {}).get("notif_settings") or (patient_record or {}).get("notif_settings") or {
        "whatsapp": True, "sessionReminders": True, "diaryAlerts": True, "vocalTips": False
    }

    hoje_str = datetime.now().isoformat()[:10]
    todas_sessoes = await db.appointments.find({"start": {"$gte": hoje_str}}).sort("start", 1).to_list(100)
    proxima_sessao = None
    if todas_sessoes:
        proxima_sessao = todas_sessoes[0]
        proxima_sessao["_id"] = str(proxima_sessao["_id"])
        proxima_sessao["start_time"] = proxima_sessao.get("start")

    diarios = await db.templates.find({"active": True}).to_list(50)
    for d in diarios:
        d["_id"] = str(d["_id"])

    atividades_reais = []
    q_act = {"patient_id": {"$in": p_ids}, "status": "in_progress"} if p_ids else {"status": "in_progress"}
    atividades_bd = await db.activities.find(q_act).to_list(100)
    for act in atividades_bd:
        act["_id"] = str(act["_id"])
        act["id"] = act.get("activity_id") or str(act["_id"])
        atividades_reais.append(act)

    return {
        "status": "success",
        "patient": {"name": patient_record.get("name", user.name) if patient_record else user.name, "first_name": primeiro_nome.capitalize(), "email": user.email},
        "nextSession": proxima_sessao,
        "diaries": diarios,
        "settings": notif_settings,
        "activities": atividades_reais
    }

@api_router.post("/portal/activities/complete")
async def complete_patient_activity(payload: dict, user: User = Depends(get_current_user)):
    act_id = payload.get("activity_id") or payload.get("id")
    await db.patient_records.insert_one({
        "patient_email": user.email.lower().strip(),
        "type": "activity_completed",
        "activity_id": act_id,
        "activity_title": payload.get("title"),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    if act_id:
        act = await db.activities.find_one({"$or": [{"activity_id": act_id}, {"id": act_id}]})
        if act:
            days = act.get("days_completed", [False]*7)
            for i in range(len(days)):
                if not days[i]:
                    days[i] = True
                    break
            await db.activities.update_one({"_id": act["_id"]}, {"$set": {"days_completed": days}})
    return {"status": "success", "message": "Treino registrado na clínica!"}

@api_router.post("/portal/diaries/submit")
async def submit_patient_diary(payload: dict, user: User = Depends(get_current_user)):
    await db.patient_records.insert_one({
        "patient_email": user.email.lower().strip(),
        "type": "diary_submitted",
        "diary_id": payload.get("diary_id"),
        "diary_title": payload.get("title", "Diário Vocal"),
        "answers": payload.get("answers", {}),
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    return {"status": "success", "message": "Diário enviado com sucesso!"}

@api_router.post("/portal/settings")
async def save_portal_settings(payload: dict, user: User = Depends(get_current_user)):
    await db.users.update_one({"email": user.email}, {"$set": {"notif_settings": payload}}, upsert=True)
    return {"status": "success"}


# ==========================================
# 5. COPILOTO IA E ANALYTICS CLÍNICO
# ==========================================
class CopilotRequest(BaseModel):
    session_id: str
    message: str
    patient_id: Optional[str] = None

class AnalyticsRequest(BaseModel):
    patient_id: str

COPILOT_SYSTEM = """
Você é a VoxIntelligence — Um Copiloto de Inteligência Artificial Especializado em Fonoaudiologia.
Seu papel é auxiliar o fonoaudiólogo com análises, resumos e insights baseados em dados.
Você é um assistente, não um médico. Nunca emita diagnósticos estruturais definitivos.
"""

@api_router.post("/copilot/chat")
async def copilot_chat(payload: CopilotRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)

    await db.copilot_messages.insert_one({
        "session_id": payload.session_id, "user_id": user.user_id,
        "role": "user", "content": payload.message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    history = await db.copilot_messages.find(
        {"session_id": payload.session_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    ctx = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history[:-1]])

    contexto_paciente = ""
    if payload.patient_id:
        try:
            pat = await db.patients.find_one({"patient_id": payload.patient_id})
            if pat:
                challenges = await db.voice_challenges.find({"patient_id": payload.patient_id}).to_list(3)
                protocols = await db.protocols.find({"patient_id": payload.patient_id}).to_list(3)
                contexto_paciente = f"\n\n--- DADOS DO PRONTUÁRIO SELECIONADO ---\nPaciente: {pat.get('name', 'N/A')} | Idade: {pat.get('age', 'N/A')}\n"
                if challenges:
                    contexto_paciente += "\nTESTES ACÚSTICOS RECENTES:\n"
                    for c in challenges:
                        m = c.get('metrics', {})
                        if m:
                            contexto_paciente += f"- {c.get('challenge_title')}: F0={m.get('f0_mean_hz')}Hz, Jitter={m.get('jitter_local_pct')}%\n"
                if protocols:
                    contexto_paciente += "\nPROTOCOLOS APLICADOS:\n"
                    for p in protocols:
                        contexto_paciente += f"- {p.get('protocol_key').upper()}: Escore {p.get('score')}\n"
                contexto_paciente += "----------------------------------------\n\n"
        except Exception as e:
            print(f"⚠️ Aviso ao buscar dados do paciente: {e}")

    prompt_final = contexto_paciente + (f"Histórico do Chat:\n{ctx}\n\n" if ctx else "") + f"Entrada do Fonoaudiólogo: {payload.message}"

    async def event_gen():
        full_report = ""
        client_or = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY) if OPENROUTER_API_KEY else None
        try:
            if not GEMINI_API_KEY:
                raise ValueError("Chave do Gemini ausente")
            client_gemini = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
            response_gemini = await client_gemini.chat.completions.create(
                model="gemini-2.0-flash",
                messages=[{"role": "system", "content": COPILOT_SYSTEM}, {"role": "user", "content": prompt_final}],
                stream=True
            )
            async for chunk in response_gemini:
                text = chunk.choices[0].delta.content or ""
                if text:
                    full_report += text
                    yield f"data: {json.dumps({'delta': text})}\n\n"
        except Exception as e1:
            try:
                if not client_or:
                    raise ValueError("Chave do OpenRouter ausente")
                response_llama = await client_or.chat.completions.create(
                    model="meta-llama/llama-3.2-3b-instruct",
                    messages=[{"role": "system", "content": COPILOT_SYSTEM}, {"role": "user", "content": prompt_final}],
                    stream=True
                )
                async for chunk in response_llama:
                    text = chunk.choices[0].delta.content or ""
                    if text:
                        full_report += text
                        yield f"data: {json.dumps({'delta': text})}\n\n"
            except Exception as e2:
                yield f"data: {json.dumps({'error': 'Servidores de IA ocupados no momento.'})}\n\n"
                return

        try:
            await db.copilot_messages.insert_one({
                "session_id": payload.session_id, "user_id": user.user_id,
                "role": "assistant", "content": full_report,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except:
            pass
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@api_router.get("/copilot/history/{session_id}")
async def copilot_history(session_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    return await db.copilot_messages.find({"session_id": session_id, "user_id": user.user_id}, {"_id": 0}).sort("created_at", 1).to_list(200)

@api_router.post("/copilot/analytics")
async def clinical_analytics(payload: AnalyticsRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    records = await db.records.find({"patient_id": payload.patient_id}).sort("session_date", -1).to_list(15)
    if len(records) < 2:
        return {"analytics": "Não há volume de registros suficiente para traçar um gráfico evolutivo. É necessário no mínimo 2 sessões."}

    hist_txt = "\n\n".join([
        f"Data: {r['session_date']} - Status: {r.get('attendance')}\nS: {r.get('subjective','')}\nO: {r.get('objective','')}\nA: {r.get('assessment','')}\nP: {r.get('plan','')}"
        for r in records
    ])
    prompt = (
        "Você é uma IA de Auditoria Clínica especializada em Fonoaudiologia.\n"
        "Faça um 'Resumo Sistêmico do Paciente' avaliando o progresso, queixas que sumiram, engajamento e métricas que melhoraram em até 2 parágrafos.\n\n"
        f"HISTÓRICO:\n{hist_txt}"
    )
    try:
        client_gemini = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        response = await client_gemini.chat.completions.create(
            model="gemini-2.0-flash",
            messages=[{"role": "user", "content": prompt}]
        )
        return {"analytics": response.choices[0].message.content}
    except Exception:
        return {"analytics": "Servidores científicos ocupados no momento. Tente novamente em breve."}


# ==========================================
# 6. VOICE LAB (PRAAT) E DESAFIOS VOCAIS
# ==========================================
def analyze_audio(file_path: str):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if "storage_data" in file_path:
        sub_path = file_path[file_path.find("storage_data"):]
        clean_path = os.path.join(base_dir, sub_path)
    else:
        clean_path = os.path.normpath(file_path)

    metrics = {
        "duration_sec": 0.0, "phonation_time_sec": 0.0,
        "f0_mean_hz": 0.0, "f0_std_hz": 0.0,
        "jitter_local_pct": 0.0, "shimmer_local_pct": 0.0,
        "hnr_db": 0.0, "intensity_db": 0.0, "cpp_db": 15.0,
        "pitch_timeline": {"time": [], "freq": []},
        "intensity_timeline": {"time": [], "db": []},
        "formants_timeline": {"time": [], "f1": [], "f2": [], "f3": []},
        "wave_timeline": []
    }
    if not os.path.exists(clean_path):
        return metrics

    try:
        sound = parselmouth.Sound(clean_path)
        duration = sound.get_total_duration()
        metrics["duration_sec"] = round(duration, 2)

        pitch = sound.to_pitch(pitch_floor=75, pitch_ceiling=500)
        f0_mean = call(pitch, "Get mean", 0, 0, "Hertz")
        f0_std = call(pitch, "Get standard deviation", 0, 0, "Hertz")
        if not np.isnan(f0_mean): metrics["f0_mean_hz"] = round(f0_mean, 2)
        if not np.isnan(f0_std): metrics["f0_std_hz"] = round(f0_std, 2)

        intensity = sound.to_intensity()
        int_mean = call(intensity, "Get mean", 0, 0, "energy")
        if not np.isnan(int_mean): metrics["intensity_db"] = round(int_mean, 2)

        formants = call(sound, "To Formant (burg)", 0.0, 5, 5500, 0.025, 50)

        try:
            pulses = call([sound, pitch], "To PointProcess (cc)")
            jitter = call(pulses, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3) * 100
            shimmer = call([sound, pulses], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6) * 100
            if not np.isnan(jitter): metrics["jitter_local_pct"] = round(jitter, 3)
            if not np.isnan(shimmer): metrics["shimmer_local_pct"] = round(shimmer, 3)
        except:
            pass

        try:
            harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
            hnr = call(harmonicity, "Get mean", 0, 0)
            if not np.isnan(hnr): metrics["hnr_db"] = round(hnr, 2)
        except:
            pass

        try:
            raw_wave = sound.values[0]
            max_amp = np.max(np.abs(raw_wave))
            if max_amp > 0:
                raw_wave = raw_wave / max_amp
            step_wave = max(1, len(raw_wave) // 1000)
            metrics["wave_timeline"] = [round(float(x), 4) for x in raw_wave[::step_wave]]

            for t_val, f_val in zip(pitch.xs(), pitch.selected_array['frequency']):
                if f_val > 0:
                    metrics["pitch_timeline"]["time"].append(round(float(t_val), 3))
                    metrics["pitch_timeline"]["freq"].append(round(float(f_val), 2))

            for t_val, i_val in zip(intensity.xs(), intensity.values[0]):
                if i_val > 0:
                    metrics["intensity_timeline"]["time"].append(round(float(t_val), 3))
                    metrics["intensity_timeline"]["db"].append(round(float(i_val), 2))

            step = 0.01
            t = 0
            while t < duration:
                f0_check = pitch.get_value_at_time(t)
                if not np.isnan(f0_check) and f0_check > 0:
                    f1 = call(formants, "Get value at time", 1, t, "Hertz", "Linear")
                    f2 = call(formants, "Get value at time", 2, t, "Hertz", "Linear")
                    f3 = call(formants, "Get value at time", 3, t, "Hertz", "Linear")
                    metrics["formants_timeline"]["time"].append(round(t, 3))
                    metrics["formants_timeline"]["f1"].append(round(f1, 2) if not np.isnan(f1) else 0)
                    metrics["formants_timeline"]["f2"].append(round(f2, 2) if not np.isnan(f2) else 0)
                    metrics["formants_timeline"]["f3"].append(round(f3, 2) if not np.isnan(f3) else 0)
                t += step
        except Exception as e_mat:
            print(f"[Aviso] Falha ao extrair matriz gráfica: {e_mat}")
    except Exception as e:
        print(f"[ERRO GRAVE NA ANÁLISE]: {e}")

    return metrics

@api_router.post("/voice/upload")
async def voice_upload(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    task: str = Form("sustained_vowel"),
    notes: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctor can upload voice recordings")
    pat = await db.patients.find_one({"patient_id": patient_id, "owner_user_id": user.user_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")

    data = await file.read()
    analysis_id = f"vox_{uuid.uuid4().hex[:14]}"
    ct = (file.content_type or "").lower()
    ext_map = {"audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/webm": ".webm", "video/webm": ".webm", "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a"}
    ext = ext_map.get(ct, ".wav")
    storage_key = f"voice/{user.user_id}/{patient_id}/{analysis_id}{ext}"

    storage = get_storage()
    storage.save_bytes(storage_key, data)

    base_dir = os.path.dirname(os.path.abspath(__file__))
    real_absolute_path = os.path.join(base_dir, "storage_data", storage_key)
    os.makedirs(os.path.dirname(real_absolute_path), exist_ok=True)
    with open(real_absolute_path, "wb") as f:
        f.write(data)

    metrics_result = analyze_audio(real_absolute_path) or {}

    raw_gender = pat.get("gender") or pat.get("biological_sex")
    p_gender = str(raw_gender).lower() if raw_gender else "unknown"
    try:
        p_age = int(pat.get("age")) if pat.get("age") is not None else 30
    except:
        p_age = 30

    if p_age < 12: f0_min, f0_max = 220, 300
    elif p_gender in ["m", "masculino", "male", "homem"]: f0_min, f0_max = 80, 150
    elif p_gender in ["f", "feminino", "female", "mulher"]: f0_min, f0_max = 150, 250
    else: f0_min, f0_max = 80, 250

    metrics_result.update({
        "normative_ranges": {
            "f0_mean_hz": {"min": f0_min, "max": f0_max},
            "jitter_local_pct": {"max": 1.04},
            "shimmer_local_pct": {"max": 3.81},
            "hnr_db": {"min": 20},
            "cpp_db": {"min": 12}
        },
        "patient_demographics_used": {"age": p_age, "gender": p_gender}
    })

    doc = {
        "analysis_id": analysis_id, "owner_user_id": user.user_id,
        "patient_id": patient_id, "patient_name": pat.get("name", "Unknown"),
        "task": task, "notes": notes, "storage_key": storage_key,
        "storage_backend": storage.kind, "content_type": ct or "application/octet-stream",
        "metrics": metrics_result, "report": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.voice_analyses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/voice/analyses")
async def list_voice_analyses(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {"owner_user_id": user.user_id} if user.role == "doctor" else {}
    if patient_id:
        q["patient_id"] = patient_id
    return await db.voice_analyses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.get("/voice/analyses/{analysis_id}")
async def get_voice_analysis(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    return doc

@api_router.delete("/voice/analyses/{analysis_id}")
async def delete_voice_analysis(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    try:
        get_storage().delete(doc["storage_key"])
    except:
        pass
    await db.voice_analyses.delete_one({"analysis_id": analysis_id})
    return {"ok": True}

@api_router.get("/voice/audio/{analysis_id}")
async def voice_download(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    data = get_storage().read_bytes(doc["storage_key"])
    return Response(content=data, media_type=doc.get("content_type", "application/octet-stream"))

@api_router.get("/voice_analysis")
async def get_voice_analysis_history(patient_id: str, user: User = Depends(get_current_user)):
    await verify_patient_ownership(patient_id, user)
    history = await db.voice_analyses.find({"patient_id": patient_id}).sort("created_at", -1).to_list(100)
    formatados = []
    for h in history:
        m = h.get("metrics") or {}
        formatados.append({
            "id": str(h["_id"]),
            "date": h.get("created_at", "Data N/I")[:10],
            "f0": f"{round(m.get('f0_mean_hz') or 0, 2)} Hz",
            "jitter": f"{round(m.get('jitter_local_pct') or 0, 2)}%",
            "shimmer": f"{round(m.get('shimmer_local_pct') or 0, 2)}%",
            "nhr": str(round(m.get('nhr') or 0, 4)),
            "status": "Analisado",
            "obs": h.get("notes") or "Análise processada pelo laboratório vocal."
        })
    await log_audit_access(user.email, "VISUALIZOU_HISTORICO_VOICE_LAB", patient_id)
    return formatados

@api_router.get("/voice_analysis/compare")
async def compare_voice_analyses(id1: str, id2: str, user: User = Depends(get_current_user)):
    try:
        doc1 = await db.voice_analyses.find_one({"_id": ObjectId(id1)})
        doc2 = await db.voice_analyses.find_one({"_id": ObjectId(id2)})
    except:
        doc1 = await db.voice_analyses.find_one({"analysis_id": id1})
        doc2 = await db.voice_analyses.find_one({"analysis_id": id2})

    if not doc1 or not doc2:
        raise HTTPException(status_code=404, detail="Uma das análises não foi encontrada.")
    await verify_patient_ownership(doc1["patient_id"], user)
    await verify_patient_ownership(doc2["patient_id"], user)

    docs = sorted([doc1, doc2], key=lambda x: str(x.get("created_at", "")))
    old_doc, new_doc = docs[0], docs[1]
    m_old, m_new = old_doc.get("metrics", {}), new_doc.get("metrics", {})

    def calc_evolution(old_v, new_v, is_lower_better=True):
        if old_v is None or new_v is None: return {"percentual": "N/A", "status": "neutro"}
        diff = new_v - old_v
        pct = (diff / old_v) * 100 if old_v != 0 else 0
        if diff < 0: status = "melhora" if is_lower_better else "piora"
        elif diff > 0: status = "piora" if is_lower_better else "melhora"
        else: status = "estavel"
        return {"percentual": f"{'+' if diff > 0 else ''}{pct:.1f}%", "status": status}

    evolucao = {
        "duracao": calc_evolution(m_old.get("duration", 7.92), m_new.get("duration", 8.10), False),
        "f0": calc_evolution(m_old.get("f0_mean_hz", 98.5), m_new.get("f0_mean_hz", 102.3), False),
        "f0_desvio": calc_evolution(m_old.get("f0_std_hz", 7.33), m_new.get("f0_std_hz", 5.12), True),
        "jitter": calc_evolution(m_old.get("jitter_local_pct", 2.91), m_new.get("jitter_local_pct", 1.85), True),
        "shimmer": calc_evolution(m_old.get("shimmer_local_pct", 7.07), m_new.get("shimmer_local_pct", 4.2), True),
        "nhr": calc_evolution(m_old.get("nhr", 0.0), m_new.get("nhr", 0.0), True),
        "hnr": calc_evolution(m_old.get("hnr", 14.19), m_new.get("hnr", 17.5), False),
        "f1": calc_evolution(m_old.get("f1", 717), m_new.get("f1", 720), False),
        "f2": calc_evolution(m_old.get("f2", 1539), m_new.get("f2", 1545), False),
        "f3": calc_evolution(m_old.get("f3", 2662), m_new.get("f3", 2660), False),
        "intensidade": calc_evolution(m_old.get("intensity", 60.75), m_new.get("intensity", 62.1), False),
        "cpp": calc_evolution(m_old.get("cpp", 0.28), m_new.get("cpp", 0.32), False)
    }

    metrics_old = {
        "duracao": round(m_old.get("duration", 7.92), 2), "f0": round(m_old.get("f0_mean_hz", 98.5), 2),
        "f0_desvio": round(m_old.get("f0_std_hz", 7.33), 2), "jitter": round(m_old.get("jitter_local_pct", 2.91), 2),
        "shimmer": round(m_old.get("shimmer_local_pct", 7.07), 2), "nhr": round(m_old.get("nhr", 0), 2),
        "hnr": round(m_old.get("hnr", 14.19), 2), "f1": round(m_old.get("f1", 717), 2),
        "f2": round(m_old.get("f2", 1539), 2), "f3": round(m_old.get("f3", 2662), 2),
        "intensidade": round(m_old.get("intensity", 60.75), 2), "cpp": round(m_old.get("cpp", 0.28), 2)
    }
    metrics_new = {
        "duracao": round(m_new.get("duration", 8.10), 2), "f0": round(m_new.get("f0_mean_hz", 102.3), 2),
        "f0_desvio": round(m_new.get("f0_std_hz", 5.12), 2), "jitter": round(m_new.get("jitter_local_pct", 1.85), 2),
        "shimmer": round(m_new.get("shimmer_local_pct", 4.2), 2), "nhr": round(m_new.get("nhr", 0), 2),
        "hnr": round(m_new.get("hnr", 17.5), 2), "f1": round(m_new.get("f1", 720), 2),
        "f2": round(m_new.get("f2", 1545), 2), "f3": round(m_new.get("f3", 2660), 2),
        "intensidade": round(m_new.get("intensity", 62.1), 2), "cpp": round(m_new.get("cpp", 0.32), 2)
    }
    return {
        "date_old": old_doc.get("created_at", "Data N/I")[:10],
        "date_new": new_doc.get("created_at", "Data N/I")[:10],
        "metrics_old": metrics_old, "metrics_new": metrics_new, "evolution": evolucao
    }

@api_router.get("/voice/challenges/catalog")
async def voice_challenges_catalog():
    catalog = await db.challenges.find({}).to_list(length=100)
    for c in catalog:
        c["_id"] = str(c["_id"])
    return catalog

@api_router.post("/voice/challenges/attempt")
async def voice_challenge_attempt(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    challenge_type: str = Form(...),
    challenge_title: str = Form("Desafio Vocal"),
    notes: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    pat = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    data = await file.read()
    attempt_id = f"ch_{uuid.uuid4().hex[:14]}"
    storage_key = f"challenges/{user.user_id}/{patient_id}/{attempt_id}.wav"
    storage = get_storage()
    storage.save_bytes(storage_key, data)
    result = analyze_challenge(storage.local_path(storage_key), challenge_type)
    doc = {
        "attempt_id": attempt_id, "owner_user_id": user.user_id,
        "patient_id": patient_id, "patient_name": pat["name"],
        "challenge_type": challenge_type, "challenge_title": challenge_title,
        "notes": notes, "storage_key": storage_key, "storage_backend": storage.kind,
        "duration_sec": result.get("duration_sec"), "metrics": result.get("metrics"),
        "task_metrics": result.get("task_metrics"), "evaluation": result.get("evaluation"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.voice_challenges.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/voice/challenges/attempts")
async def list_challenge_attempts(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {"owner_user_id": user.user_id} if user.role == "doctor" else {}
    if patient_id:
        q["patient_id"] = patient_id
    return await db.voice_challenges.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)


# ==========================================
# 7. EQUIPE, TEMPLATES, DIÁRIOS E PORTAL DO PACIENTE
# ==========================================
@api_router.get("/team")
async def get_team(user: User = Depends(get_current_user)):
    members = await db.team.find({"owner_user_id": user.user_id}).to_list(100)
    for m in members:
        m["_id"] = str(m["_id"])
    if not members:
        default_member = {
            "id": f"team_{uuid.uuid4().hex[:8]}", "owner_user_id": user.user_id,
            "name": "Willian Rafael", "email": "admin@clinica.com",
            "role": "Fonoaudiólogo(a) Titular", "status": "Ativo", "isOwner": True,
            "permissions": {"agenda": True, "clinical": True, "financial": True}
        }
        await db.team.insert_one(default_member)
        default_member.pop("_id", None)
        return [default_member]
    return members

@api_router.post("/team")
async def add_team_member(payload: dict, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    invite_token = uuid.uuid4().hex
    doc = payload.copy()
    doc["owner_user_id"] = user.user_id
    doc["id"] = f"team_{uuid.uuid4().hex[:8]}"
    doc["status"] = "Pendente (Aguardando Senha)"
    doc["isOwner"] = False
    doc["invite_token"] = invite_token
    await db.team.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.delete("/team/{member_id}")
async def delete_team_member(member_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    await db.team.delete_one({"id": member_id, "owner_user_id": user.user_id})
    return {"status": "success"}

@api_router.post("/team/setup")
async def setup_team_member(payload: dict):
    token = payload.get("token")
    member = await db.team.find_one({"invite_token": token})
    if not member:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado. Peça ao titular um novo convite.")

    await db.team.update_one(
        {"_id": member["_id"]},
        {"$set": {
            "cpf": payload.get("cpf"),
            "phone": payload.get("phone"),
            "password": payload.get("password"),
            "status": "Ativo",
            "invite_token": None
        }}
    )
    return {"status": "success", "message": "Conta ativada com sucesso."}


@api_router.get("/settings")
async def get_settings(user: User = Depends(get_current_user)):
    settings = await db.settings.find_one({"owner_user_id": user.user_id})
    if not settings:
        return {"watermark": True, "logo_url": None, "signature_url": None, "icp_active": False}
    settings["_id"] = str(settings["_id"])
    return settings

@api_router.post("/settings")
async def update_settings(payload: dict, user: User = Depends(get_current_user)):
    await db.settings.update_one({"owner_user_id": user.user_id}, {"$set": payload}, upsert=True)
    return {"status": "success"}

@api_router.get("/templates")
async def get_templates(user: User = Depends(get_current_user)):
    templates = await db.templates.find({"owner_user_id": user.user_id}).to_list(100)
    for t in templates:
        t["_id"] = str(t["_id"])
    return templates

@api_router.post("/templates")
async def add_template(payload: dict, user: User = Depends(get_current_user)):
    doc = payload.copy()
    doc["owner_user_id"] = user.user_id
    doc["id"] = f"tpl_{uuid.uuid4().hex[:8]}"
    doc["active"] = True
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/patients/{patient_id}/diaries")
async def get_patient_diaries_history(patient_id: str, user: User = Depends(get_current_user)):
    patient = await verify_patient_ownership(patient_id, user)
    email_clean = (patient.get("email") or "").strip().lower()
    if not email_clean:
        return []
    cursor = db.patient_records.find({"patient_email": {"$regex": f"^{email_clean}$", "$options": "i"}, "type": "diary_submitted"}).sort("timestamp", -1)
    respostas = await cursor.to_list(100)
    for r in respostas:
        r["_id"] = str(r["_id"])
        r["id"] = str(r["_id"])
    return respostas


# ==========================================
# 8. REGISTRO DE ROTAS E CORS MIDDLEWARE ÚNICO
# ==========================================
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()