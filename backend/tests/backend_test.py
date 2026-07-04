"""VoxIntelligence backend tests: CORS + Voice Analysis + Regression.

Run:
    pytest /app/backend/tests/backend_test.py -v --tb=short \
      --junitxml=/app/test_reports/pytest/pytest_results.xml
"""
from __future__ import annotations

import io
import json
import os
import struct
import time
import wave
from pathlib import Path
from typing import Optional

import numpy as np
import pytest
import requests

# ---- Config ----
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to reading frontend/.env
    fe = Path("/app/frontend/.env").read_text()
    for line in fe.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

DOCTOR_TOKEN = "test_session_doctor_001"
OTHER_TOKEN = "test_session_other_002"
DOCTOR_USER_ID = "user_test_doctor_001"
PATIENT_ID = "pat_test_001"

ALLOWED_ORIGIN = "https://vocal-acoustic-lab.preview.emergentagent.com"
DISALLOWED_ORIGIN = "https://evil.example.com"

STORAGE_ROOT = Path("/app/backend/storage_data")


# ---- Fixtures ----
@pytest.fixture(scope="session")
def api() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {DOCTOR_TOKEN}"})
    return s


@pytest.fixture(scope="session")
def other_api() -> requests.Session:
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {OTHER_TOKEN}"})
    return s


@pytest.fixture(scope="session")
def sine_wav_bytes() -> bytes:
    """Generate a 3s 180Hz sine wave WAV (mono, 22050Hz, 16-bit)."""
    sr = 22050
    dur = 3.0
    freq = 180.0
    t = np.linspace(0, dur, int(sr * dur), endpoint=False)
    samples = (0.5 * np.sin(2 * np.pi * freq * t) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(samples.tobytes())
    return buf.getvalue()


# ============================================================
# 1. CORS HARDENING
# NOTE: The public (Cloudflare/ingress) URL rewrites CORS headers to `*`
# regardless of what FastAPI returns. To validate the app's own CORS
# hardening we exercise the backend directly at localhost:8001.
# ============================================================
BACKEND_INTERNAL = "http://localhost:8001"


class TestCORS:
    def test_preflight_allowed_origin_backend_direct(self):
        r = requests.options(
            f"{BACKEND_INTERNAL}/api/patients",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204), f"preflight status={r.status_code}"
        acao = r.headers.get("access-control-allow-origin")
        assert acao == ALLOWED_ORIGIN, f"Expected allow-origin={ALLOWED_ORIGIN}, got {acao}"
        assert r.headers.get("access-control-allow-credentials", "").lower() == "true"

    def test_preflight_disallowed_origin_backend_direct(self):
        r = requests.options(
            f"{BACKEND_INTERNAL}/api/patients",
            headers={
                "Origin": DISALLOWED_ORIGIN,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=15,
        )
        acao = r.headers.get("access-control-allow-origin")
        # Backend must NOT echo evil origin back
        assert acao != DISALLOWED_ORIGIN, f"Disallowed origin echoed: {acao}"
        assert acao is None or acao == "", f"Unexpected allow-origin: {acao}"

    def test_preview_regex_origin_backend_direct(self):
        """Any *.preview.emergentagent.com should be permitted via allow_origin_regex."""
        preview_origin = "https://random-preview-xyz.preview.emergentagent.com"
        r = requests.options(
            f"{BACKEND_INTERNAL}/api/patients",
            headers={
                "Origin": preview_origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
            timeout=15,
        )
        assert r.status_code in (200, 204)
        assert r.headers.get("access-control-allow-origin") == preview_origin

    def test_actual_get_from_allowed_origin_backend_direct(self):
        r = requests.get(
            f"{BACKEND_INTERNAL}/api/patients",
            headers={
                "Origin": ALLOWED_ORIGIN,
                "Authorization": f"Bearer {DOCTOR_TOKEN}",
            },
            timeout=15,
        )
        assert r.status_code == 200
        assert r.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


# ============================================================
# 2. VOICE UPLOAD + ACOUSTIC METRICS
# ============================================================
_uploaded_analysis_id: Optional[str] = None


class TestVoiceUpload:
    def test_upload_requires_auth(self, sine_wav_bytes):
        r = requests.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("sine.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel"},
            timeout=60,
        )
        assert r.status_code == 401

    def test_upload_sine_wave_returns_metrics(self, api, sine_wav_bytes):
        global _uploaded_analysis_id
        r = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("sine180.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel", "notes": "TEST sine180"},
            timeout=120,
        )
        assert r.status_code == 200, f"body={r.text[:400]}"
        doc = r.json()

        # Structural assertions
        assert "analysis_id" in doc and doc["analysis_id"].startswith("vox_")
        assert doc["patient_id"] == PATIENT_ID
        assert doc["owner_user_id"] == DOCTOR_USER_ID
        assert doc["storage_backend"] == "local"
        assert doc["storage_key"].startswith(f"voice/{DOCTOR_USER_ID}/{PATIENT_ID}/")
        assert doc["report"] is None

        # Metrics structural
        m = doc["metrics"]
        expected_keys = {
            "duration_sec", "phonation_time_sec", "f0_mean_hz", "f0_std_hz",
            "jitter_local_pct", "shimmer_local_pct", "hnr_db",
            "f1_hz", "f2_hz", "f3_hz", "intensity_db", "cpp_db",
        }
        assert expected_keys.issubset(m.keys()), f"missing keys: {expected_keys - set(m.keys())}"

        # Value assertions for 180Hz sine
        assert m["duration_sec"] is not None and 2.5 <= m["duration_sec"] <= 3.5
        assert m["f0_mean_hz"] is not None
        assert abs(m["f0_mean_hz"] - 180.0) <= 2.0, f"f0={m['f0_mean_hz']}"
        assert m["jitter_local_pct"] is not None and m["jitter_local_pct"] < 0.5, \
            f"jitter too high: {m['jitter_local_pct']}"
        assert m["shimmer_local_pct"] is not None and m["shimmer_local_pct"] < 0.5, \
            f"shimmer too high: {m['shimmer_local_pct']}"
        assert m["hnr_db"] is not None and m["hnr_db"] > 30.0, f"hnr={m['hnr_db']}"

        # File must actually exist on local disk
        fpath = STORAGE_ROOT / doc["storage_key"]
        assert fpath.exists(), f"file not written: {fpath}"
        assert fpath.stat().st_size > 1000

        _uploaded_analysis_id = doc["analysis_id"]

    def test_upload_rejects_small_file(self, api):
        r = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("tiny.wav", b"RIFF" + b"\x00" * 20, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel"},
            timeout=30,
        )
        assert r.status_code == 400

    def test_upload_rejects_unknown_patient(self, api, sine_wav_bytes):
        r = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("s.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": "pat_nonexistent_999", "task": "sustained_vowel"},
            timeout=60,
        )
        assert r.status_code == 404


