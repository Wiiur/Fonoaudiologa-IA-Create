from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends, Cookie, Header
from fastapi.responses import StreamingResponse
import json
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta, StreamDone
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
STRIPE_API_KEY = os.environ.get("STRIPE_API_KEY")

app = FastAPI()
api_router = APIRouter(prefix="/api")


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


class Patient(BaseModel):
    patient_id: str = Field(default_factory=lambda: f"pat_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    linked_user_id: Optional[str] = None
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[int] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None
    interests: Optional[str] = None
    status: Literal["active", "inactive", "discharged"] = "active"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PatientCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    age: Optional[int] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None
    interests: Optional[str] = None


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


class SoapRecord(BaseModel):
    record_id: str = Field(default_factory=lambda: f"rec_{uuid.uuid4().hex[:12]}")
    owner_user_id: str
    patient_id: str
    session_date: str
    subjective: str = ""
    objective: str = ""
    assessment: str = ""
    plan: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SoapCreate(BaseModel):
    patient_id: str
    session_date: str
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
) -> User:
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
    doc = await db.patients.find_one({"patient_id": patient_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


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
async def list_records(patient_id: Optional[str] = None, user: User = Depends(get_current_user)):
    q = {}
    if user.role == "doctor":
        q["owner_user_id"] = user.user_id
    if patient_id:
        q["patient_id"] = patient_id
    docs = await db.soap_records.find(q, {"_id": 0}).sort("session_date", -1).to_list(1000)
    return docs


@api_router.post("/records")
async def create_record(payload: SoapCreate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Only doctor")
    rec = SoapRecord(owner_user_id=user.user_id, **payload.model_dump())
    d = rec.model_dump()
    d["created_at"] = d["created_at"].isoformat()
    await db.soap_records.insert_one(d)
    d.pop("_id", None)
    return d


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
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key missing")

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
        api_key=EMERGENT_LLM_KEY,
        session_id=f"activity-{uuid.uuid4().hex[:8]}",
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
            title = "Atividade Personalizada"
            for line in full_text.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip()
                    break
            act = Activity(
                owner_user_id=user.user_id,
                patient_id=payload.patient_id,
                patient_name=patient_name,
                diagnosis=payload.diagnosis,
                environment=payload.environment,
                age_group=payload.age_group,
                title=title,
                content=full_text,
            )
            d = act.model_dump()
            d["created_at"] = d["created_at"].isoformat()
            await db.activities.insert_one(d)
            d.pop("_id", None)
            yield f"data: {json.dumps({'done': True, 'activity': d})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


# ---------- Reports ----------
@api_router.post("/reports/generate")
async def generate_report(payload: ReportRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key missing")

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
        api_key=EMERGENT_LLM_KEY,
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
        f"Contexto adicional do doutor: {payload.context or 'nenhum'}. "
        f"Assine como 'Equipe da Clínica'."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
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


COPILOT_SYSTEM = (
    "Você é a VoxIntelligence — Copiloto Clínico Científico. Responda EXCLUSIVAMENTE ao Fonoaudiólogo, "
    "com base em anatomia, fisiologia e literatura fonoaudiológica atualizada. Cite estudos quando possível. "
    "Se não houver consenso científico, informe explicitamente. NUNCA invente protocolos. "
    "Use Markdown, seja conciso e técnico."
)


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
    prompt = (f"Histórico:\n{ctx}\n\nPergunta atual: {payload.message}" if ctx else payload.message)

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=payload.session_id,
        system_message=COPILOT_SYSTEM,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")

    async def event_gen():
        full = ""
        try:
            async for ev in chat.stream_message(UserMessage(text=prompt)):
                if isinstance(ev, TextDelta):
                    full += ev.content
                    yield f"data: {json.dumps({'delta': ev.content})}\n\n"
                elif isinstance(ev, StreamDone):
                    break
            await db.copilot_messages.insert_one({
                "session_id": payload.session_id, "user_id": user.user_id,
                "role": "assistant", "content": full,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@api_router.get("/copilot/history/{session_id}")
async def copilot_history(session_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    msgs = await db.copilot_messages.find(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", 1).to_list(200)
    return msgs


# ---------- Stripe session packages ----------
class PackageCreate(BaseModel):
    name: str
    sessions: int
    amount: float  # BRL
    patient_id: Optional[str] = None


class CheckoutStart(BaseModel):
    package_id: str
    origin_url: str


@api_router.post("/packages")
async def create_package(payload: PackageCreate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    pkg_id = f"pkg_{uuid.uuid4().hex[:12]}"
    doc = {
        "package_id": pkg_id, "owner_user_id": user.user_id,
        "patient_id": payload.patient_id, "name": payload.name,
        "sessions": payload.sessions, "amount": float(payload.amount),
        "currency": "brl", "status": "unpaid",
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


@api_router.post("/packages/checkout")
async def package_checkout(payload: CheckoutStart, request: Request, user: User = Depends(get_current_user)):
    pkg = await db.packages.find_one({"package_id": payload.package_id}, {"_id": 0})
    if not pkg:
        raise HTTPException(status_code=404, detail="Package not found")
    if not STRIPE_API_KEY:
        raise HTTPException(status_code=500, detail="Stripe key missing")
    host_url = str(request.base_url)
    webhook_url = f"{host_url}api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/checkout/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/dashboard"
    req = CheckoutSessionRequest(
        amount=float(pkg["amount"]),
        currency="brl",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"package_id": pkg["package_id"], "owner_user_id": pkg["owner_user_id"]},
    )
    session = await stripe_checkout.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id, "package_id": pkg["package_id"],
        "owner_user_id": pkg["owner_user_id"], "amount": float(pkg["amount"]),
        "currency": "brl", "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"url": session.url, "session_id": session.session_id}


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


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
