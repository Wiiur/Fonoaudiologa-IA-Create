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
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()
    cmd = [
        "ffmpeg", "-y",
        "-i", str(src),
        "-ar", str(target_sample_rate),
        "-ac", "1",
        "-sample_fmt", "s16",
        tmp_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            Path(tmp_path).unlink(missing_ok=True)
            raise RuntimeError(f"ffmpeg conversion failed: {result.stderr.decode()[-500:]}")
        return tmp_path
    except Exception:
        Path(tmp_path).unlink(missing_ok=True)
        raise


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


# ==================== VOCAL CHALLENGES ====================
# Interactive challenges the patient performs live with the therapist.

CHALLENGE_CATALOG = {
    "sustained_vowel": {
        "id": "sustained_vowel",
        "title": "Vogal sustentada /a/",
        "instruction": "Emita a vogal /a/ de forma constante e confortável por 4–5 segundos.",
        "target": "F0 estável, jitter e shimmer baixos, HNR elevado.",
        "target_duration_sec": 5,
    },
    "mpt": {
        "id": "mpt",
        "title": "Tempo Máximo de Fonação (TMF)",
        "instruction": "Inspire profundamente e sustente a vogal /a/ pelo maior tempo possível, em intensidade e altura confortáveis.",
        "target": "Adulto masculino > 20s · feminino > 15s.",
        "target_duration_sec": 25,
    },
    "ddk_pataka": {
        "id": "ddk_pataka",
        "title": "DDK — /pa-ta-ka/ rápido",
        "instruction": "Repita rapidamente e de forma clara: pa-ta-ka pa-ta-ka pa-ta-ka… por 5 segundos.",
        "target": "≥ 6,0 sílabas/segundo em adulto saudável.",
        "target_duration_sec": 6,
    },
    "glissando": {
        "id": "glissando",
        "title": "Glissando (extensão vocal)",
        "instruction": "Vá do som mais grave que consegue até o mais agudo, sustentando a vogal /a/ como uma sirene subindo. Depois refaça descendo.",
        "target": "Extensão de F0 (semitons) revela alcance vocal.",
        "target_duration_sec": 8,
    },
    "loudness_range": {
        "id": "loudness_range",
        "title": "Extensão de loudness",
        "instruction": "Emita /a/ do mais suave possível ao mais forte, gradualmente. Cerca de 5 segundos.",
        "target": "Amplitude dinâmica ≥ 30 dB em adulto saudável.",
        "target_duration_sec": 6,
    },
    "sz_ratio": {
        "id": "sz_ratio",
        "title": "Relação s/z",
        "instruction": "Sustente o som /s/ pelo maior tempo que conseguir, respire e depois sustente /z/ da mesma forma. Envie os dois áudios (ou um após o outro).",
        "target": "s/z ≈ 1,0 · > 1,4 sugere insuficiência glótica.",
        "target_duration_sec": 20,
    },
    "reading": {
        "id": "reading",
        "title": "Leitura de texto padrão",
        "instruction": "Leia em voz habitual: 'O Vento Norte e o Sol discutiam quem era o mais forte quando um viajante apareceu embrulhado em uma capa quente.'",
        "target": "Avaliação prosódica e articulatória em fala conectada.",
        "target_duration_sec": 15,
    },
}


def _syllable_count(sound, threshold_db: float = -25.0, min_dip_db: float = 2.0, min_pause_sec: float = 0.05):
    """Approximate syllable count via intensity peak detection (de Jong & Wempe 2009 simplified)."""
    import parselmouth
    from parselmouth.praat import call
    try:
        intensity = sound.to_intensity(minimum_pitch=50.0)
        vals = intensity.values.flatten()
        times = intensity.xs()
        if vals.size < 5:
            return None, None
        # Convert to dB relative
        max_int = float(np.max(vals[np.isfinite(vals)]))
        rel = vals - max_int  # 0 = peak
        # Find peaks above threshold with dip criterion
        peaks = []
        i = 1
        while i < len(rel) - 1:
            if rel[i] > threshold_db and rel[i] >= rel[i - 1] and rel[i] >= rel[i + 1]:
                # Look for dip before this peak
                if not peaks or (rel[i] - min(rel[peaks[-1]:i]) >= min_dip_db):
                    peaks.append(i)
            i += 1
        n = len(peaks)
        duration = float(sound.duration)
        rate = n / duration if duration > 0 else 0
        return n, round(rate, 2)
    except Exception:
        return None, None


def _voiced_duration(sound, f0_min=50.0, f0_max=500.0) -> float:
    """Total voiced time (seconds)."""
    try:
        pitch = sound.to_pitch(time_step=0.01, pitch_floor=f0_min, pitch_ceiling=f0_max)
        pv = pitch.selected_array["frequency"]
        return float((pv > 0).sum() * 0.01)
    except Exception:
        return 0.0


def analyze_challenge(source_path: str, challenge_type: str) -> Dict:
    """Run analysis tailored to a specific vocal challenge.
    Returns dict with 'metrics', 'evaluation' (dict with grade/message), and 'task_metrics'.
    """
    import parselmouth
    import numpy as np # Importando caso não esteja no escopo da função

    wav_path = _to_wav(source_path)
    try:
        sound = parselmouth.Sound(wav_path)
        duration = float(sound.duration)
        base = {}
        task_metrics = {}
        evaluation = {"grade": "info", "score": None, "message": "", "target_met": None}

        # --- BLOCO DE SEGURANÇA (110% ERROR-PROOF) ---
        intensity = sound.to_intensity(minimum_pitch=50.0)
        vals = intensity.values.flatten()
        vals = vals[np.isfinite(vals)]
        
        if len(vals) == 0 or np.max(vals) < 30.0:
            # Se o áudio estiver abaixo de 30dB, é apenas silêncio/ruído de cabo.
            return {
                "challenge_type": challenge_type,
                "duration_sec": round(duration, 2),
                "metrics": {},
                "task_metrics": {},
                "evaluation": {
                    "grade": "alert",
                    "message": "Nenhum som vocal detectado. O áudio está muito baixo ou em silêncio. Por favor, regrave."
                }
            }
        # -------------------------------------------

        # --- MAPEAMENTO DE IDs (INGLÊS + PORTUGUÊS DO BANCO) ---
        if challenge_type in ("sustained_vowel", "mpt", "vogal_a_prolongada"):
            # Run acoustic pack
            metrics_dict = _full_acoustic(sound)
            base.update(metrics_dict)
            if challenge_type in ("mpt", "vogal_a_prolongada"):
                # Focus on maximum voiced duration
                voiced = _voiced_duration(sound)
                task_metrics["mpt_seconds"] = round(voiced, 2)
                if voiced >= 20:
                    evaluation = {"grade": "ok", "score": voiced, "target_met": True,
                                  "message": f"TMF de {voiced:.1f}s — dentro do esperado para adulto saudável."}
                elif voiced >= 12:
                    evaluation = {"grade": "warn", "score": voiced, "target_met": False,
                                  "message": f"TMF de {voiced:.1f}s — reduzido; sugere fadiga vocal ou capacidade respiratória diminuída."}
                else:
                    evaluation = {"grade": "alert", "score": voiced, "target_met": False,
                                  "message": f"TMF de {voiced:.1f}s — significativamente reduzido; investigar suporte respiratório e fechamento glótico."}
            else:
                target_met = (
                    (metrics_dict.get("jitter_local_pct") or 99) < 1.04
                    and (metrics_dict.get("shimmer_local_pct") or 99) < 3.81
                    and (metrics_dict.get("hnr_db") or 0) > 20
                )
                evaluation = {
                    "grade": "ok" if target_met else "warn",
                    "target_met": target_met,
                    "message": "Padrão estável e periódico." if target_met else "Sinais de instabilidade — revisar apoio respiratório e ataque vocal.",
                }

        elif challenge_type in ("ddk_pataka",):
            n_syl, rate = _syllable_count(sound)
            base = _full_acoustic(sound, quick=True)
            task_metrics["syllable_count"] = n_syl
            task_metrics["ddk_rate_syll_per_sec"] = rate
            if rate is None:
                evaluation = {"grade": "info", "message": "Não foi possível estimar taxa DDK — reenvie com áudio mais limpo."}
            elif rate >= 6.0:
                evaluation = {"grade": "ok", "score": rate, "target_met": True,
                              "message": f"Taxa DDK de {rate}/s — adequada para adulto saudável."}
            elif rate >= 4.5:
                evaluation = {"grade": "warn", "score": rate, "target_met": False,
                              "message": f"Taxa DDK de {rate}/s — levemente reduzida; monitorar coordenação motora fina."}
            else:
                evaluation = {"grade": "alert", "score": rate, "target_met": False,
                              "message": f"Taxa DDK de {rate}/s — reduzida; investigar componente motor da fala (disartria?)."}

        elif challenge_type in ("glissando", "glissando_sirene", "voo_do_aviao"):
            base = _full_acoustic(sound, quick=True)
            try:
                pitch = sound.to_pitch(time_step=0.01, pitch_floor=50, pitch_ceiling=800)
                pv = pitch.selected_array["frequency"]
                voiced = pv[pv > 0]
                if voiced.size > 5:
                    f0_min = float(np.min(voiced))
                    f0_max_v = float(np.max(voiced))
                    semitones = 12 * np.log2(f0_max_v / f0_min) if f0_min > 0 else None
                    task_metrics["f0_min_hz"] = round(f0_min, 1)
                    task_metrics["f0_max_hz"] = round(f0_max_v, 1)
                    task_metrics["range_semitones"] = round(float(semitones), 1) if semitones else None
                    if semitones and semitones >= 24:
                        evaluation = {"grade": "ok", "score": semitones, "target_met": True,
                                      "message": f"Extensão de {semitones:.1f} semitons — dentro do esperado para adulto saudável."}
                    elif semitones and semitones >= 15:
                        evaluation = {"grade": "warn", "score": semitones, "target_met": False,
                                      "message": f"Extensão de {semitones:.1f} semitons — reduzida; possível restrição funcional."}
                    else:
                        evaluation = {"grade": "alert", "score": semitones, "target_met": False,
                                      "message": "Extensão vocal reduzida — investigar rigidez das pregas ou restrição de mobilidade laríngea."}
            except Exception:
                evaluation = {"grade": "info", "message": "Não foi possível estimar extensão — sinal muito curto ou instável."}

        elif challenge_type in ("loudness_range", "metodo_lsvt_loud"):
            base = _full_acoustic(sound, quick=True)
            try:
                intensity = sound.to_intensity(minimum_pitch=50)
                vals = intensity.values.flatten()
                vals = vals[np.isfinite(vals)]
                if vals.size:
                    i_min = float(np.percentile(vals, 5))
                    i_max = float(np.percentile(vals, 95))
                    task_metrics["intensity_min_db"] = round(i_min, 1)
                    task_metrics["intensity_max_db"] = round(i_max, 1)
                    task_metrics["intensity_range_db"] = round(i_max - i_min, 1)
                    rng = i_max - i_min
                    if rng >= 30:
                        evaluation = {"grade": "ok", "score": rng, "target_met": True,
                                      "message": f"Amplitude dinâmica de {rng:.1f} dB — dentro do esperado."}
                    elif rng >= 20:
                        evaluation = {"grade": "warn", "score": rng, "target_met": False,
                                      "message": f"Amplitude dinâmica de {rng:.1f} dB — reduzida; investigar controle de esforço vocal."}
                    else:
                        evaluation = {"grade": "alert", "score": rng, "target_met": False,
                                      "message": "Amplitude dinâmica muito estreita — possível monotonia ou dificuldade de projeção."}
            except Exception:
                evaluation = {"grade": "info", "message": "Falha ao estimar amplitude dinâmica."}

        elif challenge_type in ("sz_ratio", "relacao_s_z"):
            # Split into halves: first half assumed /s/, second half /z/
            n = len(sound.values[0])
            sr = sound.sampling_frequency
            half = n // 2
            samples = sound.values[0]
            try:
                s_frame = samples[:half]
                z_frame = samples[half:]
                rms_s = float(np.sqrt(np.mean(s_frame ** 2)))
                rms_z = float(np.sqrt(np.mean(z_frame ** 2)))
                # Simple duration proxy: how much of each half exceeds threshold
                thr = np.max(np.abs(samples)) * 0.05
                s_dur = float(np.sum(np.abs(s_frame) > thr) / sr)
                z_dur = float(np.sum(np.abs(z_frame) > thr) / sr)
                ratio = round(s_dur / z_dur, 2) if z_dur > 0 else None
                task_metrics["s_duration_sec"] = round(s_dur, 2)
                task_metrics["z_duration_sec"] = round(z_dur, 2)
                task_metrics["sz_ratio"] = ratio
                if ratio is not None:
                    if 0.8 <= ratio <= 1.2:
                        evaluation = {"grade": "ok", "score": ratio, "target_met": True,
                                      "message": f"Relação s/z de {ratio} — eficiência glótica adequada."}
                    elif ratio <= 1.4:
                        evaluation = {"grade": "warn", "score": ratio, "target_met": False,
                                      "message": f"Relação s/z de {ratio} — no limite; monitorar coaptação glótica."}
                    else:
                        evaluation = {"grade": "alert", "score": ratio, "target_met": False,
                                      "message": f"Relação s/z de {ratio} — sugere insuficiência glótica (fenda? nódulos?)."}
            except Exception:
                evaluation = {"grade": "info", "message": "Falha no cálculo s/z — envie /s/ e /z/ um após o outro num único áudio."}

        elif challenge_type in ("reading", "leitura_sobrearticulada", "terapia_lax_vox", "fonacao_reversa", "boca_chiusa", "trinado_labios", "messa_di_voce", "fricativas_marcadas"):
            base = _full_acoustic(sound, quick=True)
            n_syl, rate = _syllable_count(sound)
            task_metrics["syllable_count"] = n_syl
            task_metrics["speech_rate_syll_per_sec"] = rate
            evaluation = {"grade": "info", "message": "Análise prosódica/articulatória gravada com sucesso — ver métricas."}

        else:
            base = _full_acoustic(sound)

        return {
            "challenge_type": challenge_type,
            "duration_sec": _safe_float(duration),
            "metrics": base,
            "task_metrics": task_metrics,
            "evaluation": evaluation,
        }
    finally:
        try:
            Path(wav_path).unlink(missing_ok=True)
        except Exception:
            pass


def _full_acoustic(sound, quick: bool = False) -> Dict:
    """Extract acoustic metrics from an already-loaded Sound object (avoid re-reading)."""
    from parselmouth.praat import call
    out = {}
    f0_min, f0_max = 75.0, 500.0
    try:
        pitch = sound.to_pitch(time_step=0.01, pitch_floor=f0_min, pitch_ceiling=f0_max)
        pv = pitch.selected_array["frequency"].astype(float)
        voiced = pv[pv > 0]
        out["f0_mean_hz"] = _safe_float(float(np.mean(voiced))) if voiced.size else None
        out["f0_std_hz"] = _safe_float(float(np.std(voiced))) if voiced.size else None
        out["phonation_time_sec"] = _safe_float(float((pv > 0).sum() * 0.01))
    except Exception:
        pass
    if quick:
        try:
            intensity = sound.to_intensity(minimum_pitch=f0_min)
            vals = intensity.values.flatten()
            vals = vals[np.isfinite(vals)]
            out["intensity_db"] = _safe_float(float(np.mean(vals))) if vals.size else None
        except Exception:
            pass
        return out
    try:
        pp = call(sound, "To PointProcess (periodic, cc)", f0_min, f0_max)
        out["jitter_local_pct"] = _safe_float(call(pp, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3) * 100)
        out["shimmer_local_pct"] = _safe_float(call([sound, pp], "Get shimmer (local)", 0, 0, 0.0001, 0.02, 1.3, 1.6) * 100)
    except Exception:
        pass
    try:
        harm = sound.to_harmonicity(time_step=0.01, minimum_pitch=f0_min)
        hnr_vals = harm.values[harm.values != -200]
        out["hnr_db"] = _safe_float(float(np.mean(hnr_vals))) if hnr_vals.size else None
    except Exception:
        pass
    try:
        intensity = sound.to_intensity(minimum_pitch=f0_min)
        vals = intensity.values.flatten()
        vals = vals[np.isfinite(vals)]
        out["intensity_db"] = _safe_float(float(np.mean(vals))) if vals.size else None
    except Exception:
        pass
    return out


def build_clinical_prompt(patient: Dict, metrics: Dict, notes: str = "") -> str:
    """Build a rich Portuguese clinical prompt from metrics, focusing on Evidence-Based Diagnosis."""
    def fmt(v, unit=""):
        return f"{v}{unit}" if v is not None else "—"

    m = metrics
    lines = [
        f"# CONTEXTO CLÍNICO DO PACIENTE",
        f"- Paciente: {patient.get('name', '—')} ({patient.get('age', '—')} anos)",
        f"- Sexo Biológico: {patient.get('gender', '—')}",
        f"- Diagnóstico Prévio/Queixa: {patient.get('chief_complaint', '—')}",
        f"- Observações do Clínico: {notes or '—'}",
        "",
        "# MATEMÁTICA ACÚSTICA EXTRAÍDA (Motor Parselmouth)",
        f"- Duração do sinal: {fmt(m.get('duration_sec'), ' s')}",
        f"- Tempo de fonação vozeada: {fmt(m.get('phonation_time_sec'), ' s')}",
        f"- F0 médio: {fmt(m.get('f0_mean_hz'), ' Hz')} · Desvio (Pitch Sigma): {fmt(m.get('f0_std_hz'), ' Hz')}",
        f"- Jitter (local): {fmt(m.get('jitter_local_pct'), ' %')} (Limiar normativo: < 1.04%)",
        f"- Shimmer (local): {fmt(m.get('shimmer_local_pct'), ' %')} (Limiar normativo: < 3.81%)",
        f"- HNR (Proporção Harmônico-Ruído): {fmt(m.get('hnr_db'), ' dB')} (Limiar normativo: > 20 dB)",
        f"- Formantes: F1={fmt(m.get('f1_hz'), ' Hz')} · F2={fmt(m.get('f2_hz'), ' Hz')} · F3={fmt(m.get('f3_hz'), ' Hz')}",
        f"- Intensidade média: {fmt(m.get('intensity_db'), ' dB')}",
        f"- CPP (Cepstral Peak Prominence): {fmt(m.get('cpp_db'), ' dB')}",
        "",
        "# SUA TAREFA: DIAGNÓSTICO FONOAUDIOLÓGICO BASEADO EM EVIDÊNCIAS",
        "Atue como um Fonoaudiólogo Pesquisador e Clínico especialista em Voz. Você deve analisar as métricas acústicas "
        "acima, cruzar com a queixa do paciente e gerar um Parecer Diagnóstico Fundamentado. *NÃO GERE UM LAUDO CORRIDO, MAS SIM UMA ANÁLISE.*",
        "",
        "ESTRUTURE SUA RESPOSTA EM MARKDOWN EXATAMENTE NESTES TÓPICOS:",
        "### 1. Parecer Acústico",
        "(Faça uma leitura analítica sobre como a F0 se relaciona com o sexo/idade do paciente e explique o impacto do Jitter e Shimmer encontrados na qualidade vocal. Diga explicitamente se o padrão é de normalidade ou qual o nível do desvio.)",
        "",
        "### 2. Hipótese Diagnóstica Fonoaudiológica",
        "(Baseado nos dados, qual a provável condição clínica biomecânica ocorrendo nas pregas vocais? Ex: Tensão glótica, fenda, nódulo...)",
        "",
        "### 3. Evidências e Base Bibliográfica",
        "(Crie este tópico listando referências científicas da fonoaudiologia que fundamentem por que você chegou à conclusão acima. Exemplo obrigatório de referência cruzada: 'Segundo Behlau (2001) em *Voz: O Livro do Especialista*, o aumento conjugado de Shimmer e a redução do HNR para [Valor] indicam presença de ruído glótico...' ou cite Teixeira (2013) sobre os limiares MDVP.)",
        "",
        "### 4. Direcionamento Terapêutico",
        "(Recomende técnicas vocais específicas e cientificamente validadas para este quadro, como ETVSO, sobrearticulação, etc.)",
        "",
        "REGRAS ESTRITAS DE CONDUTA:",
        "- Mantenha a formalidade científica em 100% do texto.",
        "- Se algum valor estiver faltando ('—'), justifique que a extração foi limitada pela qualidade do sinal.",
        "- NUNCA feche diagnóstico médico definitivo (deixe claro que imagens laríngeas são necessárias)."
    ]
    return "\n".join(lines)