# ============================================================
# 3. VOICE LIST
# ============================================================
class TestVoiceList:
    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/voice/analyses", timeout=15)
        assert r.status_code == 401

    def test_list_returns_array(self, api):
        r = api.get(f"{BASE_URL}/api/voice/analyses", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert any(d["analysis_id"] == _uploaded_analysis_id for d in data), \
            "uploaded analysis missing from list"

    def test_list_filter_by_patient(self, api):
        r = api.get(f"{BASE_URL}/api/voice/analyses?patient_id={PATIENT_ID}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 1
        for d in data:
            assert d["patient_id"] == PATIENT_ID

    def test_list_filter_other_patient_empty(self, api):
        r = api.get(f"{BASE_URL}/api/voice/analyses?patient_id=pat_nonexistent_xyz", timeout=15)
        assert r.status_code == 200
        assert r.json() == []


# ============================================================
# 4. VOICE GET (ownership)
# ============================================================
class TestVoiceGet:
    def test_get_unknown_returns_404(self, api):
        r = api.get(f"{BASE_URL}/api/voice/analyses/vox_doesnotexist12", timeout=15)
        assert r.status_code == 404

    def test_get_by_owner_returns_full_doc(self, api):
        assert _uploaded_analysis_id, "prior upload test must run first"
        r = api.get(f"{BASE_URL}/api/voice/analyses/{_uploaded_analysis_id}", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["analysis_id"] == _uploaded_analysis_id
        assert "metrics" in d and d["metrics"]["f0_mean_hz"] is not None

    def test_get_by_non_owner_forbidden(self, other_api):
        assert _uploaded_analysis_id
        r = other_api.get(f"{BASE_URL}/api/voice/analyses/{_uploaded_analysis_id}", timeout=15)
        assert r.status_code == 403


# ============================================================
# 5. VOICE AUDIO DOWNLOAD
# ============================================================
class TestVoiceDownload:
    def test_download_owner(self, api):
        assert _uploaded_analysis_id
        r = api.get(f"{BASE_URL}/api/voice/audio/{_uploaded_analysis_id}", timeout=30)
        assert r.status_code == 200
        assert len(r.content) > 1000
        # WAV header check
        assert r.content[:4] == b"RIFF"

    def test_download_unknown_404(self, api):
        r = api.get(f"{BASE_URL}/api/voice/audio/vox_missing000000", timeout=15)
        assert r.status_code == 404


# ============================================================
# 6. VOICE REPORT (SSE)
# ============================================================
class TestVoiceReport:
    def test_report_stream_and_persist(self, api):
        assert _uploaded_analysis_id
        url = f"{BASE_URL}/api/voice/analyses/{_uploaded_analysis_id}/report"
        with requests.post(url, headers=api.headers, stream=True, timeout=180) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")
            got_delta = False
            got_done = False
            report_text = ""
            for raw in r.iter_lines(decode_unicode=True):
                if not raw:
                    continue
                if not raw.startswith("data:"):
                    continue
                payload = raw[5:].strip()
                try:
                    ev = json.loads(payload)
                except Exception:
                    continue
                if "delta" in ev:
                    got_delta = True
                    report_text += ev["delta"]
                if ev.get("error"):
                    pytest.fail(f"stream error: {ev['error']}")
                if ev.get("done"):
                    got_done = True
                    assert "report" in ev and len(ev["report"]) > 50
                    break
            assert got_delta, "no delta chunks received"
            assert got_done, "no done event received"
            assert len(report_text) > 50

        # Verify persisted
        r2 = api.get(f"{BASE_URL}/api/voice/analyses/{_uploaded_analysis_id}", timeout=15)
        assert r2.status_code == 200
        doc = r2.json()
        assert doc.get("report") and len(doc["report"]) > 50


# ============================================================
# 7. VOICE DELETE
# ============================================================
class TestVoiceDelete:
    def test_delete_owner_removes_doc_and_file(self, api, sine_wav_bytes):
        # Upload a fresh recording to avoid interfering with previous tests
        up = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("sine_del.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel"},
            timeout=120,
        )
        assert up.status_code == 200
        d = up.json()
        analysis_id = d["analysis_id"]
        fpath = STORAGE_ROOT / d["storage_key"]
        assert fpath.exists()

        r = api.delete(f"{BASE_URL}/api/voice/analyses/{analysis_id}", timeout=30)
        assert r.status_code == 200
        assert r.json() == {"ok": True}
        assert not fpath.exists(), "storage file was not deleted"

        # GET should now 404
        r2 = api.get(f"{BASE_URL}/api/voice/analyses/{analysis_id}", timeout=15)
        assert r2.status_code == 404

    def test_delete_non_owner_forbidden(self, api, other_api, sine_wav_bytes):
        up = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("sine_del2.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel"},
            timeout=120,
        )
        assert up.status_code == 200
        aid = up.json()["analysis_id"]
        r = other_api.delete(f"{BASE_URL}/api/voice/analyses/{aid}", timeout=15)
        assert r.status_code == 403
        # cleanup
        api.delete(f"{BASE_URL}/api/voice/analyses/{aid}", timeout=15)


# ============================================================
# 8. STORAGE ABSTRACTION
# ============================================================
class TestStorage:
    def test_local_storage_used_when_no_gcs(self, api, sine_wav_bytes):
        # No GCS_BUCKET_NAME env -> backend should be local
        r = api.post(
            f"{BASE_URL}/api/voice/upload",
            files={"file": ("storage_test.wav", sine_wav_bytes, "audio/wav")},
            data={"patient_id": PATIENT_ID, "task": "sustained_vowel"},
            timeout=120,
        )
        assert r.status_code == 200
        d = r.json()
        assert d["storage_backend"] == "local"
        expected_prefix = f"voice/{DOCTOR_USER_ID}/{PATIENT_ID}/"
        assert d["storage_key"].startswith(expected_prefix)
        fpath = STORAGE_ROOT / d["storage_key"]
        assert fpath.exists() and fpath.stat().st_size > 1000
        # cleanup
        api.delete(f"{BASE_URL}/api/voice/analyses/{d['analysis_id']}", timeout=15)


# ============================================================
# 9. REGRESSION: existing endpoints
# ============================================================
class TestRegression:
    def test_patients_list(self, api):
        r = api.get(f"{BASE_URL}/api/patients", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_patient_create_and_get(self, api):
        payload = {"name": "TEST_ Regression Patient", "diagnosis": "Test dx", "age": 30}
        r = api.post(f"{BASE_URL}/api/patients", json=payload, timeout=15)
        assert r.status_code == 200
        p = r.json()
        assert p["name"] == payload["name"]
        pid = p["patient_id"]

        r2 = api.get(f"{BASE_URL}/api/patients/{pid}", timeout=15)
        assert r2.status_code == 200
        assert r2.json()["patient_id"] == pid
        # cleanup
        api.delete(f"{BASE_URL}/api/patients/{pid}", timeout=15)

    def test_appointments_list(self, api):
        r = api.get(f"{BASE_URL}/api/appointments", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_records_list(self, api):
        r = api.get(f"{BASE_URL}/api/records", timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_activities_generate_sse(self, api):
        """Regression: activities SSE endpoint emits delta chunks.
        NOTE: Full generation for activity plans is very long (>3min);
        this test only asserts the stream starts and emits deltas properly.
        """
        payload = {
            "diagnosis": "Disfonia funcional",
            "environment": "clinic",
            "age_group": "adult",
            "goals": "melhorar projeção vocal",
        }
        with requests.post(
            f"{BASE_URL}/api/activities/generate",
            json=payload,
            headers=api.headers,
            stream=True,
            timeout=90,
        ) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("content-type", "")
            deltas = 0
            for raw in r.iter_lines(decode_unicode=True, chunk_size=1):
                if not raw or not raw.startswith("data:"):
                    continue
                try:
                    ev = json.loads(raw[5:].strip())
                except Exception:
                    continue
                if ev.get("error"):
                    pytest.fail(f"activities SSE error: {ev['error']}")
                if "delta" in ev:
                    deltas += 1
                    if deltas >= 5:
                        break
                if ev.get("done"):
                    break
            assert deltas >= 5, f"only {deltas} delta chunks received"

    def test_reports_generate_sse(self, api):
        payload = {"patient_id": PATIENT_ID, "recipient": "médico", "purpose": "atualização"}
        with requests.post(
            f"{BASE_URL}/api/reports/generate",
            json=payload,
            headers=api.headers,
            stream=True,
            timeout=180,
        ) as r:
            assert r.status_code == 200
            got_done = False
            for raw in r.iter_lines(decode_unicode=True):
                if raw and raw.startswith("data:"):
                    try:
                        ev = json.loads(raw[5:].strip())
                    except Exception:
                        continue
                    if ev.get("done"):
                        got_done = True
                        break
                    if ev.get("error"):
                        pytest.fail(f"reports SSE error: {ev['error']}")
            assert got_done

    def test_copilot_chat_sse(self, api):
        payload = {"session_id": f"test_sess_{int(time.time())}", "message": "Diga apenas 'ok'."}
        with requests.post(
            f"{BASE_URL}/api/copilot/chat",
            json=payload,
            headers=api.headers,
            stream=True,
            timeout=180,
        ) as r:
            assert r.status_code == 200
            got_done = False
            for raw in r.iter_lines(decode_unicode=True):
                if raw and raw.startswith("data:"):
                    try:
                        ev = json.loads(raw[5:].strip())
                    except Exception:
                        continue
                    if ev.get("done"):
                        got_done = True
                        break
                    if ev.get("error"):
                        pytest.fail(f"copilot SSE error: {ev['error']}")
            assert got_done


# ============================================================
# CLEANUP: remove any uploaded voice analyses left by TEST class
# ============================================================
@pytest.fixture(scope="session", autouse=True)
def _cleanup_at_end(request):
    yield
    try:
        s = requests.Session()
        s.headers.update({"Authorization": f"Bearer {DOCTOR_TOKEN}"})
        docs = s.get(f"{BASE_URL}/api/voice/analyses?patient_id={PATIENT_ID}", timeout=15).json()
        for d in docs:
            s.delete(f"{BASE_URL}/api/voice/analyses/{d['analysis_id']}", timeout=15)
    except Exception:
        pass
