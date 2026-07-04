"""Seed test doctor + patient for backend tests. Idempotent."""
import asyncio
import os
import sys
from datetime import datetime, timezone, timedelta

# Load env like server.py does
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from motor.motor_asyncio import AsyncIOMotorClient


DOCTOR_USER_ID = "user_test_doctor_001"
DOCTOR_SESSION = "test_session_doctor_001"
DOCTOR_EMAIL = "dr.test@voxintel.dev"
PATIENT_ID = "pat_test_001"

OTHER_USER_ID = "user_test_other_002"
OTHER_SESSION = "test_session_other_002"
OTHER_EMAIL = "dr.other@voxintel.dev"


async def seed():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    expires = (now + timedelta(days=7)).isoformat()

    # Doctor user + session
    await db.users.update_one(
        {"user_id": DOCTOR_USER_ID},
        {"$set": {
            "user_id": DOCTOR_USER_ID,
            "email": DOCTOR_EMAIL,
            "name": "Dr. Test User",
            "role": "doctor",
            "professional_name": "Dr. Test",
            "crfa_number": "12345",
            "crfa_state": "SP",
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )
    await db.user_sessions.update_one(
        {"session_token": DOCTOR_SESSION},
        {"$set": {
            "user_id": DOCTOR_USER_ID,
            "session_token": DOCTOR_SESSION,
            "expires_at": expires,
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )

    # Other doctor user + session for ownership tests
    await db.users.update_one(
        {"user_id": OTHER_USER_ID},
        {"$set": {
            "user_id": OTHER_USER_ID,
            "email": OTHER_EMAIL,
            "name": "Dr. Other",
            "role": "doctor",
            "professional_name": "Dr. Other",
            "crfa_number": "99999",
            "crfa_state": "RJ",
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )
    await db.user_sessions.update_one(
        {"session_token": OTHER_SESSION},
        {"$set": {
            "user_id": OTHER_USER_ID,
            "session_token": OTHER_SESSION,
            "expires_at": expires,
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )

    # Patient owned by doctor
    await db.patients.update_one(
        {"patient_id": PATIENT_ID},
        {"$set": {
            "patient_id": PATIENT_ID,
            "owner_user_id": DOCTOR_USER_ID,
            "name": "TEST_ Patient",
            "email": "test.patient@voxintel.dev",
            "diagnosis": "Disfonia funcional (teste)",
            "age": 45,
            "status": "active",
            "created_at": now.isoformat(),
        }},
        upsert=True,
    )

    print("Seeded doctor, other-doctor, and patient.")
    client.close()


if __name__ == "__main__":
    asyncio.run(seed())
