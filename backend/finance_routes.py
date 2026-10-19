import io
import csv
import re
import uuid
import httpx
from datetime import datetime, timezone
from typing import Optional, Literal
from bson.objectid import ObjectId
from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

from core import (
    db, User, get_current_user, log_audit_access, verify_patient_ownership,
    ASAAS_API_URL, ASAAS_API_KEY
)

finance_router = APIRouter()

# Taxa operacional transparente descontada apenas em pagamentos liquidados via PIX
PIX_FEE_PER_TRANSACTION = 1.99

# ==========================================
# 1. MODELOS FINANCEIROS
# ==========================================
class BankSetupRequest(BaseModel):
    holder_name: Optional[str] = None
    cpf_cnpj: str
    birth_date: Optional[str] = None
    phone: Optional[str] = None
    postal_code: Optional[str] = None
    address: Optional[str] = None
    monthly_income: Optional[str] = "5000"
    pix_key: Optional[str] = None
    bank_code: Optional[str] = "341"
    agency: Optional[str] = None
    account: Optional[str] = None
    account_type: Literal["corrente", "poupanca"] = "corrente"
    accepted_fee_terms: Optional[bool] = True

class DoctorCardRequest(BaseModel):
    holder_name: str
    number: str
    expiry: str
    cvv: str
    cpf_holder: str

class PixChargeRequest(BaseModel):
    patient_id: str
    amount: float
    description: str
    due_date: Optional[str] = None
    cpf: Optional[str] = None

class WithdrawRequest(BaseModel):
    amount: float
    destination: Optional[str] = None
    pix_type: Optional[str] = "CPF"

class PackageCreate(BaseModel):
    name: str
    sessions: int = 1
    amount: float
    patient_id: Optional[str] = None
    payment_type: str = "pacote"
    auto_reminders: bool = True

class ExpenseCreate(BaseModel):
    description: str
    amount: float
    due_date: str

class TissRequest(BaseModel):
    convenio: str
    amount: float
    mes_referencia: str

class NFSeRequest(BaseModel):
    patient_name: str
    cpf: str
    service: str
    amount: float

class IRPFRequest(BaseModel):
    patient_id: str
    year: str
    total_amount: float
    payer_name: str
    payer_cpf: str


