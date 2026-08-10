"""Praat-style spectrogram + pitch + intensity + waveform plot as PNG."""

from __future__ import annotations

import io
import numpy as np


def render_praat_plot(source_wav: str) -> bytes:
    """Render a Praat-style stacked plot from a WAV file.

    Panels (top to bottom):
      1. Waveform (time-domain)
      2. Spectrogram (0-5000 Hz), with Pitch track (F0) and Intensity overlay
      3. Formants (F1, F2, F3) overlaid

    Returns PNG bytes.
    """
    import parselmouth
    from parselmouth.praat import call
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import gridspec

    sound = parselmouth.Sound(source_wav)
    duration = float(sound.duration)
    xs = sound.xs()
    ys = sound.values.T

    # Compute spectrogram
    try:
        spectrogram = sound.to_spectrogram(window_length=0.03, maximum_frequency=5000)
        X, Y = spectrogram.x_grid(), spectrogram.y_grid()
        sg_db = 10 * np.log10(spectrogram.values + 1e-12)
    except Exception:
        spectrogram = None
        sg_db = None

    # Pitch
    try:
        pitch = sound.to_pitch(time_step=0.01, pitch_floor=50, pitch_ceiling=600)
        pitch_values = pitch.selected_array["frequency"]
        pitch_values[pitch_values == 0] = np.nan
        pitch_xs = pitch.xs()
    except Exception:
        pitch_values, pitch_xs = None, None

    # Intensity
    try:
        intensity = sound.to_intensity(minimum_pitch=50)
        int_xs = intensity.xs()
        int_vals = intensity.values.T.flatten()
    except Exception:
        int_xs, int_vals = None, None

    # Formants
    try:
        formant = sound.to_formant_burg(time_step=0.01)
        f_times = np.linspace(0.01, max(duration - 0.01, 0.02), 200)
        f_data = {1: [], 2: [], 3: []}
        for t in f_times:
            for i in (1, 2, 3):
                v = formant.get_value_at_time(i, t)
                f_data[i].append(v if v and not np.isnan(v) else np.nan)
    except Exception:
        f_data, f_times = None, None

    # Plot
    fig = plt.figure(figsize=(14, 8), dpi=110)
    fig.patch.set_facecolor("#FAF9F6")
    gs = gridspec.GridSpec(3, 1, height_ratios=[1, 2.5, 1.2], hspace=0.28)

    # 1. Waveform
    ax_w = fig.add_subplot(gs[0])
    ax_w.plot(xs, ys, color="#2b2b2b", linewidth=0.5)
    ax_w.set_xlim(0, duration)
    ax_w.set_ylabel("Amplitude", fontsize=9)
    ax_w.set_title("Onda sonora (waveform)", fontsize=10, loc="left", color="#B75C46")
    ax_w.grid(True, alpha=0.15)
    ax_w.tick_params(axis="both", labelsize=8)

    # 2. Spectrogram + Pitch + Intensity
    ax_s = fig.add_subplot(gs[1])
    if sg_db is not None:
        ax_s.pcolormesh(X, Y, sg_db, cmap="Greys", shading="auto",
                        vmin=np.nanpercentile(sg_db, 50), vmax=np.nanpercentile(sg_db, 99))
    ax_s.set_ylabel("Frequência (Hz)", fontsize=9)
    ax_s.set_title("Espectrograma · Pitch (F0) em vermelho · Intensidade em azul", fontsize=10, loc="left", color="#B75C46")
    ax_s.set_xlim(0, duration)
    ax_s.set_ylim(0, 5000)
    ax_s.tick_params(axis="both", labelsize=8)

    # Pitch overlay on second y-axis
    if pitch_values is not None:
        ax_p = ax_s.twinx()
        ax_p.plot(pitch_xs, pitch_values, "o", color="#D46F54", markersize=2.5, alpha=0.9, label="F0")
        ax_p.set_ylabel("F0 (Hz)", color="#D46F54", fontsize=9)
        ax_p.set_ylim(0, 600)
        ax_p.tick_params(axis="y", labelcolor="#D46F54", labelsize=8)

    if int_xs is not None and int_vals is not None:
        ax_i = ax_s.twinx()
        ax_i.spines["right"].set_position(("outward", 45))
        ax_i.plot(int_xs, int_vals, color="#1e5aa8", linewidth=1.2, alpha=0.85, label="Intensity")
        ax_i.set_ylabel("Intensidade (dB)", color="#1e5aa8", fontsize=9)
        ax_i.tick_params(axis="y", labelcolor="#1e5aa8", labelsize=8)

    # 3. Formants
    ax_f = fig.add_subplot(gs[2])
    if f_data:
        colors = {1: "#c62828", 2: "#2e7d32", 3: "#6a1b9a"}
        labels = {1: "F1", 2: "F2", 3: "F3"}
        for i in (1, 2, 3):
            ax_f.plot(f_times, f_data[i], ".", color=colors[i], markersize=2, label=labels[i], alpha=0.85)
        ax_f.legend(loc="upper right", fontsize=8, framealpha=0.9)
    ax_f.set_ylabel("Formantes (Hz)", fontsize=9)
    ax_f.set_xlabel("Tempo (s)", fontsize=9)
    ax_f.set_title("Formantes F1 · F2 · F3", fontsize=10, loc="left", color="#B75C46")
    ax_f.set_xlim(0, duration)
    ax_f.set_ylim(0, 5000)
    ax_f.grid(True, alpha=0.15)
    ax_f.tick_params(axis="both", labelsize=8)

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", bbox_inches="tight", facecolor="#FAF9F6")
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()
