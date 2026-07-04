import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import api, { API } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import MarkdownView from "@/components/MarkdownView";

// ---- Reference ranges (indicative) ----
const RANGES = {
  jitter_local_pct: { max: 1.04, label: "Jitter" },
  shimmer_local_pct: { max: 3.81, label: "Shimmer" },
  hnr_db: { min: 20, label: "HNR" },
  cpp_db: { min: 12, label: "CPP" },
};

function classify(key, value) {
  if (value == null) return "muted";
  const r = RANGES[key];
  if (!r) return "muted";
  if (r.max != null && value > r.max) return "warn";
  if (r.min != null && value < r.min) return "warn";
  return "ok";
}

const METRIC_LABELS = [
  { key: "duration_sec", label: "Duração", unit: "s", precision: 2 },
  { key: "phonation_time_sec", label: "Fonação", unit: "s", precision: 2 },
  { key: "f0_mean_hz", label: "F0 médio", unit: "Hz", precision: 1 },
  { key: "f0_std_hz", label: "F0 desvio", unit: "Hz", precision: 2 },
  { key: "jitter_local_pct", label: "Jitter (local)", unit: "%", precision: 3 },
  { key: "shimmer_local_pct", label: "Shimmer (local)", unit: "%", precision: 3 },
  { key: "hnr_db", label: "HNR", unit: "dB", precision: 2 },
  { key: "f1_hz", label: "F1", unit: "Hz", precision: 0 },
  { key: "f2_hz", label: "F2", unit: "Hz", precision: 0 },
  { key: "f3_hz", label: "F3", unit: "Hz", precision: 0 },
  { key: "intensity_db", label: "Intensidade", unit: "dB", precision: 2 },
  { key: "cpp_db", label: "CPP (aprox.)", unit: "dB", precision: 2 },
];

function MetricsTable({ metrics }) {
  if (!metrics) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3" data-testid="metrics-grid">
      {METRIC_LABELS.map(({ key, label, unit, precision }) => {
        const v = metrics[key];
        const cls = classify(key, v);
        const color = cls === "warn"
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : cls === "ok"
            ? "border-emerald-300 bg-emerald-50 text-emerald-900"
            : "border-stone-200 bg-white text-stone-700";
        const display = v == null ? "—" : Number(v).toFixed(precision);
        return (
          <div key={key} className={`border rounded-md p-3 ${color}`} data-testid={`metric-${key}`}>
            <div className="text-[10px] uppercase tracking-widest opacity-70">{label}</div>
            <div className="font-heading text-lg font-medium mt-1">
              {display} <span className="text-xs opacity-70">{v == null ? "" : unit}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Recorder({ onReady }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioURL, setAudioURL] = useState(null);
  const [blob, setBlob] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 44100 },
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(audioBlob);
        setAudioURL(URL.createObjectURL(audioBlob));
        onReady?.(audioBlob);
      };
      mr.start();
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      toast.error("Permissão de microfone negada");
    }
  };

  const stop = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const reset = () => {
    setBlob(null);
    setAudioURL(null);
    setElapsed(0);
    onReady?.(null);
  };

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {!recording && !blob && (
        <Button onClick={start} data-testid="rec-start-btn" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
          <i className="fa-solid fa-microphone mr-2"></i> Iniciar gravação
        </Button>
      )}
      {recording && (
        <Button onClick={stop} data-testid="rec-stop-btn" variant="destructive">
          <i className="fa-solid fa-stop mr-2"></i> Parar ({elapsed}s)
        </Button>
      )}
      {blob && !recording && (
        <>
          <audio src={audioURL} controls className="max-w-xs" data-testid="rec-playback" />
          <Button variant="outline" onClick={reset} data-testid="rec-reset-btn">
            <i className="fa-solid fa-rotate-left mr-2"></i> Refazer
          </Button>
        </>
      )}
    </div>
  );
}

