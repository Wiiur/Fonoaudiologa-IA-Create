import asyncio
import uuid
from datetime import datetime, timezone
from core import db, hash_password

async def menu_beta():
    while True:
        print("\n" + "="*55)
        print("🔒 GERENCIADOR DO BETA FECHADO - VOXINTELLIGENCE (DEV)")
        print("="*55)
        print("1. Liberar / Criar Conta para Doutor(a) no Beta")
        print("2. Listar Doutores(as) Cadastrados no Beta")
        print("3. Bloquear / Revogar Acesso de um Doutor(a)")
        print("4. Reativar Acesso de um Doutor(a)")
        print("0. Sair")
        print("-"*55)
        
        opcao = input("Escolha uma opção: ").strip()

        if opcao == "1":
            print("\n--- NOVO DOUTOR(A) CONVIDADO(A) ---")
            nome = input("Nome Completo (ex: Dra. Carla Souza): ").strip()
            email = input("E-mail de Login: ").strip().lower()
            senha = input("Senha Provisória (mín. 6 dígitos): ").strip()
            crfa = input("Número do CRFa (ex: 12345) [Enter p/ padrão]: ").strip() or "12345"
            uf = input("UF do CRFa (ex: SP) [Enter p/ SP]: ").strip().upper() or "SP"

            if not nome or not email or not senha:
                print("❌ Erro: Nome, E-mail e Senha são obrigatórios!")
                continue

            existing = await db.users.find_one({"email": email})
            user_id = existing["user_id"] if existing else f"user_{uuid.uuid4().hex[:12]}"

            doc = {
                "user_id": user_id,
                "email": email,
                "name": nome,
                "professional_name": nome,
                "role": "doctor",
                "crfa_number": crfa,
                "crfa_state": uf,
                "password_hash": hash_password(senha),
                "status": "active",
                "beta_tester": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }

            await db.users.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
            print(f"\n✅ SUCESSO! Conta criada/atualizada no MongoDB Atlas!")
            print(f"👉 O(a) {nome} já pode entrar com:")
            print(f"   • E-mail: {email}")
            print(f"   • Senha:  {senha} (ou clicando em 'Entrar com Google' usando este mesmo e-mail!)")

        elif opcao == "2":
            print("\n--- DOUTORES(AS) NO BETA FECHADO ---")
            doutores = await db.users.find({"role": "doctor"}).to_list(100)
            if not doutores:
                print("Nenhum doutor cadastrado ainda.")
            for idx, d in enumerate(doutores, 1):
                st = "🟢 ATIVO" if d.get("status", "active") == "active" else "🔴 BLOQUEADO"
                print(f"{idx}. {st} | {d.get('name')} | {d.get('email')} | CRFa: {d.get('crfa_number', 'N/A')}-{d.get('crfa_state', 'SP')} | ID: {d.get('user_id')}")

        elif opcao == "3":
            email = input("\nDigite o e-mail do doutor(a) que deseja BLOQUEAR: ").strip().lower()
            res = await db.users.update_one({"email": email}, {"$set": {"status": "blocked"}})
            if res.matched_count:
                user_doc = await db.users.find_one({"email": email})
                if user_doc:
                    await db.user_sessions.delete_many({"user_id": user_doc["user_id"]})
                print(f"🔴 Acesso de {email} bloqueado e sessões encerradas imediatamente!")
            else:
                print("⚠️ E-mail não encontrado.")

        elif opcao == "4":
            email = input("\nDigite o e-mail do doutor(a) que deseja REATIVAR: ").strip().lower()
            res = await db.users.update_one({"email": email}, {"$set": {"status": "active"}})
            if res.matched_count:
                print(f"🟢 Acesso de {email} reativado com sucesso!")
            else:
                print("⚠️ E-mail não encontrado.")

        elif opcao == "0":
            print("Saindo do Gerenciador Beta...")
            break

if __name__ == "__main__":
    asyncio.run(menu_beta())
    