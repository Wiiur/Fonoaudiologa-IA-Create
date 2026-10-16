import os
import uuid
import asyncio
import getpass
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from core import hash_password

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

async def menu_beta():
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(mongo_url)
    db = client[os.environ.get("DB_NAME", "fono_db")]

    while True:
        print("\n" + "="*55)
        print("🔒 GERENCIADOR DO BETA FECHADO - VOXINTELLIGENCE (DEV)")
        print("="*55)
        print("1. Liberar / Atualizar Senha de Doutor(a) no Beta")
        print("2. Listar Doutores(as) Cadastrados no Beta")
        print("3. Bloquear / Revogar Acesso de um Doutor(a)")
        print("0. Sair")
        print("-"*55)
        
        opcao = input("Escolha uma opção: ").strip()

        if opcao == "1":
            print("\n--- CADASTRO / ATUALIZAÇÃO SEGURA ---")
            nome = input("Nome Completo: ").strip()
            email = input("E-mail de Login: ").strip().lower()
            # getpass oculta a senha na tela e não deixa rastro em arquivos!
            senha = getpass.getpass("Digite a Senha (ficará oculta): ").strip()
            crfa = input("Número do CRFa [Enter p/ 12345]: ").strip() or "12345"
            uf = input("UF do CRFa [Enter p/ SP]: ").strip().upper() or "SP"

            if not nome or not email or not senha:
                print("❌ Erro: Nome, E-mail e Senha são obrigatórios!")
                continue

            existing = await db.users.find_one({"email": email})
            user_id = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"
            pwd_hash = hash_password(senha)

            # 1. Salva/Atualiza na coleção principal de usuários (db.users)
            doc_user = {
                "user_id": user_id,
                "email": email,
                "name": nome,
                "professional_name": nome,
                "role": "doctor",
                "crfa_number": crfa,
                "crfa_state": uf,
                "password_hash": pwd_hash,
                "password": pwd_hash,
                "status": "active",
                "beta_tester": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.users.update_one({"email": email}, {"$set": doc_user}, upsert=True)

            # 2. Sincroniza também em db.team para compatibilidade imediata com /team/login
            doc_team = {
                "id": user_id,
                "user_id": user_id,
                "owner_user_id": user_id,
                "name": nome,
                "email": email,
                "role": "doctor",
                "status": "Ativo",
                "isOwner": True,
                "password": senha,
                "password_hash": pwd_hash,
                "permissions": {"agenda": True, "clinical": True, "financial": True}
            }
            await db.team.update_one({"email": email}, {"$set": doc_team}, upsert=True)

            print(f"\n✅ SUCESSO! Credenciais de {email} sincronizadas na nuvem com segurança!")

        elif opcao == "2":
            doutores = await db.users.find({"role": "doctor"}).to_list(100)
            for idx, d in enumerate(doutores, 1):
                st = "🟢 ATIVO" if d.get("status", "active") == "active" else "🔴 BLOQUEADO"
                print(f"{idx}. {st} | {d.get('name')} | {d.get('email')}")

        elif opcao == "3":
            email = input("\nE-mail para BLOQUEAR: ").strip().lower()
            await db.users.update_one({"email": email}, {"$set": {"status": "blocked"}})
            await db.team.update_one({"email": email}, {"$set": {"status": "Bloqueado"}})
            print(f"🔴 Acesso de {email} bloqueado!")

        elif opcao == "0":
            client.close()
            break

if __name__ == "__main__":
    asyncio.run(menu_beta())