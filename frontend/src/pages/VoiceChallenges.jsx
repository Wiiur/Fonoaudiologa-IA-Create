import React, { useEffect, useRef, useState } from "react";
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

const GRADE_STYLES = {
  ok: "border-emerald-400 bg-emerald-50 text-emerald-900",
  warn: "border-amber-400 bg-amber-50 text-amber-900",
  alert: "border-red-400 bg-red-50 text-red-900",
  info: "border-stone-300 bg-stone-50 text-stone-700",
};

function TaskMetricPill({ label, value, unit }) {
  return (
    <div className="border border-stone-200 rounded-md p-2 bg-white">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className="font-heading text-base font-medium mt-0.5">
        {value ?? "—"}{value != null && unit ? <span className="text-xs text-stone-500 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

function ChallengeRecorder({ onReady, targetDuration }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [blob, setBlob] = useState(null);
  const [audioURL, setAudioURL] = useState(null);
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
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b); setAudioURL(URL.createObjectURL(b));
        onReady?.(b);
      };
      mr.start();
      setElapsed(0); setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch { toast.error("Permissão de microfone negada"); }
  };
  const stop = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };
  const reset = () => { setBlob(null); setAudioURL(null); setElapsed(0); onReady?.(null); };

  const pct = targetDuration ? Math.min(100, (elapsed / targetDuration) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {!recording && !blob && (
          <Button onClick={start} data-testid="chal-rec-start" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <i className="fa-solid fa-microphone mr-2"></i> Iniciar
          </Button>
        )}
        {recording && (
          <Button onClick={stop} variant="destructive" data-testid="chal-rec-stop">
            <i className="fa-solid fa-stop mr-2"></i> Parar ({elapsed}s)
          </Button>
        )}
        {blob && !recording && (
          <>
            <audio src={audioURL} controls className="max-w-xs" data-testid="chal-playback" />
            <Button variant="outline" size="sm" onClick={reset} data-testid="chal-reset">
              <i className="fa-solid fa-rotate-left mr-2"></i> Refazer
            </Button>
          </>
        )}
      </div>
      {recording && targetDuration && (
        <div className="w-full">
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#D46F54] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-stone-500 mt-1">Meta: {targetDuration}s</div>
        </div>
      )}
    </div>
  );
}

