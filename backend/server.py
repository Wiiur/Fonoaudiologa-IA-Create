from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header, UploadFile, BackgroundTasks, File, Form
from fastapi.responses import StreamingResponse, FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import json
import tempfile
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from uuid import uuid4
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone, timedelta, date
import anthropic
import traceback
import io

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from openai import AsyncOpenAI
from google import genai

import csv

import shutil
from datetime import date


from fastapi.staticfiles import StaticFiles 

#from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
#from emergentintegrations.payments.stripe.checkout import (    StripeCheckout, CheckoutSessionRequest,)

from storage import get_storage
from voice_analysis import analyze_audio, build_clinical_prompt, analyze_challenge, CHALLENGE_CATALOG

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

 #if GEMINI_API_KEY:
# #    genai.configure(api_key=GEMINI_API_KEY)

# #STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

app = FastAPI()
api_router = APIRouter(prefix="/api")


## CORS
os.makedirs("uploads", exist_ok=True)
# Diz para o FastAPI: "Tudo que estiver na pasta uploads pode ser acessado pelo navegador"
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")



# ---------- Models ----------
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Literal["doctor", "secretary", "patient", "unassigned"] = "unassigned"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RoleSelect(BaseModel):
    role: Literal["doctor", "secretary"]
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
    
    # Dados Pessoais & Fotos
    photo_url: Optional[str] = None
    name: str
    birth_date: Optional[str] = None  # YYYY-MM-DD
    age: Optional[int] = None         # Calculado no frontend/backend
    rg_cpf: Optional[str] = None
    biological_sex: Optional[Literal["masculino", "feminino"]] = "feminino"
    gender_identity: Optional[str] = "Cisgênero"
    
    # Contato & Endereço
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    
    # Responsável Legal (se aplicável)
    has_responsible: bool = False
    responsible: Optional[ResponsibleInfo] = None
    
    # Demanda & Saúde Vocal
    profession_vocal_demand: Optional[str] = None
    chief_complaint: Optional[str] = None
    otorrhoea_diagnosis: Optional[str] = None  # Diagnóstico Otorrino
    interests: Optional[str] = None             # Usado pela IA
    notes: Optional[str] = None
    
    # Controle da Clínica
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
    patient_id: str
    start: str
    end: str
    mode: Literal["clinic", "telehealth"] = "clinic"
    notes: Optional[str] = None


from typing import Optional # Caso ainda não tenha importado no topo do arquivo

