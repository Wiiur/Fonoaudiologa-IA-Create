"""VoxIntelligence backend tests: Vocal CHALLENGES module (iteration 2).

Covers:
- GET /api/voice/challenges/catalog
- POST /api/voice/challenges/attempt (7 challenge types)
- GET /api/voice/challenges/attempts
- GET /api/voice/challenges/audio/{attempt_id}
- DELETE /api/voice/challenges/attempts/{attempt_id}
"""
from __future__ import annotations

import io
import os
import wave
from pathlib import Path
from typing import Optional

import numpy as np
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

DOCTOR_TOKEN = "test_session_doctor_001"
OTHER_TOKEN = "test_session_other_002"
DOCTOR_USER_ID = "user_test_doctor_001"
PATIENT_ID = "pat_test_001"

STORAGE_ROOT = Path("/app/backend/storage_data")

EXPECTED_CATALOG_IDS = {
    "sustained_vowel", "mpt", "ddk_pataka",
    "glissando", "loudness_range", "sz_ratio", "reading",
}


# ---- Fixtures ----
@pytest.fixture(scope="module")
def api() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {DOCTOR_TOKEN}"})
    return s


@pytest.fixture(scope="module")
def other_api() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OTHER_TOKEN}"})
    return s


def _sine_wav(duration_sec: float = 3.0, freq: float = 180.0, sr: int = 22050) -> bytes:
    t = np.linspace(0, duration_sec, int(sr * duration_sec), endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(samples.tobytes())
    return buf.getvalue()


def _sweep_wav(f_start: float, f_end: float, duration_sec: float = 5.0, sr: int = 22050) -> bytes:
    """Linear frequency sweep (glissando)."""
    n = int(sr * duration_sec)
    t = np.linspace(0, duration_sec, n, endpoint=False)
    # Linear chirp: phase = 2π ∫ f(τ) dτ where f(τ) = f_start + (f_end-f_start)*τ/duration
    k = (f_end - f_start) / duration_sec
    phase = 2 * np.pi * (f_start * t + 0.5 * k * t * t)
    samples = (0.5 * np.sin(phase) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(samples.tobytes())
    return buf.getvalue()


# Track ids for cleanup
_created_attempts: list = []


# ============================================================
# CATALOG
# ============================================================
class TestCatalog:
    def test_catalog_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/voice/challenges/catalog", timeout=15)
        assert r.status_code == 401

    def test_catalog_returns_seven(self, api):
        r = api.get(f"{BASE_URL}/api/voice/challenges/catalog", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 7
        ids = {c["id"] for c in data}
        assert ids == EXPECTED_CATALOG_IDS
        # Each has required fields
        for c in data:
            for k in ("id", "title", "instruction", "target", "target_duration_sec"):
                assert k in c, f"missing {k} in {c.get('id')}"
            assert isinstance(c["target_duration_sec"], (int, float))


# ============================================================
# ATTEMPT — validation errors
# ============================================================
class TestAttemptValidation:
    def test_requires_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("a.wav", _sine_wav(2.0), "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": "sustained_vowel"},
            timeout=60,
        )
        assert r.status_code == 401

    def test_unknown_challenge_type_400(self, api):
        r = api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("a.wav", _sine_wav(2.0), "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": "banana"},
            timeout=60,
        )
        assert r.status_code == 400

    def test_unknown_patient_404(self, api):
        r = api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("a.wav", _sine_wav(2.0), "audio/wav")},
            data={"patient_id": "pat_nonexistent_xyz", "challenge_type": "sustained_vowel"},
            timeout=60,
        )
        assert r.status_code == 404

    def test_non_doctor_forbidden(self, other_api):
        # other doctor doesn't own pat_test_001 → 403 (explicit ownership check applied)
        r = other_api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("a.wav", _sine_wav(2.0), "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": "sustained_vowel"},
            timeout=60,
        )
        # role=doctor but not the owner → 403 for ownership isolation
        assert r.status_code == 403