# ==========================================
# 2. COFRE BANCÁRIO WHITE-LABEL E CARTÃO (CONFIGURAÇÕES)
# ==========================================
@finance_router.get("/finance/vault")
async def get_financial_vault(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    vault = await db.financial_vault.find_one({"owner_user_id": user.user_id}, {"_id": 0})
    if not vault:
        return {
            "status": "empty",
            "asaas_wallet_id": None,
            "pix_fee": PIX_FEE_PER_TRANSACTION,
            "card": None
        }

    masked_account = vault.get("account") or ""
    if len(masked_account) > 4:
        masked_account = f"****{masked_account[-4:]}"

    masked_pix = vault.get("pix_key") or ""
    if len(masked_pix) > 5:
        masked_pix = f"{masked_pix[:3]}****{masked_pix[-2:]}"

    return {
        "status": "configured",
        "asaas_wallet_id": vault.get("asaas_wallet_id"),
        "holder_name": vault.get("holder_name") or user.name,
        "cpf_cnpj": vault.get("cpf_cnpj"),
        "phone": vault.get("phone") or "",
        "postal_code": vault.get("postal_code") or "",
        "address": vault.get("address") or "",
        "bank_code": vault.get("bank_code") or "341",
        "agency": vault.get("agency") or "",
        "account_masked": masked_account,
        "pix_masked": masked_pix,
        "pix_fee": vault.get("pix_fee", PIX_FEE_PER_TRANSACTION),
        "card": vault.get("card"),
        "updated_at": vault.get("updated_at")
    }

@finance_router.post("/finance/vault")
async def update_financial_vault(payload: BankSetupRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    vault = await db.financial_vault.find_one({"owner_user_id": user.user_id})
    asaas_wallet_id = vault.get("asaas_wallet_id") if vault else None
    subaccount_api_key = vault.get("asaas_subaccount_key") if vault else None



    # Provisionamento White-Label no Asaas
    if (not asaas_wallet_id or asaas_wallet_id == "wallet_configured") and ASAAS_API_KEY:
        async with httpx.AsyncClient(timeout=20.0) as client:
            clean_cpf_cnpj = re.sub(r"\D", "", payload.cpf_cnpj or "")
            clean_phone = re.sub(r"\D", "", payload.phone or "") or "19999999999"
            clean_cep = re.sub(r"\D", "", payload.postal_code or "") or "13465000"

            account_payload = {
                "name": (payload.holder_name or user.name).strip(),
                "email": user.email.strip(),
                "cpfCnpj": clean_cpf_cnpj,
                "mobilePhone": clean_phone,
                "postalCode": clean_cep,
                "address": payload.address or "Avenida Brasil",
                "addressNumber": "100",
                "province": "Centro",
                "incomeValue": float(payload.monthly_income or 5000)
            }

            # Regra obrigatória do Asaas: CPF precisa de birthDate; CNPJ precisa de companyType
            if len(clean_cpf_cnpj) == 11:
                account_payload["birthDate"] = payload.birth_date or "1995-05-20"
            else:
                account_payload["companyType"] = "LIMITED"

            sub_resp = await client.post(
                f"{ASAAS_API_URL}/accounts",
                headers={"access_token": ASAAS_API_KEY, "Content-Type": "application/json"},
                json=account_payload
            )

            if sub_resp.status_code in (200, 201):
                sub_data = sub_resp.json()
                asaas_wallet_id = sub_data.get("walletId") or sub_data.get("id")
                subaccount_api_key = sub_data.get("apiKey")
            else:
                # Extrai a mensagem exata do Asaas (ex: CEP inválido, CPF já em uso na conta principal, etc.)
                try:
                    erros = sub_resp.json().get("errors", [])
                    msg_asaas = " | ".join([e.get("description", "") for e in erros])
                except Exception:
                    msg_asaas = sub_resp.text
                raise HTTPException(status_code=400, detail=f"Recusado pelo Banco (Asaas): {msg_asaas}")

    doc = {
        "owner_user_id": user.user_id,
        "asaas_wallet_id": asaas_wallet_id or "wallet_configured",
        "asaas_subaccount_key": subaccount_api_key,
        "holder_name": payload.holder_name or user.name,
        "cpf_cnpj": payload.cpf_cnpj,
        "phone": payload.phone,
        "postal_code": payload.postal_code,
        "address": payload.address,
        "pix_key": payload.pix_key,
        "bank_code": payload.bank_code,
        "agency": payload.agency,
        "account": payload.account,
        "account_type": payload.account_type,
        "accepted_fee_terms": True,
        "pix_fee": PIX_FEE_PER_TRANSACTION,
        "card": vault.get("card") if vault else None,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.financial_vault.update_one({"owner_user_id": user.user_id}, {"$set": doc}, upsert=True)
    await log_audit_access(user.email, "ATUALIZACAO_COFRE_BANCARIO", "SISTEMA_FINANCEIRO")
    return {"status": "success", "msg": "Conta Digital Psicobank ativada no portal com sucesso!"}

@finance_router.post("/finance/card")
async def save_doctor_credit_card(payload: DoctorCardRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    clean_num = re.sub(r"\D", "", payload.number or "")
    if len(clean_num) < 13:
        raise HTTPException(status_code=400, detail="Número de cartão inválido.")

    brand = "VISA" if clean_num.startswith("4") else "MASTERCARD" if clean_num.startswith("5") else "ELO / CREDITO"
    card_info = {
        "holder_name": payload.holder_name.strip().upper(),
        "last4": clean_num[-4:],
        "brand": brand,
        "expiry": payload.expiry.strip(),
        "cpf_holder": payload.cpf_holder.strip(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }

    await db.financial_vault.update_one(
        {"owner_user_id": user.user_id},
        {"$set": {"card": card_info, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    await log_audit_access(user.email, "CADASTRO_CARTAO_ASSINATURA", f"Final {clean_num[-4:]}")
    return {"status": "success", "card": card_info}

@finance_router.delete("/finance/card")
async def delete_doctor_credit_card(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    await db.financial_vault.update_one(
        {"owner_user_id": user.user_id},
        {"$set": {"card": None, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    await log_audit_access(user.email, "REMOCAO_CARTAO_ASSINATURA", "SISTEMA_FINANCEIRO")
    return {"status": "success", "msg": "Cartão removido com sucesso."}


# ==========================================
# 3. COBRANÇA PIX REAL (ASAAS) E WEBHOOK
# ==========================================
async def _process_asaas_pix_charge(payload: PixChargeRequest, user: User):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    if not ASAAS_API_KEY:
        raise HTTPException(status_code=500, detail="Chave ASAAS_API_KEY não configurada no servidor.")

    patient = await db.patients.find_one({"patient_id": payload.patient_id})
    if not patient:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")

    # Se o doutor tiver subconta White-Label própria, usa a chave dela; caso contrário usa a chave master da plataforma
    vault = await db.financial_vault.find_one({"owner_user_id": user.user_id})
    active_api_key = (vault.get("asaas_subaccount_key") if vault and vault.get("asaas_subaccount_key") else ASAAS_API_KEY)
    headers = {"access_token": active_api_key, "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=30.0) as client:
        asaas_customer_id = patient.get("asaas_customer_id")
        raw_cpf = (payload.cpf or patient.get("rg_cpf") or patient.get("cpf") or "24971563792")
        clean_cpf = re.sub(r"\D", "", str(raw_cpf))
        if len(clean_cpf) not in (11, 14):
            clean_cpf = "24971563792"

        if not asaas_customer_id:
            customer_data = {
                "name": patient.get("name", "Paciente Clínica"),
                "cpfCnpj": clean_cpf,
                "email": patient.get("email") or "paciente@clinica.com",
                "mobilePhone": re.sub(r"\D", "", str(patient.get("phone") or ""))
            }
            cust_resp = await client.post(f"{ASAAS_API_URL}/customers", json=customer_data, headers=headers)
            if cust_resp.status_code not in (200, 201):
                raise HTTPException(status_code=400, detail=f"Erro ao validar cliente no gateway: {cust_resp.text}")

            asaas_customer_id = cust_resp.json()["id"]
            await db.patients.update_one({"patient_id": payload.patient_id}, {"$set": {"asaas_customer_id": asaas_customer_id}})

        due_date = payload.due_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        payment_data = {
            "customer": asaas_customer_id,
            "billingType": "PIX",
            "value": float(payload.amount),
            "dueDate": due_date,
            "description": payload.description
        }

        pay_resp = await client.post(f"{ASAAS_API_URL}/payments", json=payment_data, headers=headers)
        if pay_resp.status_code not in (200, 201):
            raise HTTPException(status_code=400, detail=f"Erro ao gerar Pix: {pay_resp.text}")

        payment_info = pay_resp.json()
        asaas_payment_id = payment_info["id"]
        invoice_url = payment_info.get("invoiceUrl", "")

        qr_resp = await client.get(f"{ASAAS_API_URL}/payments/{asaas_payment_id}/pixQrCode", headers=headers)
        qr_data = qr_resp.json() if qr_resp.status_code == 200 else {}
        encoded_img = qr_data.get("encodedImage", "")
        copy_paste = qr_data.get("payload", "")

        package_id = f"pkg_{uuid.uuid4().hex[:10]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        gross_val = float(payload.amount)
        net_val = max(0.0, round(gross_val - PIX_FEE_PER_TRANSACTION, 2))

        package_doc = {
            "package_id": package_id,
            "asaas_payment_id": asaas_payment_id,
            "owner_user_id": user.user_id,
            "patient_id": payload.patient_id,
            "patient_name": patient.get("name"),
            "name": payload.description,
            "title": payload.description,
            "sessions": 1,
            "amount": gross_val,
            "pix_fee": PIX_FEE_PER_TRANSACTION,
            "net_amount": net_val,
            "status": "pending",
            "payment_type": "pix",
            "invoice_url": invoice_url,
            "pix_copy_paste": copy_paste,
            "date": datetime.now().strftime("%d/%m/%Y"),
            "created_at": now_iso
        }
        await db.packages.insert_one(package_doc)

        charge_doc = {**package_doc, "status": "PENDING"}
        charge_doc.pop("_id", None)
        await db.charges.insert_one(charge_doc)

        return {
            "status": "success",
            "package_id": package_id,
            "payment_id": asaas_payment_id,
            "invoice_url": invoice_url,
            "encoded_image": encoded_img,
            "qr_code_base64": f"data:image/png;base64,{encoded_img}" if encoded_img else "",
            "payload": copy_paste,
            "pix_copy_paste": copy_paste,
            "pix_fee": PIX_FEE_PER_TRANSACTION,
            "net_amount": net_val,
            "expiration_date": qr_data.get("expirationDate")
        }

@finance_router.post("/finance/pix/generate")
async def generate_pix_charge_route(payload: PixChargeRequest, user: User = Depends(get_current_user)):
    return await _process_asaas_pix_charge(payload, user)

@finance_router.post("/finance/pix/charge")
async def create_real_pix_charge_route(payload: PixChargeRequest, user: User = Depends(get_current_user)):
    return await _process_asaas_pix_charge(payload, user)

@finance_router.post("/finance/webhook/asaas")
async def asaas_webhook(request: Request):
    """Recebe aviso automático do Asaas quando o paciente paga o Pix"""
    try:
        payload = await request.json()
        event_type = payload.get("event")

        if event_type in ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"]:
            payment_data = payload.get("payment", {})
            asaas_payment_id = payment_data.get("id")

            if asaas_payment_id:
                now_iso = datetime.now(timezone.utc).isoformat()
                await db.charges.update_one(
                    {"asaas_payment_id": asaas_payment_id},
                    {"$set": {"status": "PAID", "paid_at": now_iso, "net_value": payment_data.get("netValue")}}
                )
                await db.packages.update_one(
                    {"asaas_payment_id": asaas_payment_id},
                    {"$set": {"status": "paid", "payment_method": "pix_asaas", "payment_date": now_iso}}
                )
                print(f"💰 WEBHOOK ASAAS: Pagamento {asaas_payment_id} quitado automaticamente!")
        return {"status": "received"}
    except Exception as e:
        print(f"⚠️ Erro no Webhook Asaas: {e}")
        return {"status": "error", "detail": str(e)}

@finance_router.post("/finance/pix/sync")
async def sync_asaas_payments(user: User = Depends(get_current_user)):
    """Sincroniza pagamentos pendentes direto com o Asaas"""
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    if not ASAAS_API_KEY:
        raise HTTPException(status_code=400, detail="Chave do Asaas não configurada.")

    vault = await db.financial_vault.find_one({"owner_user_id": user.user_id})
    active_api_key = (vault.get("asaas_subaccount_key") if vault and vault.get("asaas_subaccount_key") else ASAAS_API_KEY)
    headers = {"access_token": active_api_key}

    pending_pkgs = await db.packages.find({
        "owner_user_id": user.user_id,
        "status": {"$in": ["pending", "unpaid", "pendente"]},
        "asaas_payment_id": {"$ne": None}
    }).to_list(100)

    updated_count = 0
    async with httpx.AsyncClient(timeout=20.0) as client:
        for pkg in pending_pkgs:
            pay_id = pkg.get("asaas_payment_id")
            if not pay_id:
                continue
            resp = await client.get(f"{ASAAS_API_URL}/payments/{pay_id}", headers=headers)
            if resp.status_code == 200:
                st = resp.json().get("status")
                if st in ["RECEIVED", "CONFIRMED", "RECEIVED_IN_CASH"]:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    await db.packages.update_one(
                        {"asaas_payment_id": pay_id},
                        {"$set": {"status": "paid", "payment_method": "pix_asaas", "payment_date": now_iso}}
                    )
                    await db.charges.update_one(
                        {"asaas_payment_id": pay_id},
                        {"$set": {"status": "PAID", "paid_at": now_iso}}
                    )
                    updated_count += 1

    return {"status": "success", "updated": updated_count, "msg": f"{updated_count} pagamento(s) Pix confirmado(s)!"}


# ==========================================
# 4. PACOTES, BAIXA MANUAL E LTV DO PACIENTE
# ==========================================
@finance_router.put("/packages/{package_id}/pay")
async def mark_package_as_paid_manually(package_id: str, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    pkg = await db.packages.find_one({"package_id": package_id, "owner_user_id": user.user_id})
    if not pkg:
        raise HTTPException(status_code=404, detail="Cobrança não encontrada.")

    now_iso = datetime.now(timezone.utc).isoformat()
    # Baixa manual não sofre desconto de taxa de Pix
    await db.packages.update_one(
        {"package_id": package_id},
        {"$set": {"status": "paid", "payment_method": "manual", "pix_fee": 0.0, "net_amount": float(pkg.get("amount", 0)), "payment_date": now_iso}}
    )
    await db.charges.update_one(
        {"package_id": package_id},
        {"$set": {"status": "PAID", "paid_at": now_iso}}
    )

    await log_audit_access(user.email, "BAIXA_MANUAL_COBRANCA", f"Pacote ID: {package_id}")
    return {"status": "success", "msg": "Baixa manual realizada com sucesso!"}

@finance_router.post("/packages")
async def create_package(payload: PackageCreate, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    pkg_id = f"pkg_{uuid.uuid4().hex[:12]}"
    doc = {
        "package_id": pkg_id,
        "owner_user_id": user.user_id,
        "patient_id": payload.patient_id,
        "name": payload.name,
        "title": payload.name,
        "sessions": payload.sessions,
        "amount": float(payload.amount),
        "payment_type": payload.payment_type,
        "auto_reminders": payload.auto_reminders,
        "currency": "brl",
        "status": "pending",
        "date": datetime.now().strftime("%d/%m/%Y"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.packages.insert_one(doc)
    doc.pop("_id", None)
    return doc

@finance_router.get("/packages")
async def list_packages(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    pkgs = await db.packages.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(200)
    for p in pkgs:
        p["_id"] = str(p["_id"])
        if not p.get("package_id"):
            p["package_id"] = str(p["_id"])
        if not p.get("name"):
            p["name"] = p.get("title", "Cobrança")
        if str(p.get("status", "")).lower() in ["pago", "paid", "concluido"]:
            p["status"] = "paid"
    return pkgs

@finance_router.post("/packages/checkout")
async def package_checkout(payload: dict, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso negado")
    package_id = payload.get("package_id")
    pkg = await db.packages.find_one({"package_id": package_id})
    if not pkg:
        raise HTTPException(status_code=404, detail="Pacote não encontrado")
    link_pagamento = pkg.get("invoice_url") or f"https://pagamento.seguro.clinica/checkout/{package_id}"
    await db.packages.update_one({"package_id": package_id}, {"$set": {"checkout_url": link_pagamento}})
    return {"url": link_pagamento, "session_id": "checkout_oficial"}

@finance_router.post("/patients/{patient_id}/financial/add")
async def add_financial_record(patient_id: str, payload: dict, user: User = Depends(get_current_user)):
    await verify_patient_ownership(patient_id, user)

    raw_amount = str(payload.get("amount", "0")).replace("R$", "").strip()
    if "," in raw_amount:
        raw_amount = raw_amount.replace(".", "").replace(",", ".")
    try:
        amount_val = float(raw_amount)
    except Exception:
        amount_val = 0.0

    raw_status = str(payload.get("status", "pago")).lower()
    normalized_status = "paid" if raw_status in ["pago", "paid", "concluido"] else "pending"
    title_str = str(payload.get("title", "Sessão Avulsa"))

    novo_pacote = {
        "package_id": f"pkg_{uuid.uuid4().hex[:10]}",
        "owner_user_id": user.user_id,
        "patient_id": str(patient_id),
        "name": title_str,
        "title": title_str,
        "amount": amount_val,
        "pix_fee": 0.0,
        "net_amount": amount_val,
        "status": normalized_status,
        "payment_type": "manual",
        "payment_method": "manual",
        "date": payload.get("date", datetime.now().strftime("%d/%m/%Y")),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.packages.insert_one(novo_pacote)
    await log_audit_access(user.email, "NOVA_VENDA_FINANCEIRA", patient_id)
    return {"status": "success", "message": "Registro financeiro adicionado!"}

@finance_router.get("/patients/{patient_id}/financial")
async def get_patient_financial(patient_id: str, user: User = Depends(get_current_user)):
    await verify_patient_ownership(patient_id, user)
    possiveis_ids = [patient_id, str(patient_id)]
    try:
        possiveis_ids.append(ObjectId(patient_id))
    except Exception:
        pass

    cursor = db.packages.find({"patient_id": {"$in": possiveis_ids}}).sort("_id", -1)
    pagamentos = await cursor.to_list(1000)

    ltv = 0.0
    historico_formatado = []
    for p in pagamentos:
        valor = float(p.get("amount", p.get("price", 0)))
        status_raw = str(p.get("status", "pago")).lower()
        is_paid = status_raw in ["pago", "paid", "concluido"]
        if is_paid:
            ltv += valor

        historico_formatado.append({
            "id": str(p.get("package_id") or p["_id"]),
            "title": p.get("title") or p.get("name") or "Pacote/Sessão",
            "amount": valor,
            "status": "pago" if is_paid else "pendente",
            "date": p.get("date") or str(p.get("created_at", ""))[:10]
        })

    await log_audit_access(user.email, "ACESSO_EXTRATO_FINANCEIRO", patient_id)
    return {
        "ltv": ltv,
        "status": "Adimplente" if ltv > 0 else "Sem Histórico",
        "history": historico_formatado
    }


# ==========================================
# 5. DASHBOARD, SALDO LÍQUIDO E SAQUE (PSICOBANK)
# ==========================================
@finance_router.post("/finance/expenses")
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

def _is_pix_gateway_paid(pkg: dict) -> bool:
    """Identifica se o pacote foi pago via Pix Asaas (sujeito à taxa de R$ 1,99)"""
    if pkg.get("payment_method") == "pix_asaas":
        return True
    if pkg.get("payment_type") == "pix" and pkg.get("payment_method") != "manual":
        return True
    return False

@finance_router.get("/finance/balance")
async def get_financial_balance(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    all_pkgs = await db.packages.find({"owner_user_id": user.user_id}).to_list(None)
    paid_pkgs = [p for p in all_pkgs if str(p.get("status", "")).lower() in ["paid", "pago", "concluido"]]
    pending_pkgs = [p for p in all_pkgs if str(p.get("status", "")).lower() in ["pending", "unpaid", "pendente"]]

    gross_earned = sum(float(p.get("amount", 0)) for p in paid_pkgs)
    pix_paid_count = sum(1 for p in paid_pkgs if _is_pix_gateway_paid(p))
    total_pix_fees = round(pix_paid_count * PIX_FEE_PER_TRANSACTION, 2)

    total_earned = max(0.0, round(gross_earned - total_pix_fees, 2))
    total_pending = sum(float(p.get("amount", 0)) for p in pending_pkgs)

    expenses = await db.expenses.find({"owner_user_id": user.user_id, "status": "pending"}).to_list(None)
    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)

    withdrawals = await db.withdrawals.find({"owner_user_id": user.user_id}).to_list(None)
    total_withdrawn = sum(float(w.get("amount", 0)) for w in withdrawals)

    available_balance = max(0.0, round(total_earned - total_withdrawn, 2))

    return {
        "available_balance": available_balance,
        "total_earned": total_earned,
        "gross_earned": gross_earned,
        "total_pix_fees": total_pix_fees,
        "pix_fee_unit": PIX_FEE_PER_TRANSACTION,
        "total_pending": total_pending,
        "total_expenses": total_expenses,
        "total_withdrawn": total_withdrawn
    }

@finance_router.get("/finance/dashboard")
async def get_finance_dashboard(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)

    all_pkgs = await db.packages.find({"owner_user_id": user.user_id}).to_list(None)
    paid_pkgs = [p for p in all_pkgs if str(p.get("status", "")).lower() in ["paid", "pago", "concluido"]]
    pending_pkgs = [p for p in all_pkgs if str(p.get("status", "")).lower() in ["pending", "unpaid", "pendente"]]

    gross_revenue = sum(float(p.get("amount", 0)) for p in paid_pkgs)
    pix_paid_count = sum(1 for p in paid_pkgs if _is_pix_gateway_paid(p))
    total_pix_fees = round(pix_paid_count * PIX_FEE_PER_TRANSACTION, 2)
    total_revenue = max(0.0, round(gross_revenue - total_pix_fees, 2))

    total_pending = sum(float(p.get("amount", 0)) for p in pending_pkgs)

    expenses = await db.expenses.find({"owner_user_id": user.user_id, "status": "pending"}).to_list(None)
    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)

    months_data = [0.0] * 12
    for p in paid_pkgs:
        try:
            m = int(str(p.get("created_at", ""))[5:7]) - 1
            if 0 <= m <= 11:
                val = float(p.get("amount", 0))
                fee = PIX_FEE_PER_TRANSACTION if _is_pix_gateway_paid(p) else 0.0
                months_data[m] += max(0.0, val - fee)
        except Exception:
            pass

    transactions = []
    for e in expenses:
        transactions.append({
            "id": e["expense_id"], "title": e["description"],
            "type": "expense", "amount": float(e["amount"]), "date": e["due_date"]
        })
    for p in pending_pkgs:
        title = p.get("name") or p.get("title") or "Cobrança"
        transactions.append({
            "id": p.get("package_id", str(p["_id"])),
            "title": title + (" (Paciente)" if p.get("patient_id") else ""),
            "type": "revenue", "amount": float(p.get("amount", 0)),
            "date": str(p.get("created_at", datetime.now().isoformat()))[:10]
        })

    transactions.sort(key=lambda x: x["date"])
    return {
        "total_revenue": total_revenue,
        "gross_revenue": gross_revenue,
        "total_pix_fees": total_pix_fees,
        "total_pending": total_pending,
        "total_expenses": total_expenses,
        "monthly_data": months_data,
        "transactions": transactions[:10]
    }

@finance_router.get("/finance/bank/statement")
async def get_bank_statement(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    bal = await get_financial_balance(user)
    saques = await db.withdrawals.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(None)
    for s in saques:
        s["_id"] = str(s["_id"])
    return {
        "saldo": bal["available_balance"],
        "historico": saques
    }

async def _execute_withdrawal(payload: WithdrawRequest, user: User):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Valor inválido para saque.")

    bal = await get_financial_balance(user)
    if payload.amount > bal["available_balance"]:
        raise HTTPException(status_code=400, detail="Saldo líquido insuficiente para este saque.")

    vault = await db.financial_vault.find_one({"owner_user_id": user.user_id})
    chave = (payload.destination or (vault.get("pix_key") if vault else "") or "").strip()
    if not chave:
        raise HTTPException(status_code=400, detail="Informe uma chave PIX de destino ou configure seu Cofre.")

    if not ASAAS_API_KEY:
        raise HTTPException(status_code=500, detail="Chave do Asaas ausente no servidor (.env).")

    clean_digits = re.sub(r"\D", "", chave)
    if "@" in chave:
        key_type = "EMAIL"
    elif len(clean_digits) == 11 and clean_digits.isdigit():
        key_type = "CPF"
    elif len(clean_digits) == 14 and clean_digits.isdigit():
        key_type = "CNPJ"
    elif chave.startswith("+55") or (len(clean_digits) in (10, 11) and clean_digits.isdigit()):
        key_type = "PHONE"
    else:
        key_type = "EVP"

    active_api_key = (vault.get("asaas_subaccount_key") if vault and vault.get("asaas_subaccount_key") else ASAAS_API_KEY)
    headers = {"access_token": active_api_key, "Content-Type": "application/json"}
    transfer_payload = {
        "value": float(payload.amount),
        "operationType": "PIX",
        "pixAddressKey": clean_digits if key_type in ["CPF", "CNPJ", "PHONE"] else chave,
        "pixAddressKeyType": key_type,
        "description": f"Saque Psicobank - {user.name}"
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(f"{ASAAS_API_URL}/transfers", json=transfer_payload, headers=headers)
        if resp.status_code not in (200, 201):
            try:
                error_msg = resp.json().get("errors", [{}])[0].get("description", resp.text)
            except Exception:
                error_msg = resp.text
            raise HTTPException(status_code=400, detail=f"Banco recusou o saque: {error_msg}")

        transfer_data = resp.json()
        doc = {
            "withdrawal_id": transfer_data.get("id", f"wd_{uuid.uuid4().hex[:10]}"),
            "owner_user_id": user.user_id,
            "type": "WITHDRAWAL",
            "amount": float(payload.amount),
            "destination": chave,
            "status": "COMPLETED",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.withdrawals.insert_one(doc)
        await log_audit_access(user.email, "SAQUE_PIX_REALIZADO", f"Chave: {chave} | R$ {payload.amount}")
        return {"status": "success", "msg": "Transferência PIX enviada pelo banco com sucesso!"}

@finance_router.post("/finance/bank/withdraw")
async def request_bank_withdrawal(payload: WithdrawRequest, user: User = Depends(get_current_user)):
    return await _execute_withdrawal(payload, user)

@finance_router.post("/finance/withdraw")
async def request_withdrawal_legacy(payload: WithdrawRequest, user: User = Depends(get_current_user)):
    return await _execute_withdrawal(payload, user)


# ==========================================
# 6. CONVÊNIOS (TISS), NFSE, DMED E PDFS FISCAIS
# ==========================================
@finance_router.get("/finance/covenants")
async def get_covenants(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    lotes = await db.covenants.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(50)
    for l in lotes:
        l["_id"] = str(l["_id"])
    return lotes

@finance_router.post("/finance/covenants/tiss")
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

@finance_router.get("/finance/nfse")
async def get_nfse(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    notas = await db.nfse.find({"owner_user_id": user.user_id}).sort("created_at", -1).to_list(50)
    for n in notas:
        n["_id"] = str(n["_id"])
    return notas

@finance_router.post("/finance/nfse/emit")
async def emit_nfse(payload: NFSeRequest, user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    doc = {
        "nfse_id": f"nfse_{uuid.uuid4().hex[:10]}",
        "owner_user_id": user.user_id,
        "numero_nota": f"2026{str(uuid.uuid4().int)[:4]}",
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

@finance_router.get("/finance/dmed/export")
async def export_dmed(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403)
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": {"$in": ["paid", "pago"]}}).to_list(None)
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["CPF_PAGADOR", "NOME_PACIENTE", "DESCRICAO_SERVICO", "DATA_PAGAMENTO", "VALOR_RECEBIDO"])
    for p in paid_pkgs:
        nome = p.get("patient_name") or p.get("name", "Paciente")
        valor = float(p.get("amount", 0.0))
        data = str(p.get("created_at", ""))[:10]
        writer.writerow(["000.000.000-00", nome, "Servicos Fonoaudiologicos", data, f"{valor:.2f}".replace(".", ",")])
    output.seek(0)
    response = Response(content=output.getvalue())
    response.headers["Content-Disposition"] = f"attachment; filename=Lote_DMED_Receita_Federal_{datetime.now().year}.csv"
    response.headers["Content-Type"] = "text/csv; charset=utf-8"
    return response

@finance_router.get("/finance/covenants/repasse/pdf")
async def download_repasse_pdf(user: User = Depends(get_current_user)):
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")
    paid_pkgs = await db.packages.find({"owner_user_id": user.user_id, "status": {"$in": ["paid", "pago"]}}).to_list(None)
    total_revenue = sum(float(p.get("amount", 0)) for p in paid_pkgs)
    parte_clinica = total_revenue * 0.30
    parte_prof = total_revenue * 0.70

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(name='TitleStyle', parent=styles['Heading1'], textColor=colors.HexColor('#D46F54'), alignment=1)
    sub_style = ParagraphStyle(name='SubStyle', parent=styles['Normal'], textColor=colors.HexColor('#57534E'), alignment=1, fontSize=10)

    story = [
        Paragraph("<b>CENTRAL FINANCEIRA INTEGRADA</b>", sub_style),
        Paragraph("<b>FECHAMENTO DE REPASSES E COMISSÕES</b>", title_style),
        Spacer(1, 30),
        Paragraph(f"<b>Data de Fechamento:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal']),
        Paragraph(f"<b>Profissional Responsável:</b> {user.name}", styles['Normal']),
        Spacer(1, 20)
    ]
    data = [
        ['Descrição', 'Percentual (%)', 'Valor Líquido (R$)'],
        ['Faturamento Total Bruto', '100%', f'R$ {total_revenue:,.2f}'.replace(',', 'v').replace('.', ',').replace('v', '.')],
        ['Retenção da Clínica', '30%', f'- R$ {parte_clinica:,.2f}'.replace(',', 'v').replace('.', ',').replace('v', '.')],
        ['Repasse ao Profissional', '70%', f'+ R$ {parte_prof:,.2f}'.replace(',', 'v').replace('.', ',').replace('v', '.')],
    ]
    t = Table(data, colWidths=[250, 100, 150])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3E7E4')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.HexColor('#B75C46')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('ALIGN', (0, 1), (0, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 12),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#FAFAFA')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E7E5E4')),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('TEXTCOLOR', (0, -1), (-1, -1), colors.HexColor('#10B981')),
    ]))
    story.extend([
        t, Spacer(1, 50),
        Paragraph("___________________________________________________", styles['Normal']),
        Paragraph("<b>Assinatura da Coordenação Clínica</b>", styles['Normal']),
        Spacer(1, 30),
        Paragraph("___________________________________________________", styles['Normal']),
        Paragraph(f"<b>{user.name}</b>", styles['Normal'])
    ])
    doc.build(story)
    buffer.seek(0)
    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Folha_Repasse_{datetime.now().strftime('%d_%m_%Y')}.pdf"}
    )

@finance_router.post("/reports/irpf")
async def generate_irpf(payload: IRPFRequest, user: User = Depends(get_current_user)):
    """Emissão Oficial do Recibo IRPF em PDF com ReportLab e Log de Auditoria LGPD"""
    if user.role != "doctor":
        raise HTTPException(status_code=403, detail="Acesso restrito")

    pat = await db.patients.find_one({"patient_id": payload.patient_id})
    if not pat:
        raise HTTPException(status_code=404, detail="Paciente não encontrado")

    await db.audit_logs.insert_one({
        "action": "EMISSAO_IRPF",
        "user_id": user.user_id,
        "patient_id": payload.patient_id,
        "details": f"Usuário {user.name} gerou recibo fiscal IRPF ({payload.year}) para CPF: {payload.payer_cpf} no valor de R$ {payload.total_amount}",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("<b>RECIBO DE PRESTAÇÃO DE SERVIÇOS FONOAUDIOLÓGICOS</b>", styles['Heading2']),
        Spacer(1, 20),
        Paragraph(
            f"Recebi de <b>{payload.payer_name}</b>, inscrito(a) no CPF sob o nº <b>{payload.payer_cpf}</b>, "
            f"a importância de <b>R$ {payload.total_amount:.2f}</b>, referente a sessões de fonoaudiologia "
            f"realizadas para o paciente <b>{pat.get('name')}</b> durante o ano de <b>{payload.year}</b>.",
            styles['Normal']
        ),
        Spacer(1, 40),
        Paragraph("Declaro ter recebido o valor acima descrito.", styles['Normal']),
        Spacer(1, 60),
        Paragraph(f"<b>Emitente:</b> {user.name}", styles['Normal']),
        Paragraph(f"<b>Data de Emissão:</b> {datetime.now().strftime('%d/%m/%Y')}", styles['Normal'])
    ]
    doc.build(story)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=IRPF_{payload.year}_{pat['name'].replace(' ', '_')}.pdf"}
    )