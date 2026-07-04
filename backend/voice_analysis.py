"""Vocal acoustic analysis using praat-parselmouth.

Metrics extracted:
- F0 mean & std (Hz)
- Jitter (local, %)
- Shimmer (local, %)
- HNR mean (dB)
- Formants F1/F2/F3 mean (Hz)
- RMS intensity
- CPP (Cepstral Peak Prominence, dB) -- approximated
- Phonation time (s)
- Duration (s)
"""

from __future__ import annotations

import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Optional

import numpy as np


def _to_wav(source_path: str, target_sample_rate: int = 22050) -> str:
    """Convert any audio to mono WAV via ffmpeg. Returns the WAV path."""
    src = Path(source_path)
    if src.suffix.lower() == ".wav":
        # Still normalize to mono/16-bit for parselmouth robustness
        pass
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    cmd = [
        "ffmpeg", "-y",
        "-i", str(src),
        "-ar", str(target_sample_rate),
        "-ac", "1",
        "-sample_fmt", "s16",
        tmp.name,
    ]
    result = subprocess.run(cmd, capture_output=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg conversion failed: {result.stderr.decode()[-500:]}")
    return tmp.name


def _safe_float(x, default: Optional[float] = None) -> Optional[float]:
    try:
        v = float(x)
        if np.isnan(v) or np.isinf(v):
            return default
        return round(v, 4)
    except (TypeError, ValueError):
        return default


def analyze_audio(source_path: str, f0_min: float = 75.0, f0_max: float = 500.0) -> Dict:
    """Run full acoustic analysis. Returns dict of metrics (all floats or None)."""
    import parselmouth
    from parselmouth.praat import call

    wav_path = _to_wav(source_path)
    try:
        sound = parselmouth.Sound(wav_path)
        duration = float(sound.duration)

        # --- Pitch / F0 ---
        pitch = sound.to_pitch(time_step=0.01, pitch_floor=f0_min, pitch_ceiling=f0_max)
        pv = pitch.selected_array["frequency"].astype(float)
        voiced = pv[pv > 0]
        f0_mean = float(np.mean(voiced)) if voiced.size else None
        f0_std = float(np.std(voiced)) if voiced.size else None
        phonation_time = float((pv > 0).sum() * 0.01)

        # --- Jitter / Shimmer via PointProcess ---
        jitter_local = None
        shimmer_local = None
        try:
            pp = call(sound, "To PointProcess (periodic, cc)", f0_min, f0_max)
            jl = call(pp, "Get jitter (local)", 0.0, 0.0, 0.0001, 0.02, 1.3)
            jitter_local = _safe_float(jl * 100.0)  # percent
            sl = call([sound, pp], "Get shimmer (local)", 0.0, 0.0, 0.0001, 0.02, 1.3, 1.6)
            shimmer_local = _safe_float(sl * 100.0)
        except Exception:
            pass

        # --- HNR ---
        hnr_mean = None
        try:
            harm = sound.to_harmonicity(time_step=0.01, minimum_pitch=f0_min)
            hnr_vals = harm.values[harm.values != -200]  # sentinel for undefined
            hnr_mean = _safe_float(np.mean(hnr_vals)) if hnr_vals.size else None
        except Exception:
            pass

        # --- Formants ---
        f1 = f2 = f3 = None
        try:
            formant = sound.to_formant_burg(time_step=0.01)
            f1s, f2s, f3s = [], [], []
            for t in np.linspace(0.05, max(duration - 0.05, 0.1), 50):
                v1 = formant.get_value_at_time(1, t)
                v2 = formant.get_value_at_time(2, t)
                v3 = formant.get_value_at_time(3, t)
                if v1 and not np.isnan(v1): f1s.append(v1)
                if v2 and not np.isnan(v2): f2s.append(v2)
                if v3 and not np.isnan(v3): f3s.append(v3)
            f1 = _safe_float(np.mean(f1s)) if f1s else None
            f2 = _safe_float(np.mean(f2s)) if f2s else None
            f3 = _safe_float(np.mean(f3s)) if f3s else None
        except Exception:
            pass

        # --- Intensity RMS (dB) ---
        rms_db = None
        try:
            intensity = sound.to_intensity(minimum_pitch=f0_min)
            vals = intensity.values.flatten()
            vals = vals[np.isfinite(vals)]
            rms_db = _safe_float(np.mean(vals)) if vals.size else None
        except Exception:
            pass

        # --- CPP (approximated via power cepstrum) ---
        cpp = None
        try:
            samples = sound.values[0]
            sr = sound.sampling_frequency
            # Take a central 500 ms window
            win = int(0.5 * sr)
            start = max(0, (len(samples) - win) // 2)
            frame = samples[start:start + win]
            if frame.size >= 512:
                spectrum = np.fft.rfft(frame * np.hanning(len(frame)))
                log_spec = np.log(np.abs(spectrum) + 1e-10)
                cepstrum = np.fft.irfft(log_spec)
                # Search for quefrency peak in F0 range (60-300Hz => q = 1/f)
                q_min = int(sr / 300)
                q_max = int(sr / 60)
                if q_max > q_min and q_max < len(cepstrum):
                    peak = np.max(cepstrum[q_min:q_max])
                    # Baseline: linear regression estimated as mean of the search region
                    baseline = np.mean(cepstrum[q_min:q_max])
                    cpp = _safe_float((peak - baseline) * 8.686)  # nat -> dB approx
        except Exception:
            pass

        return {
            "duration_sec": _safe_float(duration),
            "phonation_time_sec": _safe_float(phonation_time),
            "f0_mean_hz": _safe_float(f0_mean),
            "f0_std_hz": _safe_float(f0_std),
            "jitter_local_pct": jitter_local,
            "shimmer_local_pct": shimmer_local,
            "hnr_db": hnr_mean,
            "f1_hz": f1,
            "f2_hz": f2,
            "f3_hz": f3,
            "intensity_db": rms_db,
            "cpp_db": cpp,
        }
    finally:
        try:
            Path(wav_path).unlink(missing_ok=True)
        except Exception:
            pass


def build_clinical_prompt(patient: Dict, metrics: Dict, notes: str = "") -> str:
    """Build a rich Portuguese clinical prompt from metrics."""
    def fmt(v, unit=""):
        return f"{v}{unit}" if v is not None else "—"

    m = metrics
    lines = [
        f"# Contexto clínico",
        f"- Paciente: {patient.get('name', '—')} ({patient.get('age', '—')} anos)",
        f"- Diagnóstico prévio: {patient.get('diagnosis', '—')}",
        f"- Observações do doutor: {notes or '—'}",
        "",
        "# Métricas acústicas extraídas (Praat/Parselmouth)",
        f"- Duração do sinal: {fmt(m.get('duration_sec'), ' s')}",
        f"- Tempo de fonação vozeada: {fmt(m.get('phonation_time_sec'), ' s')}",
        f"- F0 médio: {fmt(m.get('f0_mean_hz'), ' Hz')} · Desvio: {fmt(m.get('f0_std_hz'), ' Hz')}",
        f"- Jitter (local): {fmt(m.get('jitter_local_pct'), ' %')}",
        f"- Shimmer (local): {fmt(m.get('shimmer_local_pct'), ' %')}",
        f"- HNR: {fmt(m.get('hnr_db'), ' dB')}",
        f"- Formantes: F1={fmt(m.get('f1_hz'), ' Hz')} · F2={fmt(m.get('f2_hz'), ' Hz')} · F3={fmt(m.get('f3_hz'), ' Hz')}",
        f"- Intensidade média: {fmt(m.get('intensity_db'), ' dB')}",
        f"- CPP (aprox.): {fmt(m.get('cpp_db'), ' dB')}",
        "",
        "# Faixas de referência (voz adulta saudável, uso indicativo)",
        "- F0 masculino ~85–180 Hz · feminino ~165–255 Hz",
        "- Jitter local < 1,04% · Shimmer local < 3,81% · HNR > 20 dB (Teixeira, 2013)",
        "- CPP > 12 dB associado a menor rugosidade",
        "",
        "# Tarefa",
        "Gere um **Laudo Fonoaudiológico de Análise Acústica** em Português (BR), estruturado em Markdown:",
        "## 1. Identificação e Tarefa",
        "## 2. Parâmetros Acústicos (tabela + interpretação clínica de cada métrica)",
        "## 3. Padrão Vocal Observado (grau geral: normal, disfonia leve/moderada/severa, tipo predominante)",
        "## 4. Hipóteses Fonoaudiológicas",
        "## 5. Recomendações (terapia, exames complementares, encaminhamentos)",
        "## 6. Ressalvas e Limitações da análise instrumental",
        "",
        "Regras: linguagem técnica, cite referências normativas quando pertinente, evite diagnóstico médico definitivo, "
        "explicite qualquer métrica ausente ('—') como limitação. Ao final, deixe campo para assinatura profissional.",
    ]
    return "\n".join(lines)