# ============================================================
# ATTEMPT — happy path for each of 7 challenge types
# ============================================================
class TestAttemptEachChallenge:
    def _do(self, api, wav_bytes: bytes, challenge_type: str) -> dict:
        r = api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": (f"{challenge_type}.wav", wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": challenge_type,
                  "notes": f"TEST {challenge_type}"},
            timeout=180,
        )
        assert r.status_code == 200, f"{challenge_type}: {r.status_code} body={r.text[:400]}"
        d = r.json()
        assert d["attempt_id"].startswith("ch_")
        assert d["patient_id"] == PATIENT_ID
        assert d["owner_user_id"] == DOCTOR_USER_ID
        assert d["challenge_type"] == challenge_type
        assert d["storage_key"].startswith(f"challenges/{DOCTOR_USER_ID}/{PATIENT_ID}/")
        assert "task_metrics" in d and isinstance(d["task_metrics"], dict)
        assert "evaluation" in d and "grade" in d["evaluation"]
        assert d["evaluation"]["grade"] in {"ok", "warn", "alert", "info"}
        _created_attempts.append(d["attempt_id"])
        return d

    def test_sustained_vowel(self, api):
        d = self._do(api, _sine_wav(4.0, 180.0), "sustained_vowel")
        # Base acoustic metrics should be present
        m = d["metrics"]
        assert m.get("f0_mean_hz") is not None
        assert abs(m["f0_mean_hz"] - 180.0) <= 3.0

    def test_mpt_8s_alert_or_warn(self, api):
        # 8-second sustained sine — expect voiced ≈ 8s → below 20s threshold → warn/alert
        d = self._do(api, _sine_wav(8.0, 180.0), "mpt")
        tm = d["task_metrics"]
        assert "mpt_seconds" in tm
        mpt = tm["mpt_seconds"]
        assert 7.0 <= mpt <= 8.5, f"mpt_seconds={mpt} not in 7..8.5"
        assert d["evaluation"]["grade"] in {"alert", "warn"}

    def test_glissando_100_to_400_hz(self, api):
        d = self._do(api, _sweep_wav(100.0, 400.0, 5.0), "glissando")
        tm = d["task_metrics"]
        assert "range_semitones" in tm and tm["range_semitones"] is not None
        assert 20.0 <= tm["range_semitones"] <= 26.0, f"range={tm['range_semitones']}"
        assert "f0_min_hz" in tm and "f0_max_hz" in tm
        # Praat pitch tracker has tolerance; check ballparks
        assert 80 <= tm["f0_min_hz"] <= 130, f"f0_min={tm['f0_min_hz']}"
        assert 350 <= tm["f0_max_hz"] <= 450, f"f0_max={tm['f0_max_hz']}"

    def test_ddk_pataka(self, api):
        d = self._do(api, _sine_wav(4.0, 180.0), "ddk_pataka")
        tm = d["task_metrics"]
        assert "syllable_count" in tm
        assert "ddk_rate_syll_per_sec" in tm

    def test_loudness_range(self, api):
        d = self._do(api, _sine_wav(3.0, 180.0), "loudness_range")
        tm = d["task_metrics"]
        for k in ("intensity_min_db", "intensity_max_db", "intensity_range_db"):
            assert k in tm and isinstance(tm[k], (int, float)), f"missing/invalid {k}"

    def test_sz_ratio(self, api):
        d = self._do(api, _sine_wav(4.0, 180.0), "sz_ratio")
        tm = d["task_metrics"]
        for k in ("s_duration_sec", "z_duration_sec", "sz_ratio"):
            assert k in tm, f"missing {k}"

    def test_reading(self, api):
        d = self._do(api, _sine_wav(4.0, 180.0), "reading")
        tm = d["task_metrics"]
        assert "syllable_count" in tm
        assert "speech_rate_syll_per_sec" in tm


# ============================================================
# LIST + AUDIO + DELETE + OWNERSHIP
# ============================================================
class TestListAudioDelete:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/voice/challenges/attempts", timeout=15)
        assert r.status_code == 401

    def test_list_owner_only(self, api, other_api):
        # Ensure at least one attempt exists (xdist-safe)
        api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("list.wav", _sine_wav(3.0, 180.0), "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": "sustained_vowel"},
            timeout=180,
        )
        r = api.get(f"{BASE_URL}/api/voice/challenges/attempts", timeout=15)
        assert r.status_code == 200
        docs = r.json()
        assert isinstance(docs, list) and len(docs) >= 1
        for d in docs:
            assert d["owner_user_id"] == DOCTOR_USER_ID

        r2 = other_api.get(f"{BASE_URL}/api/voice/challenges/attempts", timeout=15)
        assert r2.status_code == 200
        # other doctor should see none of doctor's attempts
        for d in r2.json():
            assert d["owner_user_id"] != DOCTOR_USER_ID

    def test_list_filter_patient(self, api):
        r = api.get(f"{BASE_URL}/api/voice/challenges/attempts?patient_id={PATIENT_ID}", timeout=15)
        assert r.status_code == 200
        for d in r.json():
            assert d["patient_id"] == PATIENT_ID

    def _create_attempt(self, api) -> dict:
        """Helper: create a fresh attempt so this test class is xdist-safe."""
        r = api.post(
            f"{BASE_URL}/api/voice/challenges/attempt",
            files={"file": ("helper.wav", _sine_wav(3.0, 180.0), "audio/wav")},
            data={"patient_id": PATIENT_ID, "challenge_type": "sustained_vowel"},
            timeout=180,
        )
        assert r.status_code == 200, r.text[:300]
        return r.json()

    def test_audio_owner_ok(self, api):
        d = self._create_attempt(api)
        r = api.get(f"{BASE_URL}/api/voice/challenges/audio/{d['attempt_id']}", timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 1000
        assert r.content[:4] == b"RIFF"

    def test_audio_non_owner_forbidden(self, api, other_api):
        d = self._create_attempt(api)
        r = other_api.get(f"{BASE_URL}/api/voice/challenges/audio/{d['attempt_id']}", timeout=15)
        assert r.status_code == 403

    def test_audio_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/voice/challenges/audio/ch_missing00000000", timeout=15)
        assert r.status_code == 404

    def test_delete_non_owner_forbidden(self, api, other_api):
        d = self._create_attempt(api)
        r = other_api.delete(f"{BASE_URL}/api/voice/challenges/attempts/{d['attempt_id']}", timeout=15)
        assert r.status_code == 403

    def test_delete_unknown_404(self, api):
        r = api.delete(f"{BASE_URL}/api/voice/challenges/attempts/ch_missing00000000", timeout=15)
        assert r.status_code == 404

    def test_delete_owner_ok(self, api):
        d = self._create_attempt(api)
        fpath = STORAGE_ROOT / d["storage_key"]
        assert fpath.exists()
        r = api.delete(f"{BASE_URL}/api/voice/challenges/attempts/{d['attempt_id']}", timeout=15)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        assert not fpath.exists()


# ============================================================
# CLEANUP
# ============================================================
@pytest.fixture(scope="module", autouse=True)
def _cleanup(request):
    yield
    try:
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {DOCTOR_TOKEN}"})
        docs = s.get(f"{BASE_URL}/api/voice/challenges/attempts?patient_id={PATIENT_ID}", timeout=15).json()
        for d in docs:
            s.delete(f"{BASE_URL}/api/voice/challenges/attempts/{d['attempt_id']}", timeout=15)
    except Exception:
        pass