export default function VoiceChallenges() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [selectedPatient, setSelectedPatient] = useState(params.get("patient_id") || "");
  const [selectedChallenge, setSelectedChallenge] = useState(null);
  const [blob, setBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });
  const { data: catalog = [] } = useQuery({
    queryKey: ["challenges-catalog"],
    queryFn: async () => (await api.get("/voice/challenges/catalog")).data,
  });
  const { data: attempts = [] } = useQuery({
    queryKey: ["challenge-attempts", selectedPatient],
    queryFn: async () => (await api.get(`/voice/challenges/attempts${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data,
  });

  const submit = async () => {
    if (!selectedPatient || !selectedChallenge) { toast.error("Selecione paciente e desafio"); return; }
    const src = file || blob;
    if (!src) { toast.error("Grave ou envie um áudio"); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      const filename = file ? file.name : `challenge_${Date.now()}.webm`;
      fd.append("file", src, filename);
      fd.append("patient_id", selectedPatient);
      fd.append("challenge_type", selectedChallenge.id);
      if (notes) fd.append("notes", notes);
      const { data } = await api.post("/voice/challenges/attempt", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setLastResult(data);
      setBlob(null); setFile(null); setNotes("");
      toast.success("Desafio analisado");
      qc.invalidateQueries({ queryKey: ["challenge-attempts"] });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Falha na análise");
    }
    setBusy(false);
  };

  const del = async (id) => {
    if (!window.confirm("Excluir tentativa?")) return;
    await api.delete(`/voice/challenges/attempts/${id}`);
    qc.invalidateQueries({ queryKey: ["challenge-attempts"] });
    if (lastResult?.attempt_id === id) setLastResult(null);
  };

  const gradeCls = (g) => GRADE_STYLES[g] || GRADE_STYLES.info;
  const gradeIcon = (g) => g === "ok" ? "fa-check-circle" : g === "warn" ? "fa-triangle-exclamation" : g === "alert" ? "fa-circle-exclamation" : "fa-circle-info";

  const humanizeKey = (k) => k.replace(/_/g, " ").replace(/hz|db|pct|sec/g, (m) => m.toUpperCase());

  return (
    <div className="p-8 md:p-10" data-testid="voice-challenges-page">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">Desafios Vocais</h1>
          <p className="text-sm text-stone-500 mt-1 max-w-2xl">
            Tarefas vocais interativas guiadas — o paciente executa cada exercício ao vivo enquanto você grava.
            A IA analisa e devolve avaliação imediata com metas de referência.
          </p>
        </div>
        <div className="min-w-[260px]">
          <label className="text-xs text-stone-600 block mb-1">Paciente</label>
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger data-testid="chal-patient-select"><SelectValue placeholder="Selecionar…" /></SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        {catalog.map((c) => (
          <button
            key={c.id}
            onClick={() => { setSelectedChallenge(c); setLastResult(null); setBlob(null); setFile(null); }}
            data-testid={`challenge-card-${c.id}`}
            className={`text-left p-5 rounded-lg border transition-all ${
              selectedChallenge?.id === c.id
                ? "border-[#D46F54] bg-[#F3E7E4]/40 shadow-md"
                : "border-stone-200 bg-white hover:border-stone-400 hover:shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="font-heading text-base font-medium">{c.title}</div>
              <div className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">~{c.target_duration_sec}s</div>
            </div>
            <div className="text-xs text-stone-600 line-clamp-2">{c.instruction}</div>
            <div className="text-[11px] text-[#B75C46] mt-2"><i className="fa-solid fa-bullseye mr-1"></i> {c.target}</div>
          </button>
        ))}
      </div>

      {selectedChallenge && (
        <div className="bg-white border border-stone-200 rounded-lg p-6 mb-6" data-testid="challenge-panel">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold">Executando</div>
              <div className="font-heading text-2xl mt-1">{selectedChallenge.title}</div>
            </div>
            <button onClick={() => setSelectedChallenge(null)} className="text-stone-400 hover:text-stone-700" data-testid="chal-close">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="bg-[#F3E7E4]/40 border border-[#D46F54]/30 rounded-md p-4 mb-4">
            <div className="text-xs uppercase tracking-widest text-[#B75C46] font-bold mb-1">Instrução ao paciente</div>
            <div className="text-sm text-stone-800">{selectedChallenge.instruction}</div>
            <div className="text-xs text-stone-600 mt-2"><i className="fa-solid fa-bullseye mr-1"></i> {selectedChallenge.target}</div>
          </div>

          <ChallengeRecorder onReady={setBlob} targetDuration={selectedChallenge.target_duration_sec} />

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-stone-600 block mb-1">ou envie um arquivo:</label>
              <Input type="file" accept="audio/*,.wav,.mp3,.webm,.ogg,.m4a" onChange={(e) => setFile(e.target.files?.[0] || null)} data-testid="chal-file-input" />
            </div>
            <div>
              <label className="text-xs text-stone-600 block mb-1">Observações (opcional)</label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="chal-notes" />
            </div>
          </div>

          <Button
            onClick={submit}
            disabled={busy || (!blob && !file) || !selectedPatient}
            className="mt-4 w-full bg-[#D46F54] hover:bg-[#B75C46] text-white"
            data-testid="chal-submit-btn"
          >
            {busy ? "Analisando…" : (<><i className="fa-solid fa-wand-magic-sparkles mr-2"></i>Analisar tentativa</>)}
          </Button>
        </div>
      )}

      {lastResult && (
        <div className="bg-white border border-stone-200 rounded-lg p-6 mb-6" data-testid="chal-result-panel">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Resultado</div>
          <div className={`border rounded-md p-4 mb-4 ${gradeCls(lastResult.evaluation?.grade)}`}>
            <div className="flex items-start gap-3">
              <i className={`fa-solid ${gradeIcon(lastResult.evaluation?.grade)} text-2xl mt-1`}></i>
              <div className="flex-1">
                <div className="font-heading text-lg font-medium">{lastResult.challenge_title}</div>
                <div className="text-sm mt-1">{lastResult.evaluation?.message}</div>
              </div>
              <audio src={`${API}/voice/challenges/audio/${lastResult.attempt_id}`} controls className="max-w-xs" />
            </div>
          </div>

          {lastResult.task_metrics && Object.keys(lastResult.task_metrics).length > 0 && (
            <>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-2">Métricas da tarefa</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4" data-testid="task-metrics-grid">
                {Object.entries(lastResult.task_metrics).map(([k, v]) => (
                  <TaskMetricPill key={k} label={humanizeKey(k)} value={v} />
                ))}
              </div>
            </>
          )}

          {lastResult.metrics && Object.keys(lastResult.metrics).length > 0 && (
            <>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-2">Acústica de referência</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(lastResult.metrics).map(([k, v]) => (
                  <TaskMetricPill key={k} label={humanizeKey(k)} value={v} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <div className="bg-white border border-stone-200 rounded-lg p-5">
        <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Histórico de tentativas</div>
        {attempts.length === 0 ? (
          <div className="text-sm text-stone-500 py-4 text-center">Nenhuma tentativa registrada ainda.</div>
        ) : (
          <div className="space-y-2">
            {attempts.map((a) => (
              <div
                key={a.attempt_id}
                className={`p-3 border rounded-md text-sm cursor-pointer ${
                  lastResult?.attempt_id === a.attempt_id ? "border-[#D46F54] bg-[#F3E7E4]/30" : "border-stone-200 hover:bg-stone-50"
                }`}
                onClick={() => setLastResult(a)}
                data-testid={`attempt-row-${a.attempt_id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <i className={`fa-solid ${gradeIcon(a.evaluation?.grade)} ${
                      a.evaluation?.grade === "ok" ? "text-emerald-600" :
                      a.evaluation?.grade === "warn" ? "text-amber-600" :
                      a.evaluation?.grade === "alert" ? "text-red-600" : "text-stone-500"
                    }`}></i>
                    <div className="font-medium truncate">{a.challenge_title}</div>
                    <div className="text-xs text-stone-500 whitespace-nowrap">· {a.patient_name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-[11px] text-stone-500">{new Date(a.created_at).toLocaleString("pt-BR")}</div>
                    <button onClick={(e) => { e.stopPropagation(); del(a.attempt_id); }} className="text-stone-400 hover:text-red-600" data-testid={`delete-attempt-${a.attempt_id}`}>
                      <i className="fa-solid fa-trash text-xs"></i>
                    </button>
                  </div>
                </div>
                {a.evaluation?.message && <div className="text-xs text-stone-600 mt-1 line-clamp-1">{a.evaluation.message}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