export default function VoiceLab() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [selectedPatient, setSelectedPatient] = useState(params.get("patient_id") || "");
  const [task, setTask] = useState("sustained_vowel");
  const [notes, setNotes] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [current, setCurrent] = useState(null);
  const [reportText, setReportText] = useState("");
  const [streaming, setStreaming] = useState(false);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });
  const { data: analyses = [] } = useQuery({
    queryKey: ["voice-analyses", selectedPatient],
    queryFn: async () => (await api.get(`/voice/analyses${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data,
  });

  const upload = async () => {
    if (!selectedPatient) { toast.error("Selecione um paciente"); return; }
    const src = file || audioBlob;
    if (!src) { toast.error("Grave ou selecione um arquivo de áudio"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      const filename = file ? file.name : `recording_${Date.now()}.webm`;
      fd.append("file", src, filename);
      fd.append("patient_id", selectedPatient);
      fd.append("task", task);
      if (notes) fd.append("notes", notes);
      const { data } = await api.post("/voice/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Análise acústica concluída");
      setCurrent(data);
      setReportText("");
      setAudioBlob(null); setFile(null);
      qc.invalidateQueries({ queryKey: ["voice-analyses"] });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  const generateReport = async () => {
    if (!current) return;
    setStreaming(true);
    setReportText("");
    try {
      const res = await fetch(`${API}/voice/analyses/${current.analysis_id}/report`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          try {
            const p = JSON.parse(line.slice(5).trim());
            if (p.delta) setReportText((prev) => prev + p.delta);
            if (p.done) qc.invalidateQueries({ queryKey: ["voice-analyses"] });
            if (p.error) toast.error(p.error);
          } catch {}
        }
      }
    } catch (e) {
      toast.error("Erro ao gerar laudo");
    } finally {
      setStreaming(false);
    }
  };

  const loadAnalysis = async (analysisId) => {
    const { data } = await api.get(`/voice/analyses/${analysisId}`);
    setCurrent(data);
    setReportText(data.report || "");
  };

  const deleteAnalysis = async (analysisId) => {
    if (!window.confirm("Excluir esta análise?")) return;
    await api.delete(`/voice/analyses/${analysisId}`);
    qc.invalidateQueries({ queryKey: ["voice-analyses"] });
    if (current?.analysis_id === analysisId) { setCurrent(null); setReportText(""); }
    toast.success("Análise removida");
  };

  return (
    <div className="p-8 md:p-10" data-testid="voice-lab-page">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-medium tracking-tight">Análise Vocal Instrumental</h1>
        <p className="text-sm text-stone-500 mt-1">
          Grave ou envie um áudio de fonação sustentada (ex.: vogal /a/ por 3–5s) para extrair métricas acústicas
          (Praat/Parselmouth) e gerar laudo com IA.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Upload + Recorder */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Nova análise</div>

            <label className="text-xs text-stone-600 block mb-1">Paciente</label>
            <Select value={selectedPatient} onValueChange={setSelectedPatient}>
              <SelectTrigger data-testid="patient-select"><SelectValue placeholder="Selecionar paciente…" /></SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <label className="text-xs text-stone-600 block mt-3 mb-1">Tarefa vocal</label>
            <Select value={task} onValueChange={setTask}>
              <SelectTrigger data-testid="task-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sustained_vowel">Vogal sustentada (/a/)</SelectItem>
                <SelectItem value="reading">Leitura de texto padrão</SelectItem>
                <SelectItem value="spontaneous">Fala espontânea</SelectItem>
              </SelectContent>
            </Select>

            <label className="text-xs text-stone-600 block mt-3 mb-1">Observações do doutor (opcional)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="notes-input" />

            <div className="mt-4">
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-2">Áudio</div>
              <Recorder onReady={setAudioBlob} />
              <div className="text-[11px] text-stone-500 mt-2">ou envie um arquivo:</div>
              <Input
                type="file"
                accept="audio/wav,audio/mpeg,audio/webm,audio/ogg,.wav,.mp3,.webm,.ogg,.m4a"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                data-testid="audio-file-input"
                className="mt-1"
              />
            </div>

            <Button
              onClick={upload}
              disabled={uploading || (!audioBlob && !file) || !selectedPatient}
              className="w-full mt-4 bg-[#D46F54] hover:bg-[#B75C46] text-white"
              data-testid="upload-btn"
            >
              {uploading ? "Analisando…" : (<><i className="fa-solid fa-waveform-lines mr-2"></i>Enviar e analisar</>)}
            </Button>
          </div>

          {/* Historic list */}
          <div className="bg-white border border-stone-200 rounded-lg p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Histórico</div>
            {analyses.length === 0 ? (
              <div className="text-sm text-stone-500 py-4 text-center">Nenhuma análise ainda.</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-auto">
                {analyses.map((a) => (
                  <div
                    key={a.analysis_id}
                    className={`p-2 rounded border cursor-pointer text-sm ${
                      current?.analysis_id === a.analysis_id
                        ? "border-[#D46F54] bg-[#F3E7E4]/40"
                        : "border-stone-200 hover:bg-stone-50"
                    }`}
                    onClick={() => loadAnalysis(a.analysis_id)}
                    data-testid={`analysis-row-${a.analysis_id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium truncate">{a.patient_name}</div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteAnalysis(a.analysis_id); }}
                        className="text-stone-400 hover:text-red-600 text-xs"
                        data-testid={`delete-analysis-${a.analysis_id}`}
                      ><i className="fa-solid fa-trash"></i></button>
                    </div>
                    <div className="text-[11px] text-stone-500 flex gap-2 mt-1">
                      <span>{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                      {a.report && <span className="text-emerald-700">· laudo pronto</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Current analysis */}
        <div className="lg:col-span-2 space-y-4">
          {!current ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-lg p-16 text-center text-stone-500">
              <i className="fa-solid fa-wave-square text-4xl text-stone-300 mb-4"></i>
              <div className="text-sm">Selecione uma análise ou envie um novo áudio.</div>
            </div>
          ) : (
            <>
              <div className="bg-white border border-stone-200 rounded-lg p-5" data-testid="current-analysis-header">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-stone-500 font-bold">Análise</div>
                    <div className="font-heading text-xl mt-1">{current.patient_name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">
                      {new Date(current.created_at).toLocaleString("pt-BR")} · {current.task}
                    </div>
                  </div>
                  <audio
                    src={`${API}/voice/audio/${current.analysis_id}`}
                    controls
                    className="max-w-xs"
                    data-testid="analysis-audio-player"
                  />
                </div>
                <MetricsTable metrics={current.metrics} />
                <div className="text-[11px] text-stone-500 mt-3">
                  <i className="fa-solid fa-circle-info mr-1"></i>
                  Métricas em <span className="text-emerald-700">verde</span> dentro de faixa de referência,
                  em <span className="text-amber-700">amarelo</span> fora da faixa (Teixeira 2013, indicativo).
                </div>
              </div>

              <div className="bg-white border border-stone-200 rounded-lg p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-stone-500 font-bold">Laudo IA</div>
                  <Button
                    onClick={generateReport}
                    disabled={streaming}
                    size="sm"
                    className="bg-[#D46F54] hover:bg-[#B75C46] text-white"
                    data-testid="generate-report-btn"
                  >
                    {streaming ? "Gerando…" : (<><i className="fa-solid fa-file-signature mr-2"></i>{reportText ? "Regerar" : "Gerar laudo"}</>)}
                  </Button>
                </div>
                {reportText ? (
                  <div className="prose prose-stone prose-sm max-w-none" data-testid="report-content">
                    <MarkdownView content={reportText} />
                  </div>
                ) : (
                  <div className="text-sm text-stone-500 py-6 text-center">
                    Clique em "Gerar laudo" para produzir a interpretação clínica com Claude Sonnet 4.5.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