class SoapRecord(BaseModel):
    record_id: str = Field(default_factory=lambda: f"rec_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    patient_id: str
    session_date: str
    attendance: str = "presente"         # NOVO: Marca se veio ou faltou
    absence_reason: Optional[str] = None # NOVO: Motivo da falta
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SoapCreate(BaseModel):
    patient_id: str
    session_date: str
    attendance: str = "presente"         # NOVO: Recebe do React se veio ou faltou
    absence_reason: Optional[str] = None # NOVO: Recebe o motivo
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""


class Activity(BaseModel):
    activity_id: str = Field(default_factory=lambda: f"act_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    patient_id: Optional[str] = None
    patient_name: Optional[str] = None
    diagnosis: str
    environment: Literal["clinic", "home"] = "home"
    age_group: str = "adult"
    title: str
    content: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ActivityRequest(BaseModel):
    patient_id: Optional[str] = None
    diagnosis: str
    environment: Literal["clinic", "home"]
    age_group: str
    goals: Optional[str] = None
    interests: Optional[str] = None


class ReportRequest(BaseModel):
    patient_id: str
    recipient: Optional[str] = None
    purpose: Optional[str] = None


# ---------- Auth helpers ----------
async def get_current_user(
    session_token: Optional[str] = Cookie(default=None),
    authorization: Optional[str] = Header(default=None),
    dev_user_id: Optional[str] = Header(default=None, alias="user-id"), # <-- Puxa o hack do React
) -> User:
    
    # 1. MODO DESENVOLVEDOR (Ativado pelo nosso Frontend Local)
    if dev_user_id:
        return User(
            user_id=dev_user_id,
            role="doctor", 
            email="dev@clinica.com",
            name="Willian Rafael de Oliveira"
        )

    # 2. FLUXO NORMAL E SEGURO (Produção)
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


# ---------- Auth Routes ----------
@api_router.post("/auth/session")
async def create_session(request: Request, response: Response):
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
        raise HTTPException(status_code=401, detail="Invalid Emergent session")
    data = r.json()

    email = data["email"]
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": data.get("name", existing["name"]), "picture": data.get("picture")}},
        )
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one(
            {
                "user_id": user_id,
                "email": email,
                "name": data.get("name", email),
                "picture": data.get("picture"),
                "role": "unassigned",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        )

    session_token = data["session_token"]
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one(
        {
            "user_id": user_id,
            "session_token": session_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60,
    )
    # Auto-link: if a patient exists with this email, link the user
    matching_patient = await db.patients.find_one({"email": email}, {"_id": 0})
    if matching_patient and not matching_patient.get("linked_user_id"):
        await db.patients.update_one(
            {"patient_id": matching_patient["patient_id"]},
            {"$set": {"linked_user_id": user_id}},
        )
        current = await db.users.find_one({"user_id": user_id}, {"_id": 0})
        if current and current.get("role") == "unassigned":
            await db.users.update_one({"user_id": user_id}, {"$set": {"role": "patient"}})
    user_doc = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"user": user_doc}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@api_router.post("/auth/logout")
async def logout(response: Response, session_token: Optional[str] = Cookie(default=None)):
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


class ProfileUpdate(BaseModel):
    crfa_number: Optional[str] = None
    crfa_state: Optional[str] = None
    professional_name: Optional[str] = None


@api_router.patch("/auth/profile")
async def update_profile(payload: ProfileUpdate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctor can update CRFa profile")
    if not payload.crfa_number or not payload.crfa_state or not payload.professional_name:
        raise HTTPException(status_code=400, detail="All CRFa fields required")
    import re
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
        # CRFa format: 1-6 digits + optional /UF (state)
        import re
        if not re.fullmatch(r"\d{1,6}", payload.crfa_number.strip()):
            raise HTTPException(status_code=400, detail="CRFa number must be 1-6 digits")
        update.update({
            "crfa_number": payload.crfa_number.strip(),
            "crfa_state": payload.crfa_state.strip().upper(),
            "professional_name": payload.professional_name.strip(),
        })
    await db.users.update_one({"user_id": user.user_id}, {"$set": update})
    updated = await db.users.find_one({"user_id": user.user_id}, {"_id": 0})
    return updated


# ---------- Patients ----------
@api_router.get("/patients")
async def list_patients(user: User = Depends(get_current_user)):
    if user.role == "doctor":
        docs = await db.patients.find({"owner_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    elif user.role == "secretary":
        docs = await db.patients.find({}, {"_id": 0}).to_list(1000)
    elif user.role == "patient":
        docs = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(1000)
    else:
        docs = []
    return docs


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
    # Busca o paciente no banco de dados pelo ID
    patient = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")
        
    # Garante que o médico só possa ver os próprios pacientes (Segurança)
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

# ==========================================
# MODELO DE DADOS PARA ATIVIDADES
# ==========================================
class ActivityCreate(BaseModel):
    patient_id: str
    title: str
    type: str # 'casa' ou 'clinica'
    description: str
    status: str = "in_progress"

# ==========================================
# ROTAS PARA ATIVIDADES
# ==========================================
@api_router.post("/activities")
async def create_activity(activity: ActivityCreate):
    new_activity = activity.model_dump()
    new_activity["activity_id"] = f"act_{uuid4().hex[:8]}"
    new_activity["start_date"] = date.today().isoformat()
    
    # Se for de clínica, já nasce concluída. Se for para casa, nasce em andamento com 7 dias.
    if new_activity["type"] == "clinica":
        new_activity["status"] = "completed"
    else:
        new_activity["status"] = "in_progress"
        
    new_activity["days_total"] = 7
    new_activity["days_completed"] = [False, False, False, False, False, False, False]
    
    await db.activities.insert_one(new_activity)
    del new_activity["_id"]
    return new_activity

@api_router.get("/activities")
async def get_activities(patient_id: str):
    activities = await db.activities.find({"patient_id": patient_id}).to_list(100)
    for a in activities:
        a["_id"] = str(a["_id"])
    return activities

# --------- MODELO DE DADOS PARA PASTAS -------------

class FolderCreate(BaseModel):
    patient_id: str
    name: str

# --- ROTAS PARA PASTAS-------------------------

@api_router.post("/folders")
async def create_folder(folder: FolderCreate):
    new_folder = {
        "folder_id": f"fold_{uuid4().hex[:8]}", # Gera um ID único curto
        "patient_id": folder.patient_id,
        "name": folder.name,
        "date": date.today().isoformat()
    }
    # Salva no MongoDB
    await db.folders.insert_one(new_folder) 
    
    del new_folder["_id"] # Remove o ID nativo do Mongo para não dar erro no React
    return new_folder

@api_router.get("/folders")
async def get_folders(patient_id: str):
    folders = await db.folders.find({"patient_id": patient_id}).to_list(100)
    for f in folders:
        f["_id"] = str(f["_id"])
    return folders



# ------- ROTAS PARA ARQUIVOS (ANEXOS) --------

@api_router.post("/attachments")
async def upload_attachment(
    patient_id: str = Form(...),
    folder_id: Optional[str] = Form(None),
    file: UploadFile = File(...)
):
    try:
        # 1. Cria um nome de arquivo único para não sobrescrever arquivos com o mesmo nome
        file_ext = file.filename.split(".")[-1]
        unique_filename = f"{uuid4().hex}.{file_ext}"
        file_path = f"uploads/{unique_filename}"

        # 2. Salva o arquivo real no disco do seu computador
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 3. Calcula o tamanho em MB
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)

        # 4. Cria o documento para o MongoDB
        new_attachment = {
            "attachment_id": f"att_{uuid4().hex[:8]}",
            "patient_id": patient_id,
            "folder_id": folder_id,
            "name": file.filename,
            "type": file.content_type,
            "size": f"{file_size_mb:.2f} MB",
            "date": date.today().isoformat(),
            # O React vai ler esse file_url (ex: /uploads/abc1234.pdf)
            "file_url": f"/uploads/{unique_filename}", 
            "file_path": file_path # Guardamos o caminho interno para quando formos deletar
        }

        # 5. Salva a informação no MongoDB
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
    # 1. Busca o arquivo no MongoDB
    attachment = await db.attachments.find_one({"attachment_id": attachment_id})
    if not attachment:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    
    # 2. Deleta o arquivo real da pasta 'uploads' no disco
    if os.path.exists(attachment["file_path"]):
        os.remove(attachment["file_path"])
        
    # 3. Deleta o registro do MongoDB
    await db.attachments.delete_one({"attachment_id": attachment_id})
    return {"msg": "Arquivo deletado com sucesso"}

# ==========================================
# ROTA PARA FORÇAR O DOWNLOAD DE ARQUIVOS
# ==========================================
@api_router.get("/attachments/download")
async def force_download_attachment(file_url: str):
    # Ajusta o caminho do arquivo (remove a primeira barra para não dar erro)
    file_path = file_url.lstrip("/") 
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado no servidor")
        
    nome_arquivo = os.path.basename(file_path)
    
    # O SEGREDO: 'application/octet-stream' força o navegador a BAIXAR em vez de ABRIR a imagem
    return FileResponse(
        path=file_path, 
        filename=nome_arquivo, 
        media_type='application/octet-stream'
    )

# ==========================================
# 1. MODELO DE DADOS PARA RELATÓRIOS
# ==========================================
class ReportCreate(BaseModel):
    patient_id: str
    title: str
    content: str
    format: str
    status: str # 'draft' (rascunho) ou 'final' (finalizado)

# ==========================================
# 2. ROTAS PARA RELATÓRIOS (MONGODB)
# ==========================================

# Criar um novo relatório
@api_router.post("/reports")
async def create_report(report: ReportCreate):
    new_report = report.model_dump()
    new_report["report_id"] = f"rep_{uuid.uuid4().hex[:8]}"
    new_report["date"] = date.today().isoformat()
    
    # Salva no banco de dados
    await db.reports.insert_one(new_report)
    
    del new_report["_id"] # Remove o ID nativo do Mongo para não bugar o React
    return new_report

# Atualizar um relatório existente (Ex: salvar alterações no rascunho)
@api_router.put("/reports/{report_id}")
async def update_report(report_id: str, report: ReportCreate):
    updated_data = report.model_dump()
    updated_data["date"] = date.today().isoformat()
    
    # Procura pelo report_id e atualiza as informações
    result = await db.reports.update_one(
        {"report_id": report_id}, 
        {"$set": updated_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Relatório não encontrado")
        
    return {"msg": "Relatório atualizado com sucesso"}

# Buscar todos os relatórios de um paciente para mostrar no histórico
@api_router.get("/reports")
async def get_reports(patient_id: str):
    reports = await db.reports.find({"patient_id": patient_id}).to_list(100)
    for r in reports:
        r["_id"] = str(r["_id"])
    return reports

# Excluir um relatório
@api_router.delete("/reports/{report_id}")
async def delete_report(report_id: str):
    await db.reports.delete_one({"report_id": report_id})
    return {"msg": "Relatório deletado com sucesso"}

# ==========================================
# MODELO DE DADOS PARA PROTOCOLOS
# ==========================================
class ProtocolUpdate(BaseModel):
    patient_id: str
    protocol_key: str
    answers: Dict[str, Any]
    summary: str
    tip: str
    score: float # <--- MUDAMOS PARA FLOAT (aceita decimais como 82.5)
    domains: Optional[Dict[str, Any]] = None
    date: str

# ==========================================
# ROTAS PARA PROTOCOLOS E QUESTIONÁRIOS
# ==========================================
@api_router.post("/protocols")
async def save_protocol(protocol: ProtocolUpdate):
    data = protocol.model_dump()
    
    # SE O PROTOCOLO FOR O QVV, O BACKEND TOMA AS RÉDEAS DO CÁLCULO
    if data["protocol_key"] == "qvv":
        respostas = data.get("answers", {})
        
        # Extrai as respostas garantindo que, se faltar alguma, assume valor 1 (ou o que você preferir)
        bruto_fisico = sum([float(respostas.get(f"q{i}", 1)) for i in [1, 2, 3, 6, 7, 9]])
        bruto_socio = sum([float(respostas.get(f"q{i}", 1)) for i in [4, 5, 8, 10]])
        bruto_total = bruto_fisico + bruto_socio
        
        # Fórmulas exatas da literatura
        escore_fisico = 100 - (((bruto_fisico - 6) / 24) * 100)
        escore_socio = 100 - (((bruto_socio - 4) / 16) * 100)
        escore_total = 100 - (((bruto_total - 10) / 40) * 100)
        
        # Atualiza o dicionário com os valores reais antes de ir para o banco
        data["domains"] = {
            "fisico": round(escore_fisico, 2),
            "socio_emocional": round(escore_socio, 2),
            "total": round(escore_total, 2)
        }
        
    # Salva no MongoDB (atualiza se já existir, cria se não existir)
    await db.protocols.update_one(
        {"patient_id": data["patient_id"], "protocol_key": data["protocol_key"]},
        {"$set": data},
        upsert=True
    )
    
    # Devolve para o React o resultado já mastigado
    return {"msg": "Protocolo salvo com sucesso", "domains_calculados": data.get("domains")}

@api_router.get("/protocols")
async def get_protocols(patient_id: str):
    protocols = await db.protocols.find({"patient_id": patient_id}).to_list(100)
    
    # Prepara o formato exato que o React espera
    result = { "qvv": None, "capeV": None, "idv10": None, "esv": None }
    for p in protocols:
        key = p["protocol_key"]
        if key in result:
            result[key] = {
                "answers": p.get("answers", {}),
                "summary": p.get("summary", ""),
                "tip": p.get("tip", ""),
                "score": p.get("score", 0),
                "domains": p.get("domains"),
                "date": p.get("date", "")
            }
    return result

@api_router.delete("/protocols/{patient_id}/{protocol_key}")
async def delete_protocol(patient_id: str, protocol_key: str):
    await db.protocols.delete_one({"patient_id": patient_id, "protocol_key": protocol_key})
    return {"msg": "Protocolo resetado"}

# ---------- Appointments ----------
@api_router.get("/appointments")
async def list_appointments(user: User = Depends(get_current_user)):
    if user.role == "doctor":
        q = {"owner_user_id": user.user_id}
    elif user.role == "secretary":
        q = {}
    elif user.role == "patient":
        pats = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(100)
        ids = [p["patient_id"] for p in pats]
        q = {"patient_id": {"$in": ids}}
    else:
        q = {"_never": True}
    docs = await db.appointments.find(q, {"_id": 0}).sort("start", 1).to_list(1000)
    return docs


@api_router.post("/appointments")
async def create_appointment(payload: AppointmentCreate, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)
    pat = await db.patients.find_one({"patient_id": payload.patient_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    owner_id = pat["owner_user_id"]
    apt = Appointment(
        owner_user_id=owner_id,
        patient_id=payload.patient_id,
        patient_name=pat["name"],
        start=payload.start,
        end=payload.end,
        mode=payload.mode,
        notes=payload.notes,
    )
    d = apt.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.appointments.insert_one(d)
    d.pop("_id", None)
    return d


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


# ---------- SOAP records ----------
@api_router.get("/records")
async def get_records(patient_id: str):
    # Soro da Verdade 2: Vai avisar quem está buscando
    print(f"🔍 BUSCA: O React pediu o histórico do paciente: {patient_id}")
    
    # Busca na MESMA coleção 'records'
    cursor = db.records.find({"patient_id": patient_id})
    registros = await cursor.to_list(length=100)
    
    # Limpa o formato do ID do MongoDB para o FastAPI não travar
    for r in registros:
        r["_id"] = str(r["_id"])
        
    # Soro da Verdade 3: Vai mostrar quantos achou
    print(f"📦 RESULTADO: Encontrados {len(registros)} registros no banco para este paciente.")
    
    return registros


@api_router.post("/records")
async def create_record(record: SoapCreate):
    data = record.model_dump()
    data["record_id"] = f"rec_{uuid.uuid4().hex[:12]}"
    data["owner_user_id"] = "medico_padrao"
    data["created_at"] = datetime.now(timezone.utc).isoformat()
    
    # Salva na coleção EXATA chamada 'records'
    result = await db.records.insert_one(data)
    
    # Soro da Verdade 1: Vai gritar no terminal quando salvar!
    print(f"✅ SUCESSO: Evolução salva no banco! ID do MongoDB: {result.inserted_id}")
    
    return {"msg": "Evolução salva com sucesso!"}


# ---------- Activities ----------
@api_router.get("/activities")
async def list_activities(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {}
    if user.role == "doctor":
        q["owner_user_id"] = user.user_id
    elif user.role == "patient":
        pats = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(100)
        ids = [p["patient_id"] for p in pats]
        q["patient_id"] = {"$in": ids}
    if patient_id:
        q["patient_id"] = patient_id
    docs = await db.activities.find(q, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


ACTIVITY_SYSTEM = (
    "Você é a VoxIntelligence, uma IA sênior especializada em Fonoaudiologia baseada em evidências. "
    "Gere planos de atividades clínicas de alta qualidade, com linguagem técnica premium, "
    "estruturados em Markdown. Adapte à idade e ao diagnóstico. "
    "Nunca invente protocolos: se não houver consenso, sinalize claramente."
)


@api_router.post("/activities/generate")
async def generate_activity(payload: ActivityRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctor")
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic key missing")

    patient_name = None
    if payload.patient_id:
        pat = await db.patients.find_one({"patient_id": payload.patient_id}, {"_id": 0})
        if pat:
            patient_name = pat["name"]

    env_label = "Clínica (presencial)" if payload.environment == "clinic" else "Casa (home care)"
    prompt = (
        f"Crie um plano de atividade fonoaudiológica personalizado.\n\n"
        f"**Diagnóstico:** {payload.diagnosis}\n"
        f"**Faixa etária:** {payload.age_group}\n"
        f"**Ambiente:** {env_label}\n"
        f"**Objetivos terapêuticos:** {payload.goals or 'não informado'}\n"
        f"**Interesses do paciente:** {payload.interests or 'não informado'}\n\n"
        f"Estrutura obrigatória em Markdown:\n"
        f"# Título da Atividade\n"
        f"## Objetivo Terapêutico\n"
        f"## Materiais\n"
        f"## Instruções Passo a Passo\n"
        f"## Progressão de Dificuldade\n"
        f"## Critérios de Observação\n"
        f"## Dicas para {'terapeuta' if payload.environment == 'clinic' else 'cuidador/paciente'}\n"
        f"## Referências Científicas (se aplicável)\n"
    )

    chat = LlmChat(
        api_key=ANTHROPIC_API_KEY,
        session_id=f"activity-{uuid.uuid4().hex[:8]}",
        system_message=ACTIVITY_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    # 3. Função Geradora com Redundância
    # 5. A CASCATA DE IAs (O Motor Triplo Padronizado)
    # 5. A CASCATA DE IAs (O Motor Triplo Blindado)
    async def event_gen():
        full_report = ""
        
        # Inicia o motor OpenRouter antecipadamente para os backups
        client_or = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY) if OPENROUTER_API_KEY else None

        try:
            # ==========================================
            # 🥇 TENTATIVA 1: MOTOR PRINCIPAL (Gemini 2.0 Flash)
            # ==========================================
            if not GEMINI_API_KEY:
                raise ValueError("Chave do Gemini ausente")

            print("🚀 [IA Principal] Iniciando Google Gemini 2.0 Flash...")
            
            # O GRANDE TRUQUE: Usar a biblioteca OpenAI para acessar o Google! (É oficial e mais estável)
            client_gemini = AsyncOpenAI(
                api_key=GEMINI_API_KEY, 
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
            )
            
            prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Google Gemini 2.0 Flash ---"

            response_gemini = await client_gemini.chat.completions.create(
                model="gemini-3.6-flash", # A versão mais moderna e blindada
                messages=[
                    {"role": "system", "content": COPILOT_SYSTEM},
                    {"role": "user", "content": prompt_formatado}
                ],
                stream=True
            )
            async for chunk in response_gemini:
                text = chunk.choices[0].delta.content or ""
                if text:
                    full_report += text
                    yield f"data: {json.dumps({'delta': text})}\n\n"

        except Exception as e1:
            print(f"⚠️ Gemini falhou: {e1}. Acionando Backup 1...")
            yield f"data: {json.dumps({'delta': f'\\n\\n*[Google indisponível. Acionando IA Backup 1: Meta Llama 3.2]*\\n\\n'})}\n\n"
            
            try:
                # ==========================================
                # 🥈 TENTATIVA 2: BACKUP 1 (Llama 3.2 via OpenRouter - Grátis)
                # ==========================================
                if not client_or: raise ValueError("Chave do OpenRouter ausente")

                prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Meta Llama 3.2 ---"

                response_llama = await client_or.chat.completions.create(
                    model="meta-llama/llama-3.2-3b-instruct",
                    messages=[
                        {"role": "system", "content": COPILOT_SYSTEM},
                        {"role": "user", "content": prompt_formatado}
                    ],
                    stream=True
                )
                async for chunk in response_llama:
                    text = chunk.choices[0].delta.content or ""
                    if text:
                        full_report += text
                        yield f"data: {json.dumps({'delta': text})}\n\n"

            except Exception as e2:
                print(f"⚠️ Llama falhou: {e2}. Acionando Backup 2...")
                yield f"data: {json.dumps({'delta': f'\\n\\n*[Llama indisponível. Acionando IA Backup 2: Qwen 2.5]*\\n\\n'})}\n\n"
                
                try:
                    # ==========================================
                    # 🥉 TENTATIVA 3: BACKUP 2 (Qwen 2.5 via OpenRouter - Grátis)
                    # ==========================================
                    prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Qwen 2.5 ---"

                    response_qwen = await client_or.chat.completions.create(
                        model="qwen/qwen-2.5-7b-instruct",
                        messages=[
                            {"role": "system", "content": COPILOT_SYSTEM},
                            {"role": "user", "content": prompt_formatado}
                        ],
                        stream=True
                    )
                    async for chunk in response_qwen:
                        text = chunk.choices[0].delta.content or ""
                        if text:
                            full_report += text
                            yield f"data: {json.dumps({'delta': text})}\n\n"

                except Exception as e3:
                    print(f"❌ TODAS AS IAs FALHARAM: {e3}") 
                    yield f"data: {json.dumps({'error': 'Todos os servidores científicos estão ocupados no momento. Tente novamente em 1 minuto.'})}\n\n"
                    return

        # Salva no MongoDB
        try:
            await db.copilot_messages.insert_one({
                "session_id": payload.session_id, "user_id": user.user_id,
                "role": "assistant", "content": full_report,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except:
            pass

        yield f"data: {json.dumps({'done': True})}\n\n"


# ---------- Reports ----------
@api_router.post("/reports/generate")
async def generate_report(payload: ReportRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=500, detail="Anthropic key missing")

    pat = await db.patients.find_one({"patient_id": payload.patient_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    records = await db.soap_records.find(
        {"patient_id": payload.patient_id}, {"_id": 0}
    ).sort("session_date", 1).to_list(500)

    hist_txt = "\n\n".join(
        [
            f"### Sessão {r['session_date']}\n**S:** {r.get('subjective','')}\n**O:** {r.get('objective','')}\n**A:** {r.get('assessment','')}\n**P:** {r.get('plan','')}"
            for r in records
        ]
    ) or "Sem registros SOAP anteriores."

    prompt = (
        f"Gere um **Relatório Fonoaudiológico** profissional, em Português (Brasil), com linguagem técnica "
        f"irretocável, pronto para impressão e envio a {payload.recipient or 'médico encaminhador / escola / convênio'}. "
        f"Finalidade: {payload.purpose or 'atualização clínica'}.\n\n"
        f"### Dados do Paciente\n"
        f"- Nome: {pat['name']}\n"
        f"- Idade: {pat.get('age','—')}\n"
        f"- Diagnóstico: {pat.get('diagnosis','—')}\n"
        f"- Observações: {pat.get('notes','—')}\n\n"
        f"### Histórico de Sessões (SOAP)\n{hist_txt}\n\n"
        f"Estrutura obrigatória em Markdown:\n"
        f"# Relatório Fonoaudiológico\n"
        f"## 1. Identificação\n## 2. Queixa Principal\n## 3. Histórico\n"
        f"## 4. Avaliação Fonoaudiológica\n## 5. Evolução\n## 6. Prognóstico\n"
        f"## 7. Conduta e Recomendações\n\n"
        f"Ao final, inclua espaço para assinatura do profissional."
    )

    chat = LlmChat(
        api_key=ANTHROPIC_API_KEY,
        session_id=f"report-{uuid.uuid4().hex[:8]}",
        system_message=ACTIVITY_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def event_gen():
        full_text = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full_text += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
            report_id = f"rep_{uuid.uuid4().hex[:12]}"
            doc = {
                "report_id": report_id,
                "owner_user_id": user.user_id,
                "patient_id": payload.patient_id,
                "patient_name": pat["name"],
                "content": full_text,
                "recipient": payload.recipient,
                "purpose": payload.purpose,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.reports.insert_one(doc)
            doc.pop("_id", None)
            yield f"data: {json.dumps({'done': True, 'report': doc})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@api_router.get("/reports")
async def list_reports(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    docs = await db.reports.find({"owner_user_id": user.user_id}, {"_id": 0}).sort(
        "created_at", -1
    ).to_list(200)
    return docs


# ---------- Dashboard KPIs ----------
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: User = Depends(get_current_user)):
    q_owner = {"owner_user_id": user.user_id} if user.role == "doctor" else {}
    total_patients = await db.patients.count_documents(
        {**q_owner, "status": "active"} if user.role == "doctor" else {"status": "active"}
    )
    now = datetime.now(timezone.utc)
    today = now.date().isoformat()
    tomorrow = (now + timedelta(days=1)).date().isoformat()
    apts_today = await db.appointments.find(
        {**q_owner, "start": {"$gte": today, "$lt": tomorrow}}, {"_id": 0}
    ).to_list(200)
    week_end = (now + timedelta(days=7)).date().isoformat()
    apts_week = await db.appointments.count_documents(
        {**q_owner, "start": {"$gte": today, "$lt": week_end}}
    )
    records_count = await db.soap_records.count_documents(q_owner) if user.role == "doctor" else 0
    return {
        "total_patients": total_patients,
        "appointments_today": len(apts_today),
        "appointments_week": apts_week,
        "records_count": records_count,
        "today_list": apts_today,
    }


@api_router.get("/")
async def root():
    return {"service": "VoxIntelligence", "status": "ok"}


# ---------- Patient invitation / linking ----------
@api_router.post("/patients/{patient_id}/invite")
async def invite_patient(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    pat = await db.patients.find_one({"patient_id": patient_id, "owner_user_id": user.user_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404)
    token = f"inv_{uuid.uuid4().hex[:16]}"
    await db.patient_invites.insert_one({
        "token": token,
        "patient_id": patient_id,
        "email": pat.get("email"),
        "owner_user_id": user.user_id,
        "used": False,
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
    await db.patients.update_one(
        {"patient_id": inv["patient_id"]},
        {"$set": {"linked_user_id": user.user_id}},
    )
    await db.patient_invites.update_one({"token": token}, {"$set": {"used": True}})
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"role": "patient"}})
    return {"ok": True, "patient_id": inv["patient_id"]}


# ---------- Message drafts (WhatsApp / Email) ----------
class MessageDraftRequest(BaseModel):
    patient_id: str
    kind: Literal["reminder", "post_session", "pre_consult", "welcome", "follow_up"]
    channel: Literal["whatsapp", "email"] = "whatsapp"
    context: Optional[str] = None


@api_router.post("/messages/draft")
async def draft_message(payload: MessageDraftRequest, user: User = Depends(get_current_user)):
    if user.role not in ("doctor", "secretary"):
        raise HTTPException(status_code=403)
    pat = await db.patients.find_one({"patient_id": payload.patient_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404)

    if "private_notes" in pat:
        del pat["private_notes"] 
        # A IA agora está cegada para qualquer suspeita sensível

    kind_label = {
        "reminder": "lembrete de sessão",
        "post_session": "acompanhamento pós-sessão",
        "pre_consult": "orientações de pré-consulta",
        "welcome": "boas-vindas",
        "follow_up": "reengajamento",
    }[payload.kind]
    channel_rules = (
        "WhatsApp: até 3 parágrafos curtos, tom acolhedor porém executivo, use quebras de linha. Sem assunto."
        if payload.channel == "whatsapp"
        else "E-mail: inclua uma linha 'Assunto: ...' na primeira linha, depois corpo formal profissional."
    )
    prompt = (
        f"Escreva uma mensagem humanizada e premium de **{kind_label}** para o paciente "
        f"**{pat['name']}** (diagnóstico: {pat.get('diagnosis','—')}). Canal: {payload.channel}. "
        f"Regras: {channel_rules}\n"
        f"Contexto adicional do doutor: {payload.context or 'nenhum'}.\n"
        f"Aqui estão os dados completos do paciente para você personalizar a mensagem: {pat}\n"
        f"Assine como 'Equipe da Clínica'."
    )
    chat = LlmChat(
        api_key=ANTHROPIC_API_KEY,
        session_id=f"msg-{uuid.uuid4().hex[:8]}",
        system_message="Você é a VoxIntelligence, especialista em comunicação clínica premium.",
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    full = ""
    async for ev in chat.stream_message(UserMessage(text=prompt)):
        if isinstance(ev, TextDelta):
            full += ev.content
        elif isinstance(ev, StreamDone):
            break
    wa_link = None
    if payload.channel == "whatsapp" and pat.get("phone"):
        import urllib.parse
        digits = "".join(c for c in pat["phone"] if c.isdigit())
        wa_link = f"https://wa.me/{digits}?text={urllib.parse.quote(full)}"
    return {"text": full, "channel": payload.channel, "wa_link": wa_link, "patient_name": pat["name"]}


# ---------- Clinical Copilot chat (SSE) ----------
class CopilotRequest(BaseModel):
    session_id: str
    message: str
    patient_id: Optional[str] = None

COPILOT_SYSTEM = """
Você é a VoxIntelligence — Um Copiloto de Inteligência Artificial Especializado em Fonoaudiologia.
Seu papel é auxiliar o fonoaudiólogo com análises, resumos e insights baseados em dados.

🚨 REGRA DE OURO (LIMITAÇÃO CLÍNICA):
Você é um assistente, não um médico. Você NUNCA deve emitir laudos finais ou fechar diagnósticos estruturais. Use frases como "Sugere-se avaliar...", "Os dados apontam para...", "Hipótese funcional de...".

🧠 DIRETRIZES ANTI-ALUCINAÇÃO E CITAÇÕES:
1. Toda lógica clínica, acústica ou biológica deve ser baseada em literatura científica real. Se a resposta não existir na ciência, diga: "Não há evidências suficientes para esta correlação".
2. Você DEVE especificar a fonte de suas afirmações.
3. Ao final da resposta, inclua uma seção "Referências Bibliográficas" com links clicáveis. Exemplo: [Nome do Autor, Ano](https://scholar.google.com/scholar?q=palavras+chave).

⚙️ MÓDULOS DE ATUAÇÃO (Responda de acordo com a entrada do Fonoaudiólogo):
- GERAÇÃO DE INSIGHTS: Correlacione o histórico e aponte caminhos terapêuticos.
- TRANSCRIÇÃO E RESUMO: Ao receber dados de sessões, extraia pontos principais, queixas e exercícios.
- DIGITALIZAÇÃO: Organize informações clínicas de documentos e exames textuais.
- EVOLUÇÃO DE SESSÕES: Gere sugestões de evolução padrão SOAP (Subjetivo, Objetivo, Avaliação, Plano).
"""

@api_router.post("/copilot/chat")
async def copilot_chat(payload: CopilotRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
        
    # 1. Salva a mensagem do médico
    await db.copilot_messages.insert_one({
        "session_id": payload.session_id, "user_id": user.user_id,
        "role": "user", "content": payload.message,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # 2. Puxa histórico do chat
    history = await db.copilot_messages.find(
        {"session_id": payload.session_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    ctx = "\n".join([f"{m['role'].upper()}: {m['content']}" for m in history[:-1]])

    # 3. Contexto do Paciente Blindado
    contexto_paciente = ""
    if payload.patient_id:
        try:
            pat = await db.patients.find_one({"patient_id": payload.patient_id})
            if pat:
                records = await db.records.find({"patient_id": payload.patient_id}).to_list(3)
                challenges = await db.voice_challenges.find({"patient_id": payload.patient_id}).to_list(3)
                protocols = await db.protocols.find({"patient_id": payload.patient_id}).to_list(3)

                contexto_paciente = f"\n\n--- DADOS DO PRONTUÁRIO SELECIONADO ---\n"
                contexto_paciente += f"Paciente: {pat.get('name', 'N/A')} | Idade: {pat.get('age', 'N/A')}\n"
                
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
            print(f"⚠️ Aviso: Falha ao buscar dados do paciente: {e}")

    # 4. Monta o Prompt Final
    prompt_final = contexto_paciente
    prompt_final += f"Histórico do Chat:\n{ctx}\n\n" if ctx else ""
    prompt_final += f"Entrada do Fonoaudiólogo: {payload.message}"

    # 5. A CASCATA DE IAs (O Motor Triplo Blindado)
    async def event_gen():
        full_report = ""
        
        # Inicia o motor OpenRouter antecipadamente
        client_or = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY) if OPENROUTER_API_KEY else None

        try:
            # ==========================================
            # 🥇 TENTATIVA 1: MOTOR PRINCIPAL (Gemini 2.0 Flash)
            # ==========================================
            if not GEMINI_API_KEY:
                raise ValueError("Chave do Gemini ausente")

            print("🚀 [IA Principal] Iniciando Google Gemini 2.0 Flash...")
            
            client_gemini = AsyncOpenAI(
                api_key=GEMINI_API_KEY, 
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/"
            )
            
            prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Google Gemini 2.0 Flash ---"

            response_gemini = await client_gemini.chat.completions.create(
                model="gemini-3.6-flash", 
                messages=[
                    {"role": "system", "content": COPILOT_SYSTEM},
                    {"role": "user", "content": prompt_formatado}
                ],
                stream=True
            )
            async for chunk in response_gemini:
                text = chunk.choices[0].delta.content or ""
                if text:
                    full_report += text
                    yield f"data: {json.dumps({'delta': text})}\n\n"

        except Exception as e1:
            print(f"⚠️ Gemini falhou: {e1}. Acionando Backup 1...")
            yield f"data: {json.dumps({'delta': f'\\n\\n*[Google indisponível. Acionando IA Backup 1: Meta Llama 3.2]*\\n\\n'})}\n\n"
            
            try:
                # ==========================================
                # 🥈 TENTATIVA 2: BACKUP 1 (Llama 3.2)
                # ==========================================
                if not client_or: raise ValueError("Chave do OpenRouter ausente")

                prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Meta Llama 3.2 ---"

                response_llama = await client_or.chat.completions.create(
                    model="meta-llama/llama-3.2-3b-instruct",
                    messages=[
                        {"role": "system", "content": COPILOT_SYSTEM},
                        {"role": "user", "content": prompt_formatado}
                    ],
                    stream=True
                )
                async for chunk in response_llama:
                    text = chunk.choices[0].delta.content or ""
                    if text:
                        full_report += text
                        yield f"data: {json.dumps({'delta': text})}\n\n"

            except Exception as e2:
                print(f"⚠️ Llama falhou: {e2}. Acionando Backup 2...")
                yield f"data: {json.dumps({'delta': f'\\n\\n*[Llama indisponível. Acionando IA Backup 2: Qwen 2.5]*\\n\\n'})}\n\n"
                
                try:
                    # ==========================================
                    # 🥉 TENTATIVA 3: BACKUP 2 (Qwen 2.5)
                    # ==========================================
                    prompt_formatado = prompt_final + "\n\n--- Laudo validado pela Inteligência Artificial: Qwen 2.5 ---"

                    response_qwen = await client_or.chat.completions.create(
                        model="qwen/qwen-2.5-7b-instruct",
                        messages=[
                            {"role": "system", "content": COPILOT_SYSTEM},
                            {"role": "user", "content": prompt_formatado}
                        ],
                        stream=True
                    )
                    async for chunk in response_qwen:
                        text = chunk.choices[0].delta.content or ""
                        if text:
                            full_report += text
                            yield f"data: {json.dumps({'delta': text})}\n\n"

                except Exception as e3:
                    print(f"❌ TODAS AS IAs FALHARAM: {e3}") 
                    yield f"data: {json.dumps({'error': 'Todos os servidores científicos estão ocupados no momento. Tente novamente em 1 minuto.'})}\n\n"
                    return

        # Salva no MongoDB
        try:
            await db.copilot_messages.insert_one({
                "session_id": payload.session_id, "user_id": user.user_id,
                "role": "assistant", "content": full_report,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        except:
            pass

        yield f"data: {json.dumps({'done': True})}\n\n"

    # Retorna o fluxo para o React
    return StreamingResponse(
        event_gen(), 
        media_type="text/event-stream", 
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )

@api_router.get("/copilot/history/{session_id}")
async def copilot_history(session_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    msgs = await db.copilot_messages.find(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return msgs


# ---------- Stripe session packages & Financeiro ----------
class PackageCreate(BaseModel):
    name: str
    sessions: int
    amount: float  # BRL
    patient_id: Optional[str] = None
    payment_type: str = "pacote" # Mensal, Semanal, Avulso, Pacote
    auto_reminders: bool = True  # Lembretes automáticos (Sim/Não)

@api_router.post("/packages")
async def create_package(payload: PackageCreate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
        
    pkg_id = f"pkg_{uuid.uuid4().hex[:12]}"
    
    doc = {
        "package_id": pkg_id, 
        "owner_user_id": user.user_id,
        "patient_id": payload.patient_id, 
        "name": payload.name,
        "sessions": payload.sessions, 
        "amount": float(payload.amount),
        "payment_type": payload.payment_type, # NOVO: Salva como o paciente vai pagar
        "auto_reminders": payload.auto_reminders, # NOVO: Salva se a IA vai cobrar ou não
        "currency": "brl", 
        "status": "unpaid",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/packages")
async def list_packages(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    return await db.packages.find({"owner_user_id": user.user_id}, {"_id": 0}).sort("created_at", -1).to_list(200)

# ---------------------------------------------------------
# ROTA 1: EMISSÃO DE NOTA FISCAL (NFSe)
# ---------------------------------------------------------
class NFSeRequest(BaseModel):
    patient_name: str
    cpf: str
    service: str
    amount: float

@api_router.post("/finance/nfse/emit")
async def emit_nfse(payload: NFSeRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
        
    doc = {
        "nfse_id": f"nfse_{uuid.uuid4().hex[:10]}",
        "owner_user_id": user.user_id,
        "numero_nota": f"2026{str(uuid.uuid4().int)[:4]}", # Gera um número de nota único
        "prefeitura": "Prefeitura de Nova Odessa",
        "patient_name": payload.patient_name,
        "cpf": payload.cpf,
        "service": payload.service,
        "amount": payload.amount,
        "status": "Emitida com Sucesso",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.nfse.insert_one(doc)
    doc.pop("_id", None)
    return doc

# ---------------------------------------------------------
# ROTA 2: EXPORTAÇÃO DMED / CARNÊ-LEÃO (RECEITA FEDERAL)
# ---------------------------------------------------------
@api_router.get("/finance/dmed/export")
async def export_dmed(user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
    
    # Busca todas as cobranças que já foram PAGAS no sistema
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": "paid"}).to_list(None)
    
    # Cria o arquivo CSV na memória (Formato exigido por contadores)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';') # Ponto e vírgula separa as colunas
    
    # Cabeçalho da Planilha
    writer.writerow(["CPF_PAGADOR", "NOME_PACIENTE", "DESCRICAO_SERVICO", "DATA_PAGAMENTO", "VALOR_RECEBIDO"])
    
    for p in paid_pkgs:
        nome = p.get("name", "Paciente Não Identificado")
        valor = p.get("amount", 0.0)
        data = p.get("created_at", "")[:10] # Formato YYYY-MM-DD
        
        # Como o CPF não estava atrelado diretamente ao pacote nas aulas anteriores, 
        # colocamos um placeholder que o contador ajusta se faltar
        cpf = "000.000.000-00" 
        
        writer.writerow([cpf, nome, "Servicos Fonoaudiologicos", data, f"{valor:.2f}".replace(".", ",")])
        
    output.seek(0)
    
    # Devolve o arquivo como um download forçado para o navegador
    response = Response(content=output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=Lote_DMED_Receita_Federal_{datetime.now().year}.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    
    return response


@api_router.post("/packages/checkout")
async def package_checkout(payload: dict, request: Request, user: User = Depends(get_current_user)):
    # Usando 'dict' acabamos com o erro 422 de validação estrita!
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    package_id = payload.get("package_id")
    pkg = await db.packages.find_one({"package_id": package_id})
    
    if not pkg:
        raise HTTPException(status_code=404, detail="Pacote não encontrado")

    # Aqui no futuro você conectará a API da Stripe/Asaas real.
    # Por enquanto, geramos um link simulado perfeito para o sistema não quebrar:
    link_pagamento_seguro = f"https://pagamento.seguro.clinica/checkout/{package_id}"
    
    # 🚨 O SEGREDO: Salva o link no banco de dados!
    await db.packages.update_one(
        {"package_id": package_id}, 
        {"$set": {"checkout_url": link_pagamento_seguro}}
    )
    
    return {"url": link_pagamento_seguro, "session_id": "simulador_oficial"}


@api_router.get("/packages/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500)
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    st = await stripe_checkout.get_checkout_status(session_id)
    tx = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if tx and tx["payment_status"] != "paid" and st.payment_status == "paid":
        await db.payment_transactions.update_one(
            {"session_id": session_id}, {"$set": {"payment_status": "paid", "status": st.status}},
        )
        pkg_id = (st.metadata or {}).get("package_id")
        if pkg_id:
            await db.packages.update_one({"package_id": pkg_id}, {"$set": {"status": "paid"}})
    return {
        "status": st.status, "payment_status": st.payment_status,
        "amount_total": st.amount_total, "currency": st.currency,
    }


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    if not STRIPE_API_KEY:
        return {"ok": False}
    body = await request.body()
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    resp = await stripe_checkout.handle_webhook(body, request.headers.get("Stripe-Signature"))
    if resp.payment_status == "paid":
        pkg_id = (resp.metadata or {}).get("package_id")
        if pkg_id:
            await db.packages.update_one({"package_id": pkg_id}, {"$set": {"status": "paid"}})
            await db.payment_transactions.update_one(
                {"session_id": resp.session_id}, {"$set": {"payment_status": "paid"}},
            )
    return {"ok": True}


# ---------- Voice Analysis (Acoustic + AI Laudo) ----------
VOICE_ANALYSIS_SYSTEM = (
    "Você é a VoxIntelligence, especialista em análise vocal instrumental (Praat). "
    "Gere laudos técnicos, respeitando ética profissional fonoaudiológica e sem diagnóstico médico definitivo."
)


class VoiceAnalysisMeta(BaseModel):
    patient_id: str
    task: Literal["sustained_vowel", "reading", "spontaneous"] = "sustained_vowel"
    notes: Optional[str] = None


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

    allowed_ct = {"audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3",
                  "audio/webm", "audio/ogg", "audio/mp4", "audio/x-m4a", "video/webm"}
    ct = (file.content_type or "").lower()
    if ct not in allowed_ct and not (file.filename or "").lower().endswith((".wav", ".mp3", ".webm", ".ogg", ".m4a")):
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {ct}")

    data = await file.read()
    if len(data) < 1024:
        raise HTTPException(status_code=400, detail="Audio file too small")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 50MB)")

    analysis_id = f"vox_{uuid.uuid4().hex[:14]}"
    ext_map = {
        "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/webm": ".webm", "video/webm": ".webm",
        "audio/ogg": ".ogg",
        "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
    }
    ext = ext_map.get(ct)
    if not ext and file.filename:
        for e in (".wav", ".mp3", ".webm", ".ogg", ".m4a"):
            if file.filename.lower().endswith(e):
                ext = e
                break
    ext = ext or ".bin"
    storage_key = f"voice/{user.user_id}/{patient_id}/{analysis_id}{ext}"

    storage = get_storage()
    storage.save_bytes(storage_key, data)

    # Run acoustic analysis on the stored file
    local_path = storage.local_path(storage_key)
    try:
        metrics = analyze_audio(local_path)
    except Exception as e:
        logger.exception("voice analysis failed")
        raise HTTPException(status_code=500, detail=f"Acoustic analysis failed: {str(e)[:200]}")

    doc = {
        "analysis_id": analysis_id,
        "owner_user_id": user.user_id,
        "patient_id": patient_id,
        "patient_name": pat["name"],
        "task": task,
        "notes": notes,
        "storage_key": storage_key,
        "storage_backend": storage.kind,
        "content_type": ct or "application/octet-stream",
        "metrics": metrics,
        "report": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.voice_analyses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/voice/analyses")
async def list_voice_analyses(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {}
    if user.role == "doctor":
        q["owner_user_id"] = user.user_id
    elif user.role == "patient":
        pats = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(100)
        q["patient_id"] = {"$in": [p["patient_id"] for p in pats]}
    else:
        return []
    if patient_id:
        q["patient_id"] = patient_id
    docs = await db.voice_analyses.find(q, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs


@api_router.get("/voice/analyses/{analysis_id}")
async def get_voice_analysis(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    if user.role == "doctor" and doc["owner_user_id"] != user.user_id:
        raise HTTPException(status_code=403)
    return doc


@api_router.delete("/voice/analyses/{analysis_id}")
async def delete_voice_analysis(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    if doc["owner_user_id"] != user.user_id:
        raise HTTPException(status_code=403)
    try:
        get_storage().delete(doc["storage_key"])
    except Exception:
        pass
    await db.voice_analyses.delete_one({"analysis_id": analysis_id})
    return {"ok": True}


@api_router.get("/voice/audio/{analysis_id}")
async def voice_download(analysis_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    if user.role == "doctor" and doc["owner_user_id"] != user.user_id:
        raise HTTPException(status_code=403)
    storage = get_storage()
    try:
        data = storage.read_bytes(doc["storage_key"])
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio not found in storage")
    return Response(
        content=data,
        media_type=doc.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{analysis_id}"'},
    )


import anthropic # Adicione isso no topo do seu server.py (se já não tiver)
import json
from datetime import datetime, timezone
from fastapi.responses import StreamingResponse

@api_router.post("/voice/analyses/{analysis_id}/report")
async def voice_report(analysis_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Apenas médicos podem gerar laudos")

    doc = await db.voice_analyses.find_one({"analysis_id": analysis_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Análise não encontrada")

    pat = await db.patients.find_one({"patient_id": doc["patient_id"]}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    prompt = build_clinical_prompt(pat, doc.get("metrics") or {}, doc.get("notes") or "")

    async def event_gen():
        full_report = ""
        
        regras_formatacao = (
            "\n\n--- DIRETRIZES ESTRITAS DE FORMATAÇÃO E REFERÊNCIAS ---\n"
            "1. Baseie toda a sua lógica clínica em literatura científica fonoaudiológica real.\n"
            "2. Ao final de CADA apontamento lógico (ex: partes 1, 2, 3 e 4), você DEVE citar a fonte.\n"
            "3. Crie uma seção final chamada 'Referências Bibliográficas'.\n"
            "4. OBRIGATÓRIO: Todas as fontes citadas devem ser FORMATADAS COMO LINKS CLICÁVEIS em Markdown, apontando para o Google Scholar. "
            "Exemplo de formato exigido: [Behlau, 2001](https://scholar.google.com/scholar?q=Behlau+2001+voz).\n"
            "5. A ÚLTIMA linha absoluta do seu laudo deve ser exatamente a assinatura informada abaixo:\n\n"
            "--- Laudo gerado por Inteligência Artificial: {modelo_ia} ---"
        )

        try:
            # TENTATIVA 1: Gemma 2 9B (Modelo Google no OpenRouter, muito estável)
            if not OPENROUTER_API_KEY:
                raise ValueError("Chave do OpenRouter ausente")
                
            client = AsyncOpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_API_KEY)
            prompt_final = prompt + regras_formatacao.format(modelo_ia="Gemma 2 9B (OpenRouter)")
            
            response = await client.chat.completions.create(
                model="google/gemma-2-9b-it:free", 
                messages=[
                    {"role": "system", "content": "Você é um fonoaudiólogo pesquisador e clínico especialista em voz. Forneça diagnósticos baseados em evidências com extremo rigor científico."},
                    {"role": "user", "content": prompt_final}
                ],
                stream=True
            )
            async for chunk in response:
                text = chunk.choices[0].delta.content or ""
                if text:
                    full_report += text
                    yield f"data: {json.dumps({'delta': text})}\n\n"

        except Exception as e:
            print(f"OpenRouter falhou: {e}. Acionando backup Gemini...")
            yield f"data: {json.dumps({'delta': f'\\n\\n*[Redundância Ativada: Conectando motor reserva do Google Gemini...]*\\n\\n'})}\n\n"
            
            try:
                if not GEMINI_API_KEY:
                    raise ValueError("Chave do Gemini ausente")
                
                # BUSCA DINÂMICA SEGURA DO GEMINI
                modelo_escolhido = None
                for m in genai.list_models():
                    if 'generateContent' in m.supported_generation_methods:
                        if 'gemini-1.5-flash' in m.name:
                            modelo_escolhido = m.name 
                            break
                        elif not modelo_escolhido:
                            modelo_escolhido = m.name
                            
                if not modelo_escolhido:
                    raise ValueError("Nenhum modelo Gemini compatível encontrado.")
                
                print(f"Gemini Dinâmico encontrou o modelo: {modelo_escolhido}")
                
                nome_bonito = modelo_escolhido.replace('models/', 'Google ')
                prompt_final_gemini = prompt + regras_formatacao.format(modelo_ia=nome_bonito)
                
                model = genai.GenerativeModel(modelo_escolhido)
                
                import asyncio
                max_tentativas = 3
                
                for tentativa in range(max_tentativas):
                    try:
                        response = await model.generate_content_async(
                            f"Você é um fonoaudiólogo pesquisador e clínico especialista em voz. Forneça diagnósticos baseados em evidências com extremo rigor científico.\n\n{prompt_final_gemini}",
                            stream=True
                        )
                        async for chunk in response:
                            text = chunk.text or ""
                            full_report += text
                            yield f"data: {json.dumps({'delta': text})}\n\n"
                        break 
                        
                    except Exception as e_retry:
                        erro_str = str(e_retry)
                        if ("503" in erro_str or "429" in erro_str) and tentativa < max_tentativas - 1:
                            print(f"Gemini lotado. Tentativa {tentativa + 2}...")
                            yield f"data: {json.dumps({'delta': f' *(Servidor ocupado. Reconectando em 2s...)* '})}\n\n"
                            await asyncio.sleep(2) 
                        else:
                            raise e_retry 
                            
            except Exception as backup_error:
                print(f"ERRO FATAL NO GEMINI: {backup_error}") 
                yield f"data: {json.dumps({'error': 'Os servidores de IA estão sobrecarregados no momento. Tente novamente em alguns minutos.'})}\n\n"
                return
        
        await db.voice_analyses.update_one(
            {"analysis_id": analysis_id},
            {"$set": {
                "report": full_report, 
                "report_generated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        yield f"data: {json.dumps({'done': True, 'report': full_report})}\n\n"

    # Retorno obrigatório que liga a IA com o React!
    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"}
    )

# ---------- Vocal Challenges ----------
# ---------- Vocal Challenges ----------

# 1. Rota para o React buscar o catálogo direto do Banco de Dados
@api_router.get("/voice/challenges/catalog")
async def voice_challenges_catalog(user: User = Depends(get_current_user)):
    # Agora puxa do MongoDB!
    cursor = db.challenges.find({})
    catalog = await cursor.to_list(length=100)
    for c in catalog:
        c["_id"] = str(c["_id"])
    return catalog

# 2. Rota de SETUP (Rode esta rota apenas uma vez no navegador para popular o banco)
@api_router.get("/voice/challenges/seed")
async def seed_challenges():
    desafios = [
        {
            "id": "vogal_a_prolongada", "title": "Vogal Prolongada (A)", "categoria": "Fala", 
            "faixa_etaria": ["Adulto", "Idoso", "Infantil"], "target_duration_sec": 15,
            "instruction": "Inspire fundo e diga 'Ahhh' pelo maior tempo que conseguir...",
            "target": "Avaliar a capacidade respiratória e estabilidade vocal (TMF).", 
            "dica_clinica": "Excelente para medir a eficiência glótica basal.",
            "biofeedback": "volume", "texto_pratica": ""
        },
        {
            "id": "glissando_sirene", "title": "Glissando (Sirene)", "categoria": "Canto", 
            "faixa_etaria": ["Adulto", "Infantil"], "target_duration_sec": 10,
            "instruction": "Faça o som de uma sirene usando a vogal 'U', deslizando do grave ao agudo...",
            "target": "Testar flexibilidade, alongamento e encurtamento das pregas vocais.", 
            "dica_clinica": "Ideal para identificar quebras na passagem de registro vocal.",
            "biofeedback": "pitch", "texto_pratica": ""
        },
        {
            "id": "leitura_sobrearticulada", "title": "Leitura Sobrearticulada", "categoria": "Dublagem", 
            "faixa_etaria": ["Adulto", "Infantil"], "target_duration_sec": 30,
            "instruction": "Leia o texto abaixo de forma lenta, abrindo BEM a boca...",
            "target": "Melhorar a precisão articulatória e a clareza da dicção.", 
            "dica_clinica": "Perfeito para atores e pacientes com disartria leve.",
            "biofeedback": "volume", 
            "texto_pratica": "O papagaio tagarela pulou no poço profundo, batendo o bico na beirada..."
        },
        {
            "id": "voo_do_aviao", "title": "O Voo do Aviãozinho", "categoria": "Fala", 
            "faixa_etaria": ["Infantil"], "target_duration_sec": 12,
            "instruction": "Imite o som do avião lendo a frase abaixo. A voz precisa subir e descer!",
            "target": "Treinar modulação de frequência (pitch) de forma lúdica.", 
            "dica_clinica": "Ótimo para crianças com fala monótona.",
            "biofeedback": "pitch",
            "texto_pratica": "Vuuuuuu... O avião subiu lá na nuvem! Vuuuuuu... O avião desceu na pista!"
        }
        # OBS: Você pode colar todos os outros desafios aqui depois
    ]
    
    # Limpa a coleção antiga e insere os novos (evita duplicatas)
    await db.challenges.delete_many({})
    await db.challenges.insert_many(desafios)
    return {"msg": "Catálogo premium criado no MongoDB com sucesso!"}


@api_router.post("/voice/challenges/attempt")
async def voice_challenge_attempt(
    file: UploadFile = File(...),
    patient_id: str = Form(...),
    challenge_type: str = Form(...),
    challenge_title: str = Form("Desafio Vocal"), # <-- Agora o backend recebe o título do React!
    notes: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
        
    # ❌ A trava antiga do CHALLENGE_CATALOG foi removida daqui!

    pat = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    if not pat:
        raise HTTPException(status_code=404, detail="Patient not found")
    if pat.get("owner_user_id") != user.user_id:
        raise HTTPException(status_code=403, detail="Not your patient")

    data = await file.read()
    if len(data) < 1024:
        raise HTTPException(status_code=400, detail="Audio file too small")
    if len(data) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Audio file too large (max 50MB)")

    ct = (file.content_type or "").lower()
    ext_map = {
        "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav",
        "audio/mpeg": ".mp3", "audio/mp3": ".mp3",
        "audio/webm": ".webm", "video/webm": ".webm",
        "audio/ogg": ".ogg", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a",
    }
    ext = ext_map.get(ct)
    if not ext and file.filename:
        for e in (".wav", ".mp3", ".webm", ".ogg", ".m4a"):
            if file.filename.lower().endswith(e):
                ext = e
                break
    ext = ext or ".bin"

    attempt_id = f"ch_{uuid.uuid4().hex[:14]}"
    storage_key = f"challenges/{user.user_id}/{patient_id}/{attempt_id}{ext}"
    storage = get_storage()
    storage.save_bytes(storage_key, data)

    try:
        result = analyze_challenge(storage.local_path(storage_key), challenge_type)
    except Exception as e:
        logger.exception("challenge analysis failed")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)[:200]}")

    doc = {
        "attempt_id": attempt_id,
        "owner_user_id": user.user_id,
        "patient_id": patient_id,
        "patient_name": pat["name"],
        "challenge_type": challenge_type,
        "challenge_title": challenge_title, # <-- Salvamos com o título correto vindo do React
        "notes": notes,
        "storage_key": storage_key,
        "storage_backend": storage.kind,
        "content_type": ct or "application/octet-stream",
        "duration_sec": result.get("duration_sec"),
        "metrics": result.get("metrics"),
        "task_metrics": result.get("task_metrics"),
        "evaluation": result.get("evaluation"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.voice_challenges.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/voice/challenges/attempts")
async def list_challenge_attempts(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {}
    if user.role == "doctor":
        q["owner_user_id"] = user.user_id
    elif user.role == "patient":
        pats = await db.patients.find({"linked_user_id": user.user_id}, {"_id": 0}).to_list(100)
        q["patient_id"] = {"$in": [p["patient_id"] for p in pats]}
    else:
        return []
    if patient_id:
        q["patient_id"] = patient_id
    docs = await db.voice_challenges.find(q, {"_id": 0}).sort("created_at", -1).to_list(300)
    return docs


@api_router.delete("/voice/challenges/attempts/{attempt_id}")
async def delete_challenge_attempt(attempt_id: str, user: User = Depends(get_current_user)):
    doc = await db.voice_challenges.find_one({"attempt_id": attempt_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404)
    if user.role != "doctor" or doc["owner_user_id"] != user.user_id:
        raise HTTPException(status_code=403)
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
    try:
        doc = await db.voice_challenges.find_one({"attempt_id": attempt_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Análise não encontrada")
        if user.role == "doctor" and doc["owner_user_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="Acesso negado")

        storage = get_storage()
        local_path = storage.local_path(doc["storage_key"])
        if not os.path.exists(local_path):
            raise HTTPException(status_code=404, detail="Arquivo original não encontrado no disco")

        if format not in ["wav", "mp3", "ogg"]:
            format = "wav"

        # 1. Cria o arquivo temporário
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=f".{format}")
        tmp_path = tmp.name
        tmp.close()
        
        # 2. Chama o FFmpeg DIRETAMENTE
        cmd = ["ffmpeg", "-y", "-i", local_path, tmp_path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode != 0:
            raise Exception(f"Erro no FFmpeg: {result.stderr.decode()[-200:]}")
        
        # 3. Formata o nome do arquivo FINAL (À prova de dados antigos nulos!)
        safe_title = str(doc.get("challenge_title") or "Desafio").replace(" ", "_")
        safe_name = str(doc.get("patient_name") or "Paciente").replace(" ", "_")
        
        # Retira caracteres estranhos que o Windows possa bloquear
        import re
        safe_title = re.sub(r'[^A-Za-z0-9_]', '', safe_title)
        
        filename = f"{safe_title}_{safe_name}.{format}"

        # 4. Usa o Background Tasks nativo do FileResponse (muito mais seguro)
        background_tasks.add_task(os.remove, tmp_path)

        return FileResponse(
            path=tmp_path,
            filename=filename,
            media_type=f"audio/{format}"
        )
    except Exception as e:
        print("\n❌ ERRO FATAL NO DOWNLOAD:")
        traceback.print_exc() # Imprime a linha exata do erro no terminal
        raise HTTPException(status_code=500, detail=f"Erro interno: {str(e)}")

    # ==========================================
# ROTAS DA ABA: INTELIGÊNCIA & FISCAL (PÓLO 2)
# ==========================================

# 1. LTV Financeiro do Paciente
@api_router.get("/patients/{patient_id}/financial")
async def get_patient_financial(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    
    # Busca os pacotes pagos do paciente
    cursor = db.packages.find({"patient_id": patient_id, "status": "paid"})
    packages = await cursor.to_list(100)
    
    # Soma tudo para achar o Lifetime Value (LTV)
    total_ltv = sum([float(p.get("amount", 0)) for p in packages])
    
    return {"ltv": total_ltv}

# 2. Emissão de Recibo IRPF com Log de Auditoria
class IRPFRequest(BaseModel):
    patient_id: str
    year: str
    total_amount: float
    payer_name: str
    payer_cpf: str

@api_router.post("/reports/irpf")
async def generate_irpf(payload: IRPFRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    
    pat = await db.patients.find_one({"patient_id": payload.patient_id})
    if not pat:
        raise HTTPException(status_code=404)

    # 🚨 BLINDAGEM LGPD: LOG DE AUDITORIA INVISÍVEL NO BANCO DE DADOS
    await db.audit_logs.insert_one({
        "action": "EMISSAO_IRPF",
        "user_id": user.user_id,
        "patient_id": payload.patient_id,
        "details": f"Usuário {user.name} gerou recibo fiscal IRPF ({payload.year}) para o pagador CPF: {payload.payer_cpf} no valor de R$ {payload.total_amount}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # Geração do PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>RECIBO DE PRESTAÇÃO DE SERVIÇOS FONOAUDIOLÓGICOS</b>", styles['Heading2']))
    story.append(Spacer(1, 20))
    
    texto_recibo = (
        f"Recebi de <b>{payload.payer_name}</b>, inscrito(a) no CPF sob o nº <b>{payload.payer_cpf}</b>, "
        f"a importância de <b>R$ {payload.total_amount:.2f}</b>, referente a sessões de fonoaudiologia "
        f"realizadas para o paciente <b>{pat.get('name')}</b> durante o ano de <b>{payload.year}</b>."
    )
    story.append(Paragraph(texto_recibo, styles['Normal']))
    story.append(Spacer(1, 40))
    story.append(Paragraph("Declaro ter recebido o valor acima descrito.", styles['Normal']))
    story.append(Spacer(1, 60))
    
    story.append(Paragraph(f"<b>Emitente:</b> {user.name}", styles['Normal']))
    story.append(Paragraph(f"<b>Data de Emissão:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']))

    doc.build(story)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=IRPF_{payload.year}_{pat['name'].replace(' ', '_')}.pdf"}
    )

# 3. Compilador Oficial de Prontuário (SOAP)
@api_router.get("/reports/evolution/compile")
async def compile_soap_history(patient_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
        
    pat = await db.patients.find_one({"patient_id": patient_id})
    records = await db.records.find({"patient_id": patient_id}).sort("session_date", 1).to_list(500)
    
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(f"<b>COMPILADO DE EVOLUÇÃO CLÍNICA (SOAP)</b>", styles['Heading1']))
    story.append(Paragraph(f"<b>Paciente:</b> {pat.get('name')} | <b>Gerado em:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']))
    story.append(Spacer(1, 20))
    
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
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Prontuario_{pat['name'].replace(' ', '_')}.pdf"}
    )

# 4. Analytics Clínico com Inteligência Artificial (Anonimizado)
class AnalyticsRequest(BaseModel):
    patient_id: str

@api_router.post("/copilot/analytics")
async def clinical_analytics(payload: AnalyticsRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
        
    records = await db.records.find({"patient_id": payload.patient_id}).sort("session_date", -1).to_list(15) # IA lê as últimas 15 sessões
    
    if len(records) < 2:
        return {"analytics": "Não há volume de registros suficiente para traçar um gráfico evolutivo. É necessário no mínimo 2 sessões."}
        
    # 🚨 BLINDAGEM LGPD: O nome do paciente NUNCA vai para a IA aqui.
    hist_txt = "\n\n".join([
        f"Data: {r['session_date']} - Status: {r.get('attendance')}\nS: {r.get('subjective','')}\nO: {r.get('objective','')}\nA: {r.get('assessment','')}\nP: {r.get('plan','')}"
        for r in records
    ])
    
    prompt = (
        "Você é uma IA de Auditoria Clínica especializada em Fonoaudiologia.\n"
        "Aqui está o histórico SOAP recente de um paciente (totalmente anonimizado por motivos de LGPD).\n"
        "Faça um 'Resumo Sistêmico do Paciente' avaliando o progresso, queixas que sumiram, engajamento e métricas que melhoraram.\n"
        "Seja direto, técnico e use no máximo 2 parágrafos curtos.\n\n"
        f"HISTÓRICO:\n{hist_txt}"
    )
    
    try:
        # Chama o Gemini atualizado 3.6 (pela biblioteca OpenAI para não bugar o streaming)
        client_gemini = AsyncOpenAI(api_key=GEMINI_API_KEY, base_url="https://generativelanguage.googleapis.com/v1beta/openai/")
        response = await client_gemini.chat.completions.create(
            model="gemini-3.6-flash",
            messages=[{"role": "user", "content": prompt}]
        )
        return {"analytics": response.choices[0].message.content}
    except Exception as e:
        return {"analytics": f"Servidores científicos ocupados no momento. Tente novamente em breve."}

        # ==========================================
# MOTOR FINANCEIRO E DASHBOARD
# ==========================================

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    due_date: str # YYYY-MM-DD

@api_router.post("/finance/expenses")
async def create_expense(payload: ExpenseCreate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
        
    doc = payload.model_dump()
    doc["expense_id"] = f"exp_{uuid.uuid4().hex[:12]}"
    doc["owner_user_id"] = user.user_id
    doc["status"] = "pending"
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api_router.get("/finance/dashboard")
async def get_finance_dashboard(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
        
    # 1. Receitas (Pacotes Pagos)
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": "paid"}).to_list(None)
    total_revenue = sum(p.get("amount", 0) for p in paid_pkgs)
    
    # 2. A Receber (Pacotes Pendentes)
    pending_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": "unpaid"}).to_list(None)
    total_pending = sum(p.get("amount", 0) for p in pending_pkgs)
    
    # 3. Despesas (Contas a Pagar)
    expenses = await db.expenses.find({"owner_user_id": user.user_id, "status": "pending"}).to_list(None)
    total_expenses = sum(e.get("amount", 0) for e in expenses)
    
    # 4. Dados do Gráfico Anual (Agrupando receitas pagas por mês)
    months_data = [0] * 12
    for p in paid_pkgs:
        try:
            # Pega o mês da data de criação (Ex: '2026-05-12...' -> índice 4 para Maio)
            m = int(p.get("created_at", "")[5:7]) - 1
            if 0 <= m <= 11:
                months_data[m] += p.get("amount", 0)
        except:
            pass
            
    # 5. Lista Mista (Contas a Receber vs Pagar)
    transactions = []
    for e in expenses:
        transactions.append({
            "id": e["expense_id"], "title": e["description"], 
            "type": "expense", "amount": e["amount"], "date": e["due_date"]
        })
    for p in pending_pkgs:
        transactions.append({
            "id": p["package_id"], "title": p["name"] + (" (Paciente)" if p.get("patient_id") else ""), 
            "type": "revenue", "amount": p.get("amount", 0), "date": p.get("created_at", "")[:10]
        })
        
    # Ordena para mostrar os vencimentos mais antigos/próximos primeiro
    transactions.sort(key=lambda x: x["date"])
    
    return {
        "total_revenue": total_revenue,
        "total_pending": total_pending,
        "total_expenses": total_expenses,
        "monthly_data": months_data,
        "transactions": transactions[:6] # Retorna apenas os 6 próximos
    }

    # ==========================================
# ROTAS: CONFIGURAÇÕES, EQUIPE E DIÁRIOS
# ==========================================

# 1. Equipe e Secretárias
@api_router.get("/team")
async def get_team(user: User = Depends(get_current_user)):
    members = await db.team.find({"owner_user_id": user.user_id}).to_list(100)
    for m in members: m["_id"] = str(m["_id"])
    
    # Se a equipe estiver vazia, cria automaticamente o perfil do Dono da Clínica
    if not members:
        default_member = {
            "id": f"team_{uuid.uuid4().hex[:8]}",
            "owner_user_id": user.user_id,
            "name": "Willian Rafael", # O Titular
            "email": "admin@clinica.com",
            "role": "Fonoaudiólogo(a) Titular",
            "status": "Ativo",
            "isOwner": True,
            "permissions": {"agenda": True, "clinical": True, "financial": True}
        }
        await db.team.insert_one(default_member)
        default_member.pop("_id", None)
        return [default_member]
        
    return members

@api_router.delete("/team/{member_id}")
async def delete_team_member(member_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
    
    # Busca o membro para garantir que não é o dono
    member = await db.team.find_one({"id": member_id, "owner_user_id": user.user_id})
    if member and member.get("isOwner"):
        raise HTTPException(status_code=400, detail="O acesso Master/Proprietário não pode ser excluído.")
        
    result = await db.team.delete_one({"id": member_id, "owner_user_id": user.user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Colaborador não encontrado.")
        
    return {"status": "success", "message": "Colaborador removido."}

# Função que dispara o e-mail nos bastidores (Background Task)
def send_invite_email(to_email: str, name: str, role: str, token: str):
    # ========================================================
    # ⚠️ ATENÇÃO: Coloque seu e-mail e senha de aplicativo aqui
    # ========================================================
    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    SMTP_USER = "will.rafael6262@gmail.com" 
    SMTP_PASS = "qdmt jswe thtu aloc" # No Gmail, crie uma "Senha de Aplicativo"
    
    # O Link mágico que vai no e-mail
    link_acesso = f"http://localhost:3000/setup-colaborador?token={token}"
    
    html_content = f"""
    <html>
      <body style="font-family: Arial, sans-serif; background-color: #F3E7E4; padding: 40px 0;">
        <div style="max-w: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
          
          <div style="background-color: #D46F54; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Bem-vindo(a) à Equipe!</h1>
          </div>
          
          <div style="padding: 40px 30px;">
            <p style="font-size: 16px; color: #57534E; margin-bottom: 20px;">Olá, <strong>{name}</strong>!</p>
            <p style="font-size: 16px; color: #57534E; line-height: 1.6;">
              Você foi convidado(a) para fazer parte da plataforma de Gestão e Prontuários da nossa clínica.
            </p>
            
            <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 15px; border-radius: 8px; margin: 25px 0;">
              <p style="margin: 0; color: #475569; font-size: 14px;"><strong>Seu Cargo:</strong> {role}</p>
              <p style="margin: 5px 0 0 0; color: #475569; font-size: 14px;"><strong>Acesso LGPD:</strong> Restrito conforme suas permissões.</p>
            </div>

            <h3 style="color: #292524; margin-top: 30px;">Passo a passo para se conectar:</h3>
            <ol style="color: #57534E; font-size: 15px; line-height: 1.8;">
              <li>Clique no botão de ativação abaixo.</li>
              <li>Preencha seus dados complementares (CPF, Telefone).</li>
              <li>Crie uma senha forte e intransferível.</li>
            </ol>
            
            <div style="text-align: center; margin: 40px 0;">
              <a href="{link_acesso}" style="background-color: #D46F54; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                Ativar Minha Conta Agora
              </a>
            </div>
            
            <p style="font-size: 12px; color: #A8A29E; text-align: center; border-top: 1px solid #E7E5E4; padding-top: 20px;">
              Este é um link seguro e expira em 48 horas. Se o botão não funcionar, copie e cole este link no seu navegador: <br>
              <a href="{link_acesso}" style="color: #D46F54;">{link_acesso}</a>
            </p>
          </div>
        </div>
      </body>
    </html>
    """

    msg = MIMEMultipart()
    msg['From'] = f"Gestão de Equipe <{SMTP_USER}>"
    msg['To'] = to_email
    msg['Subject'] = "Convite de Acesso - Sistema da Clínica"
    msg.attach(MIMEText(html_content, 'html'))

    try:
        # Tenta enviar o e-mail de verdade
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())
        server.quit()
        print(f"E-mail enviado com sucesso para {to_email}")
    except Exception as e:
        # Se você ainda não configurou a senha do Gmail, ele não trava o sistema, 
        # e imprime o link no terminal para você conseguir testar!
        print(f"⚠️ ERRO AO ENVIAR E-MAIL (Configure o SMTP): {e}")
        print(f"🔗 LINK GERADO PARA TESTE: {link_acesso}")


@api_router.post("/team")
async def add_team_member(payload: dict, background_tasks: BackgroundTasks, user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
        
    # Gera um Token único para o link do e-mail
    invite_token = uuid.uuid4().hex
        
    doc = payload.copy()
    doc["owner_user_id"] = user.user_id
    doc["id"] = f"team_{uuid.uuid4().hex[:8]}"
    doc["status"] = "Pendente (Aguardando Senha)"
    doc["isOwner"] = False
    doc["invite_token"] = invite_token # Salva o token para validar depois
    
    await db.team.insert_one(doc)
    doc.pop("_id", None)
    
    # 🚨 Pede para o Python enviar o e-mail EM SEGUNDO PLANO (Não trava a tela do usuário)
    background_tasks.add_task(
        send_invite_email, 
        to_email=doc["email"], 
        name=doc["name"], 
        role=doc["role"], 
        token=invite_token
    )
    
    return doc

# 2. Configurações da Clínica (Marca d'água, Logo, ICP)
@api_router.get("/settings")
async def get_settings(user: User = Depends(get_current_user)):
    settings = await db.settings.find_one({"owner_user_id": user.user_id})
    if not settings:
        return {"watermark": True, "logo_url": None, "signature_url": None, "icp_active": False}
    settings["_id"] = str(settings["_id"])
    return settings

@api_router.post("/settings")
async def update_settings(payload: dict, user: User = Depends(get_current_user)):
    await db.settings.update_one(
        {"owner_user_id": user.user_id},
        {"$set": payload},
        upsert=True
    )
    return {"status": "success"}

# ==========================================
# ROTAS: DIÁRIOS E MODELOS (TEMPLATES)
# ==========================================

@api_router.get("/templates")
async def get_templates(user: User = Depends(get_current_user)):
    # Busca os modelos da clínica
    templates = await db.templates.find({"owner_user_id": user.user_id}).to_list(100)
    for t in templates: t["_id"] = str(t["_id"])
    
    # Se for a primeira vez, cria 2 modelos padrão para impressionar
    if not templates:
        defaults = [
            {
                "id": f"tpl_{uuid.uuid4().hex[:8]}", 
                "title": "Diário de Ansiedade Vocal", 
                "desc": "O paciente preenche diariamente o nível de tensão no pescoço e o estado emocional.", 
                "active": True, 
                "type": "emocoes",
                "questions": ["De 0 a 10, qual seu nível de tensão ao falar hoje?", "Qual seu sentimento predominante em relação à voz?"],
                "owner_user_id": user.user_id
            },
            {
                "id": f"tpl_{uuid.uuid4().hex[:8]}", 
                "title": "Monitoramento de Hidratação", 
                "desc": "Rastreador diário para pacientes cantores informarem a quantidade de água ingerida.", 
                "active": False, 
                "type": "habitos",
                "questions": ["Quantos copos de água (200ml) você bebeu hoje?", "Quantas horas você dormiu esta noite?"],
                "owner_user_id": user.user_id
            }
        ]
        await db.templates.insert_many(defaults)
        for d in defaults: d.pop("_id", None)
        return defaults
        
    return templates

@api_router.post("/templates")
async def add_template(payload: dict, user: User = Depends(get_current_user)):
    doc = payload.copy()
    doc["owner_user_id"] = user.user_id
    doc["id"] = f"tpl_{uuid.uuid4().hex[:8]}"
    doc["active"] = True
    if "questions" not in doc: doc["questions"] = []
    
    await db.templates.insert_one(doc)
    doc.pop("_id", None)
    return doc

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
# ROTAS: AUTENTICAÇÃO DA EQUIPE (LOGIN E SETUP)
# ==========================================

@api_router.post("/team/setup")
async def setup_team_member(payload: dict):
    token = payload.get("token")
    
    member = await db.team.find_one({"invite_token": token})
    if not member:
        raise HTTPException(status_code=400, detail="Token inválido ou expirado. Peça ao Doutor para excluir e enviar um novo convite.")
        
    await db.team.update_one(
        {"_id": member["_id"]},
        {"$set": {
            "cpf": payload.get("cpf"),
            "phone": payload.get("phone"),
            "password": payload.get("password"),
            "status": "Ativo",
            "invite_token": None # Invalida o token para não ser usado 2x
        }}
    )
    return {"status": "success", "message": "Conta ativada com sucesso."}

@api_router.post("/team/login")
async def login_team_member(payload: dict):
    # O .strip() tira os espaços em branco que o teclado coloca sem querer
    email = payload.get("email", "").strip() 
    password = payload.get("password", "")
    
    # Fazemos a busca no banco de dados ignorando maiúsculas e minúsculas ($regex, options: i)
    member = await db.team.find_one({
        "email": {"$regex": f"^{email}$", "$options": "i"}, 
        "password": password
    })
    
    if not member:
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos.")
    
    if member.get("status") != "Ativo":
        raise HTTPException(status_code=403, detail="Esta conta ainda não foi ativada ou está bloqueada.")
        
    member["_id"] = str(member["_id"])
    return {"status": "success", "user": member}
# ==========================================
# ROTAS: CONVÊNIOS, NFSE E PSICOBANK (CONTA DIGITAL)
# ==========================================

# 1. Convênios (TISS)
@api_router.get("/finance/covenants")
async def get_covenants(user: User = Depends(get_current_user)):
    if user.role != "doctor": raise HTTPException(status_code=403)
    lotes = await db.covenants.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(50)
    # Formata o ID pro React
    for l in lotes: l["_id"] = str(l["_id"])
    return lotes

class TissRequest(BaseModel):
    convenio: str
    amount: float
    mes_referencia: str

@api_router.post("/finance/covenants/tiss")
async def generate_tiss_batch(payload: TissRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
        
    doc = {
        "lote_id": f"tiss_{uuid.uuid4().hex[:8]}",
        "owner_user_id": user.user_id,
        "convenio": payload.convenio,
        "amount": payload.amount,
        "mes_referencia": payload.mes_referencia,
        "status": "Em Análise",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.covenants.insert_one(doc)
    doc.pop("_id", None)
    return doc

# 2. Fiscal e NFSe
@api_router.get("/finance/nfse")
async def get_nfse(user: User = Depends(get_current_user)):
    if user.role != "doctor": raise HTTPException(status_code=403)
    notas = await db.nfse.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(50)
    for n in notas: n["_id"] = str(n["_id"])
    return notas

@api_router.post("/finance/nfse/emit")
async def emit_nfse(user: User = Depends(get_current_user)):
    if user.role != "doctor": raise HTTPException(status_code=403)
    # Simula a comunicação com a prefeitura 
    doc = {
        "nfse_id": f"nfse_{uuid.uuid4().hex[:10]}",
        "owner_user_id": user.user_id,
        "numero_nota": f"2026{str(uuid.uuid4().int)[:4]}",
        "prefeitura": "Prefeitura de Nova Odessa",
        "status": "Emitida com Sucesso",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.nfse.insert_one(doc)
    doc.pop("_id", None)
    return doc

# 3. Repasse Financeiro (PDF)
@api_router.get("/finance/covenants/repasse/pdf")
async def download_repasse_pdf(user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403, detail="Acesso restrito")
    
    # 1. Pega o faturamento real do banco de dados
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": "paid"}).to_list(None)
    total_revenue = sum(p.get("amount", 0) for p in paid_pkgs)
    
    # 2. Cálculos das Regras (30% Clínica / 70% Fono)
    parte_clinica = total_revenue * 0.30
    parte_prof = total_revenue * 0.70

    # 3. Preparando o Arquivo PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    
    # Estilos customizados com as cores do seu sistema (Laranja D46F54)
    title_style = ParagraphStyle(name='TitleStyle', parent=styles['Heading1'], textColor=colors.HexColor('#D46F54'), alignment=1)
    sub_style = ParagraphStyle(name='SubStyle', parent=styles['Normal'], textColor=colors.HexColor('#57534E'), alignment=1, fontSize=10)
    
    story = []
    
    # Cabeçalho
    story.append(Paragraph("<b>CENTRAL FINANCEIRA INTEGRADA</b>", sub_style))
    story.append(Paragraph("<b>FECHAMENTO DE REPASSES E COMISSÕES</b>", title_style))
    story.append(Spacer(1, 30))
    
    # Informações Base
    story.append(Paragraph(f"<b>Data de Fechamento:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']))
    story.append(Paragraph(f"<b>Profissional Responsável:</b> {user.name}", styles['Normal']))
    story.append(Spacer(1, 20))
    
    # Tabela Profissional
    data = [
        ['Descrição', 'Percentual (%)', 'Valor Líquido (R$)'],
        ['Faturamento Total Bruto', '100%', f'R$ {total_revenue:,.2f}'.replace(',','v').replace('.',',').replace('v','.')],
        ['Retenção da Clínica', '30%', f'- R$ {parte_clinica:,.2f}'.replace(',','v').replace('.',',').replace('v','.')],
        ['Repasse ao Profissional', '70%', f'+ R$ {parte_prof:,.2f}'.replace(',','v').replace('.',',').replace('v','.')],
    ]
    
    t = Table(data, colWidths=[250, 100, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#F3E7E4')), # Fundo do cabeçalho
        ('TEXTCOLOR', (0,0), (-1,0), colors.HexColor('#B75C46')), # Letra laranja escuro
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (0,1), (0,-1), 'LEFT'),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('FONTSIZE', (0,0), (-1,0), 12),
        ('BOTTOMPADDING', (0,0), (-1,0), 12),
        ('BACKGROUND', (0,1), (-1,-1), colors.HexColor('#FAFAFA')),
        ('GRID', (0,0), (-1,-1), 1, colors.HexColor('#E7E5E4')),
        ('FONTNAME', (0,-1), (-1,-1), 'Helvetica-Bold'), # Linha final em Negrito
        ('TEXTCOLOR', (0,-1), (-1,-1), colors.HexColor('#10B981')), # Linha final Verde!
    ]))
    
    story.append(t)
    story.append(Spacer(1, 50))
    
    # Assinaturas
    story.append(Paragraph("___________________________________________________", styles['Normal']))
    story.append(Paragraph("<b>Assinatura da Coordenação Clínica</b>", styles['Normal']))
    story.append(Spacer(1, 30))
    story.append(Paragraph("___________________________________________________", styles['Normal']))
    story.append(Paragraph(f"<b>{user.name}</b>", styles['Normal']))

    doc.build(story)
    buffer.seek(0)
    
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Folha_Repasse_{datetime.now().strftime('%d_%m_%Y')}.pdf"}
    )

# 3. Psicobank (Extrato e Saque)
@api_router.get("/finance/bank/statement")
async def get_bank_statement(user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
        
    # Puxa o saldo real das cobranças quitadas
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": "paid"}).to_list(None)
    saques = await db.withdrawals.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(None)
    
    # 🚨 A SOLUÇÃO DO ERRO 500:
    # Transforma o ObjectId do MongoDB em um texto (string) comum para o FastAPI não travar!
    for s in saques: 
        s["_id"] = str(s["_id"])
    
    total_entradas = sum(p.get("amount", 0) for p in paid_pkgs)
    total_saidas = sum(s.get("amount", 0) for s in saques)
    saldo_atual = total_entradas - total_saidas

    return {
        "saldo": saldo_atual,
        "historico": saques # Retorna os saques de forma segura para o React montar o extrato
    }

@api_router.post("/finance/bank/withdraw")
async def request_withdrawal(payload: dict, user: User = Depends(get_current_user)):
    if user.role != "doctor": 
        raise HTTPException(status_code=403)
        
    valor_saque = float(payload.get("amount", 0))
    chave_pix = payload.get("destination", "Não informada")
    
    doc = {
        "withdrawal_id": f"wd_{uuid.uuid4().hex[:10]}",
        "owner_user_id": user.user_id,
        "amount": valor_saque,
        "destination": chave_pix, # NOVO: Salva a Chave Pix no banco
        "status": "Processando Pix",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.withdrawals.insert_one(doc)
    doc.pop("_id", None)
    return doc

# ==========================================
# ROTAS: PORTAL DO PACIENTE (APP PWA)
# ==========================================
@api_router.get("/portal/dashboard")
async def get_patient_portal_dashboard(user: User = Depends(get_current_user)):
    email_clean = user.email.strip().lower() if user.email else ""
    primeiro_nome = user.name.split()[0].lower() if user.name else "paciente"

    # Tenta achar no registro da Clínica
    patient_record = await db.patients.find_one({"email": {"$regex": f"^{email_clean}$", "$options": "i"}})
    owner_id = patient_record.get("owner_user_id") if patient_record else user.user_id
    patient_id = patient_record.get("id") if patient_record else None

    # Tenta achar o registro oficial da conta Google dele
    user_record = await db.users.find_one({"email": user.email})

    # Puxa as configurações garantidas
    notif_settings = None
    if user_record and "notif_settings" in user_record:
        notif_settings = user_record["notif_settings"]
    elif patient_record and "notif_settings" in patient_record:
        notif_settings = patient_record["notif_settings"]
        
    if not notif_settings:
        notif_settings = {
            "whatsapp": True, "sessionReminders": True, "diaryAlerts": True, "vocalTips": False
        }

    # Busca a próxima sessão
    todas_sessoes = await db.appointments.find().to_list(1000)
    hoje_str = datetime.now().isoformat()[:10] 
    minhas_sessoes = []
    for s in todas_sessoes:
        data_evento = s.get("start") or s.get("start_time") or s.get("date")
        if data_evento and str(data_evento)[:10] >= hoje_str:
            texto_agendamento = str(s).lower()
            if (email_clean and email_clean in texto_agendamento) or (primeiro_nome != "paciente" and primeiro_nome in texto_agendamento):
                minhas_sessoes.append(s)

    proxima_sessao = None
    if minhas_sessoes:
        minhas_sessoes.sort(key=lambda x: str(x.get("start") or x.get("start_time") or x.get("date")))
        proxima_sessao = minhas_sessoes[0]
        proxima_sessao["_id"] = str(proxima_sessao["_id"])
        proxima_sessao["start_time"] = proxima_sessao.get("start") or proxima_sessao.get("start_time") or proxima_sessao.get("date")

    # Busca os diários ativos da clínica
    diarios = []
    if owner_id:
        cursor = db.templates.find({"owner_user_id": owner_id, "active": True})
        diarios = await cursor.to_list(50)
        for d in diarios: d["_id"] = str(d["_id"])

    return {
        "status": "success",
        "patient": {"name": user.name, "first_name": primeiro_nome.capitalize(), "email": user.email},
        "nextSession": proxima_sessao,
        "diaries": diarios,
        "settings": notif_settings 
    }

@api_router.post("/portal/settings")
async def save_portal_settings(payload: dict, user: User = Depends(get_current_user)):
    email_clean = user.email.strip().lower() if user.email else ""
    
    # 🚀 O SEGREDO: upsert=True força a criação da gaveta se não existir!
    await db.users.update_one(
        {"email": user.email},
        {"$set": {"notif_settings": payload}},
        upsert=True 
    )
    
    # Salva no registro do paciente também
    if email_clean:
        await db.patients.update_one(
            {"email": {"$regex": f"^{email_clean}$", "$options": "i"}},
            {"$set": {"notif_settings": payload}}
        )
        
    return {"status": "success"}


app.include_router(api_router)

# ---------- CORS Hardening ----------
# Origins are read from CORS_ORIGINS env var (comma-separated). Default: locked down
# to the current preview URL + localhost. No wildcards in production.
_raw_origins = os.environ.get("CORS_ORIGINS", "").strip()
if _raw_origins and _raw_origins != "*":
    _origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
else:
    _origins = [
        "https://vocal-acoustic-lab.preview.emergentagent.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_origins,
    allow_origin_regex=r"https://[^.]+\.preview\.emergentagent\.com",
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Session-ID",
        "Accept",
        "Origin",
        "Cache-Control",
    ],
    expose_headers=["Content-Disposition"],
    max_age=600,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Adicione este bloco inteiro para liberar a comunicação com o React
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Libera o seu Frontend
    allow_credentials=True,
    allow_methods=["*"], # Libera todos os métodos (POST, GET, etc)
    allow_headers=["*"], # Libera todos os cabeçalhos
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
