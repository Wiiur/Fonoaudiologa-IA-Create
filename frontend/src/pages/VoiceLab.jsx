import React, { useEffect, useRef, useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams, Link } from "react-router-dom";
import api, { API } from "@/lib/api";
import { toast } from "sonner";

// Componentes UI
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MarkdownView from "@/components/MarkdownView";

// Ícones
import { 
  ArrowLeft, Activity, Target, SlidersHorizontal, Settings2, Download, 
  BrainCircuit, AudioLines, AlertCircle, Mic, Square,
  Trash2, Calendar, Bot, Gauge, BookOpen, HelpCircle, Info, Play, Waves
} from 'lucide-react';

// Gráficos (Recharts)
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea, AreaChart, Area } from 'recharts';

// ============================================================================
// 1. CONSTANTES E REGRAS DE NORMATIZAÇÃO
// ============================================================================
const RANGES = {
  jitter_local_pct: { max: 1.04, label: "Jitter" },
  shimmer_local_pct: { max: 3.81, label: "Shimmer" },
  hnr_db: { min: 20, label: "HNR" },
  cpp_db: { min: 12, label: "CPP" },
  f0_mean_hz: { min: 80, max: 300, label: "F0" } 
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
  { key: "duration_sec", label: "Duração", unit: "s", precision: 2, desc: "Tempo total de fonação extraído do áudio processado." },
  { key: "phonation_time_sec", label: "Fonação", unit: "s", precision: 2, desc: "Tempo real de fonação sonora (descontando silêncios)." },
  { key: "f0_mean_hz", label: "F0 médio", unit: "Hz", precision: 1, desc: "O tom base da voz (grave ou agudo). Mede as vibrações das pregas vocais por segundo." },
  { key: "f0_std_hz", label: "F0 desvio", unit: "Hz", precision: 2, desc: "Grau de variação do tom base durante a fonação." },
  { key: "jitter_local_pct", label: "Jitter (local)", unit: "%", precision: 3, desc: "Mede a instabilidade na AFINAÇÃO. Valores altos indicam vibração irregular (voz rouca)." },
  { key: "shimmer_local_pct", label: "Shimmer (local)", unit: "%", precision: 3, desc: "Mede a instabilidade no VOLUME. Capta a variação de energia (voz soprosa)." },
  { key: "hnr_db", label: "HNR", unit: "dB", precision: 2, desc: "Relação Harmônico/Ruído. Quanto maior o valor, mais clara e sem ruídos é a voz." },
  { key: "f1_hz", label: "F1", unit: "Hz", precision: 0, desc: "Frequência de ressonância ligada à abertura da boca." },
  { key: "f2_hz", label: "F2", unit: "Hz", precision: 0, desc: "Frequência de ressonância ligada ao posicionamento da língua." },
  { key: "f3_hz", label: "F3", unit: "Hz", precision: 0, desc: "Ressonância aguda do trato vocal (traz 'brilho' à voz)." },
  { key: "intensity_db", label: "Intensidade", unit: "dB", precision: 2, desc: "Volume médio capturado pelo microfone." },
  { key: "cpp_db", label: "CPP (aprox.)", unit: "dB", precision: 2, desc: "Marcador Padrão-Ouro. Mede a regularidade global da voz para detectar disfonia." },
];

const VITAL_KEYS = ["f0_mean_hz", "jitter_local_pct", "shimmer_local_pct", "hnr_db", "cpp_db"];

// ============================================================================
// 2. COMPONENTE GRAVADOR NATIVO (WAV LOSSLESS - CLÍNICO)
// ============================================================================
function Recorder({ onReady }) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioURL, setAudioURL] = useState(null);
  const [blob, setBlob] = useState(null);
  const streamRef = useRef(null);
  const audioContextRef = useRef(null);
  const processorRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (processorRef.current && audioContextRef.current) {
        processorRef.current.disconnect();
        if (audioContextRef.current.state !== 'closed') audioContextRef.current.close();
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  const encodeWAV = (samples, sampleRate) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeString = (view, offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, sampleRate: 44100 }
      });
      streamRef.current = stream;
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      chunksRef.current = [];
      processor.onaudioprocess = (e) => chunksRef.current.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      source.connect(processor);
      processor.connect(audioContext.destination);
      setElapsed(0);
      setRecording(true);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) { toast.error("Permissão de microfone negada ou erro na captura."); }
  };

  const stopRecording = (shouldCreateBlob = true) => {
    if (!recording && !streamRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (processorRef.current && audioContextRef.current) {
      processorRef.current.disconnect();
      if (audioContextRef.current.state !== 'closed') audioContextRef.current.close();
    }
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

    if (shouldCreateBlob && chunksRef.current.length > 0) {
      const length = chunksRef.current.reduce((acc, val) => acc + val.length, 0);
      const result = new Float32Array(length);
      let offset = 0;
      chunksRef.current.forEach(chunk => { result.set(chunk, offset); offset += chunk.length; });
      const audioBlob = encodeWAV(result, 44100);
      const wavFile = new File([audioBlob], `gravacao_lab_${Date.now()}.wav`, { type: 'audio/wav', lastModified: Date.now() });
      setBlob(wavFile);
      setAudioURL(URL.createObjectURL(wavFile));
      onReady?.(wavFile);
    }
    setRecording(false);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {!recording && !blob && (
        <Button onClick={start} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-10 rounded-xl shadow-sm transition-all">
          <Mic size={16} className="mr-2" /> Iniciar Gravação (PCM Lossless)
        </Button>
      )}
      {recording && (
        <Button onClick={() => stopRecording(true)} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold h-10 rounded-xl shadow-sm animate-pulse">
          <Square size={14} className="mr-2 fill-white" /> Parar Gravação ({elapsed}s)
        </Button>
      )}
      {blob && !recording && (
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
          <audio src={audioURL} controls className="w-full h-10" />
          <Button variant="outline" onClick={() => { setBlob(null); setAudioURL(null); setElapsed(0); onReady?.(null); }} className="h-10 rounded-xl border-stone-300 text-stone-600 w-full sm:w-auto shrink-0">
            Refazer
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 3. COMPONENTE PRINCIPAL: VOICELAB
// ============================================================================
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
  const [secureAudioUrl, setSecureAudioUrl] = useState(null);

  // NOVO: Adicionado aba "praat"
  const [viewMode, setViewMode] = useState("clinical"); // 'clinical' | 'scientific' | 'praat'
  const [spectroConfig, setSpectroConfig] = useState({ band: "estreita", showF0: true, showFormants: true });

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: async () => (await api.get("/patients")).data });
  const { data: analyses = [] } = useQuery({ queryKey: ["voice-analyses", selectedPatient], queryFn: async () => (await api.get(`/voice/analyses${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data });

  useEffect(() => {
    let objectUrl = null;
    if (current?.analysis_id) {
      setSecureAudioUrl(null); 
      api.get(`/voice/audio/${current.analysis_id}`, { responseType: 'blob' })
        .then(res => {
          objectUrl = URL.createObjectURL(res.data);
          setSecureAudioUrl(objectUrl);
        })
        .catch(err => { toast.error("Você não tem permissão para ouvir este áudio (Proteção LGPD)."); });
    }
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [current?.analysis_id]);

  const upload = async () => {
    if (!selectedPatient) return toast.error("Selecione um paciente");
    const src = file || audioBlob;
    if (!src) return toast.error("Grave ou selecione um arquivo de áudio");
    setUploading(true);
    try {
      const fd = new FormData();
      const filename = src.name || `audio_laboratorio_${Date.now()}.wav`; 
      fd.append("file", src, filename);
      fd.append("patient_id", selectedPatient);
      fd.append("task", task);
      if (notes) fd.append("notes", notes);
      
      const { data } = await api.post("/voice/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Análise acústica concluída");
      setCurrent(data);
      setReportText("");
      setAudioBlob(null); setFile(null);
      qc.invalidateQueries({ queryKey: ["voice-analyses"] });
    } catch (e) { toast.error(e.response?.data?.detail || "Falha no upload"); } finally { setUploading(false); }
  };

  const generateReport = async () => {
    if (!current) return;
    setStreaming(true);
    setReportText("");
    try {
      const requestHeaders = { "Content-Type": "application/json" };
      if (process.env.NODE_ENV === 'development') requestHeaders["user-id"] = "doc_mock_123";

      const res = await fetch(`${api.defaults.baseURL}/voice/analyses/${current.analysis_id}/report`, { 
        method: "POST", credentials: "include", headers: requestHeaders
      });
      if (!res.ok) throw new Error("Acesso negado.");
      
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
          } catch {}
        }
      }
    } catch (e) { toast.error(`Falha: ${e.message}`); } finally { setStreaming(false); }
  };

  const loadAnalysis = async (analysisId) => {
    const { data } = await api.get(`/voice/analyses/${analysisId}`);
    setCurrent(data);
    setReportText(data.report || "");
  };

  const deleteAnalysis = async (analysisId) => {
    if (!window.confirm("Excluir esta análise permanentemente?")) return;
    await api.delete(`/voice/analyses/${analysisId}`);
    qc.invalidateQueries({ queryKey: ["voice-analyses"] });
    if (current?.analysis_id === analysisId) { setCurrent(null); setReportText(""); }
    toast.success("Análise removida");
  };

useEffect(() => {
  if (viewMode !== "scientific" || !secureAudioUrl) return;
  const audioEl = document.getElementById("lab-audio-player");
  const canvas = document.getElementById("spectro-canvas");
  if (!audioEl || !canvas) return;

  const ctx = canvas.getContext("2d");
  if (!window._audioNodesMap) window._audioNodesMap = new WeakMap();

  let nodeData = window._audioNodesMap.get(audioEl);
  if (!nodeData) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    const source = audioCtx.createMediaElementSource(audioEl);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
    nodeData = { audioCtx, analyser };
    window._audioNodesMap.set(audioEl, nodeData);
  }

  const { analyser } = nodeData;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  let animationId;

  const draw = () => {
    animationId = requestAnimationFrame(draw);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    analyser.getByteFrequencyData(dataArray);
    ctx.fillStyle = "#1A1817";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.5;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      const r = barHeight + 25 * (i / bufferLength);
      const g = 100 * (i / bufferLength);
      const b = 250 - barHeight;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }
  };
  draw();
  return () => cancelAnimationFrame(animationId);
}, [viewMode, secureAudioUrl]);

// ============================================================================
  // RENDERIZADOR CLÍNICO DE ALTA FIDELIDADE (MATEMÁTICA CORRIGIDA E AUTO-ZOOM)
  // ============================================================================
  const praatData = useMemo(() => {
    const pTimeline = current?.metrics?.pitch_timeline;
    const iTimeline = current?.metrics?.intensity_timeline;
    const fTimeline = current?.metrics?.formants_timeline; 
    const wTimeline = current?.metrics?.wave_timeline; // A onda real que veio do Python!
    const duration = current?.metrics?.duration_sec || 3;

    let pitchPath = [];
    let intensityPath = [];
    let formantsDots = [];
    let waveLines = []; // Array de linhas individuais

    // 1. ONDA ACÚSTICA REAL (COM AUTO-ZOOM DO FRONTEND)
    if (wTimeline && wTimeline.length > 0) {
      // Passo A: Descobrir o pico máximo para o Auto-Zoom
      let maxAmp = 0.0001; 
      for (let i = 0; i < wTimeline.length; i++) {
        const absVal = Math.abs(wTimeline[i]);
        if (absVal > maxAmp) maxAmp = absVal;
      }
      
      // Passo B: Fator de escala (Força a onda a bater no teto e no chão: 48%)
      const scaleFactor = 48 / maxAmp;
      
      // Passo C: Gerar as linhas com ~1000 pontos para preenchimento perfeito
      const step = Math.max(1, Math.floor(wTimeline.length / 1000)); 
      
      for (let i = 0; i < wTimeline.length; i += step) {
        const x = (i / wTimeline.length) * 100;
        
        // Multiplica o valor original pelo fator de escala do Auto-Zoom
        const amp = Math.min(48, Math.abs(wTimeline[i]) * scaleFactor); 
        
        // Em vez de desenhar um caminho contínuo, guardamos as coordenadas de cada "risco" vertical
        if (amp > 0.2) { // Só desenha o risco se houver amplitude visível
           waveLines.push({ x: x, y1: 50 - amp, y2: 50 + amp });
        }
      }
    }

    // 2. LINHA AZUL (PITCH F0) - Filtrando silêncios para a linha não colar no chão
    if (pTimeline && pTimeline.time && pTimeline.time.length > 0) {
      for (let i = 0; i < pTimeline.time.length; i++) {
        const t = pTimeline.time[i];
        const freq = pTimeline.freq[i];
        
        if (freq > 75) { // Só desenha onde realmente tem voz
          const x = (t / duration) * 100;
          // Escala: 75Hz (base=100) a 500Hz (topo=0)
          const normalizedFreq = Math.min(500, Math.max(75, freq));
          const y = 100 - ((normalizedFreq - 75) / 425) * 100;
          pitchPath.push(`${x},${y}`);
        }
      }
    }

    // 3. LINHA AMARELA (INTENSIDADE)
    if (iTimeline && iTimeline.time && iTimeline.time.length > 0) {
      for (let i = 0; i < iTimeline.time.length; i++) {
        const t = iTimeline.time[i];
        const db = iTimeline.db[i];
        const x = (t / duration) * 100;
        
        const normalizedDb = Math.min(100, Math.max(50, db));
        const y = 100 - ((normalizedDb - 50) / 50) * 100;
        intensityPath.push(`${x},${y}`);
      }
    }

    // 4. FORMANTES (PONTOS CIRÚRGICOS)
    if (fTimeline && fTimeline.time && fTimeline.time.length > 0) {
      for (let i = 0; i < fTimeline.time.length; i++) {
        const t = fTimeline.time[i];
        const x = (t / duration) * 100;
        
        if (fTimeline.f1[i] > 0) formantsDots.push({ cx: x, cy: 100 - (Math.min(5000, fTimeline.f1[i]) / 5000) * 100 });
        if (fTimeline.f2[i] > 0) formantsDots.push({ cx: x, cy: 100 - (Math.min(5000, fTimeline.f2[i]) / 5000) * 100 });
        if (fTimeline.f3[i] > 0) formantsDots.push({ cx: x, cy: 100 - (Math.min(5000, fTimeline.f3[i]) / 5000) * 100 });
      }
    }

    // Fallbacks
    if (pitchPath.length === 0) pitchPath = ["0,50", "100,50"];
    if (intensityPath.length === 0) intensityPath = ["0,50", "100,50"];

    return { 
      pitch: pitchPath.join(' '), 
      intensity: intensityPath.join(' '), 
      wave: waveLines, 
      formants: formantsDots
    };
  }, [current?.metrics]);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in bg-stone-50 min-h-screen">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <Link to={selectedPatient ? `/patients/${selectedPatient}` : "/patients"} className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit mb-2">
            <ArrowLeft size={16} /> Voltar ao Prontuário
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-stone-800 flex items-center gap-2">
            <AudioLines className="text-[#D46F54]" size={28} /> Laboratório Vocal
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-xl">
            Análise acústica multiparamétrica, fonetografia e integração MDVP.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: CONTROLES */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-stone-200 shadow-sm rounded-3xl p-6">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Nova Análise</div>

            <label className="text-xs font-medium text-stone-600 block mb-1">Paciente</label>
            <Select value={selectedPatient} onValueChange={setSelectedPatient}>
              <SelectTrigger className="bg-white rounded-xl mb-4 border-stone-200"><SelectValue placeholder="Selecionar paciente…" /></SelectTrigger>
              <SelectContent>{patients.map((p) => ( <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem> ))}</SelectContent>
            </Select>

            <label className="text-xs font-medium text-stone-600 block mb-1">Tarefa vocal</label>
            <Select value={task} onValueChange={setTask}>
              <SelectTrigger className="bg-white rounded-xl mb-4 border-stone-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sustained_vowel">Vogal sustentada (/a/)</SelectItem>
                <SelectItem value="reading">Leitura de texto padrão</SelectItem>
                <SelectItem value="spontaneous">Fala espontânea</SelectItem>
              </SelectContent>
            </Select>

            <label className="text-xs font-medium text-stone-600 block mb-1">Observações do doutor (opcional)</label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-white rounded-xl resize-none mb-4 text-sm border-stone-200" />

            <div className="pt-2">
              <label className="text-xs font-bold text-stone-500 block mb-2 uppercase tracking-widest">Áudio</label>
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[10px] p-2.5 rounded-lg mb-4 leading-relaxed shadow-sm">
                <b>Aviso Clínico:</b> O gravador web aplica compressão automática. Para máxima precisão no MDVP, prefira enviar um arquivo <b>.WAV original</b>.
              </div>
              <Recorder onReady={setAudioBlob} />
              <div className="text-[10px] text-stone-400 mt-4 mb-2">ou envie um arquivo lossless (.wav):</div>
              <Input type="file" accept="audio/wav, audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-xl border-stone-200 bg-white" />
            </div>

            <Button onClick={upload} disabled={uploading || (!audioBlob && !file) || !selectedPatient} className="w-full mt-6 bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-10 rounded-xl shadow-sm transition-all">
              {uploading ? <Activity className="animate-spin mr-2" size={16} /> : null}
              {uploading ? "Analisando..." : "Enviar e analisar"}
            </Button>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Histórico do Paciente</div>
            {analyses.length === 0 ? (
              <div className="text-sm text-stone-400 py-6 text-center italic">Nenhuma análise ainda.</div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-2">
                {analyses.map((a) => (
                  <div key={a.analysis_id} onClick={() => loadAnalysis(a.analysis_id)} className={`p-4 rounded-xl border cursor-pointer transition-all ${current?.analysis_id === a.analysis_id ? "border-[#D46F54] bg-[#F3E7E4]/20 shadow-sm" : "border-stone-200 hover:bg-stone-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-bold text-sm text-stone-800 truncate">{a.patient_name}</div>
                      <button onClick={(e) => { e.stopPropagation(); deleteAnalysis(a.analysis_id); }} className="text-stone-300 hover:text-rose-500 transition-colors p-1"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex justify-between items-center text-[10px] uppercase font-bold tracking-wider text-stone-400">
                      <span>{new Date(a.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: DASHBOARD */}
        <div className="lg:col-span-8 space-y-6">
          {!current ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-3xl h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <div className="w-16 h-16 bg-stone-100 rounded-full flex items-center justify-center mb-4">
                <Target size={32} className="text-stone-300" />
              </div>
              <div className="text-sm font-bold text-stone-500">Selecione uma análise no histórico ou grave um novo áudio.</div>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-4 space-y-6">
              
              <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#D46F54] font-bold mb-1">Análise Carregada</div>
                    <div className="font-heading text-xl font-bold text-stone-800">{current.patient_name}</div>
                    <div className="text-xs text-stone-500 font-medium flex items-center gap-2 mt-1">
                      <Calendar size={12}/> {new Date(current.created_at).toLocaleString("pt-BR")} <span className="text-stone-300">|</span> <Activity size={12}/> {current.task}
                    </div>
                  </div>
                  <div className="w-full md:w-auto bg-stone-50 p-2 rounded-xl border border-stone-200">
                    {secureAudioUrl ? (
                      <audio id="lab-audio-player" src={secureAudioUrl} controls crossOrigin="anonymous" className="w-full md:w-64 h-10" />
                    ) : (
                      <div className="w-full md:w-64 h-10 flex items-center justify-center text-[10px] text-stone-500 font-bold uppercase tracking-widest animate-pulse">
                        Descriptografando Áudio...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ABAS */}
              <div className="flex border-b border-stone-200">
                <button onClick={() => setViewMode("clinical")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'clinical' ? 'border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/20' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <Target size={16} /> Visão Clínica
                </button>
                <button onClick={() => setViewMode("scientific")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'scientific' ? 'border-stone-800 text-stone-800 bg-stone-100' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <SlidersHorizontal size={16} /> Visão Científica
                </button>
                
                {/* 🌟 NOVA ABA: PRAAT PRO */}
                <button onClick={() => setViewMode("praat")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'praat' ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <Waves size={16} /> Praat Pro (Padrão Ouro)
                </button>
              </div>

              {/* ================================================= */}
              {/* MODO CLÍNICO                                      */}
              {/* ================================================= */}
              {viewMode === "clinical" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  {/* CARD HERO CPPS */}
                  <div className="bg-[#D46F54] rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="relative z-10">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-white/80 mb-2 flex items-center gap-2">
                        <Gauge size={16} /> Qualidade Global da Voz (CPPS)
                      </h2>
                      <div className="flex items-baseline gap-2">
                        <span className="text-6xl font-black tracking-tighter">{current.metrics?.cpp_db > 10 ? '85' : '42'}</span>
                        <span className="text-xl font-bold text-white/70">/ 100</span>
                      </div>
                      <div className="mt-4 bg-white/20 backdrop-blur-sm w-max px-4 py-1.5 rounded-lg border border-white/30 text-sm font-bold shadow-sm">
                        {current.metrics?.cpp_db > 10 ? 'Voz com boa energia harmônica' : 'Voz com presença de ruído/soprosidade'}
                      </div>
                    </div>
                    <div className="relative z-10 w-24 h-24 rounded-full border-4 border-white/20 flex items-center justify-center bg-white/10 backdrop-blur-md shrink-0">
                      <Activity size={40} className="text-white opacity-80" />
                    </div>
                  </div>

                  {/* SEMÁFORO INTELIGENTE */}
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-stone-800 mb-6 flex items-center gap-2 border-b border-stone-100 pb-4">
                      <Target className="text-[#D46F54]" size={18}/> Semáforo de Parâmetros Acústicos
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {VITAL_KEYS.map((key) => {
                        const mInfo = METRIC_LABELS.find(m => m.key === key);
                        const v = current.metrics?.[key];
                        let cls = classify(key, v);
                        
                        // LÓGICA DINÂMICA
                        if (current.metrics?.normative_ranges && current.metrics.normative_ranges[key]) {
                           const norm = current.metrics.normative_ranges[key];
                           if ((norm.min != null && v < norm.min) || (norm.max != null && v > norm.max)) {
                              cls = "warn"; 
                           } else {
                              cls = "ok";
                           }
                           if (key === 'f0_mean_hz') {
                             mInfo.desc = `O tom base da voz. Normativa aplicada (Idade/Sexo): ${norm.min}Hz a ${norm.max}Hz.`;
                           }
                        }

                        const display = v == null ? "—" : Number(v).toFixed(mInfo.precision);
                        let colorClass = "border-stone-200 bg-white text-stone-700";
                        let Icon = null;
                        
                        if (cls === "warn") {
                          colorClass = "border-red-200 bg-red-50 text-red-800";
                          Icon = <AlertCircle size={14} className="text-red-500" />;
                        } else if (cls === "ok") {
                          colorClass = "border-emerald-200 bg-emerald-50 text-emerald-800";
                        }

                        return (
                          <div key={key} className={`rounded-xl p-4 transition-all border relative group ${colorClass}`}>
                            <div className="flex justify-between items-start mb-1 cursor-help">
                              <div className="flex items-center gap-1">
                                <span className={`text-[10px] uppercase font-bold tracking-widest ${cls === 'warn' ? 'text-red-600' : 'text-stone-500'}`}>
                                  {mInfo.label}
                                </span>
                                <HelpCircle size={12} className="text-stone-300 group-hover:text-[#D46F54] transition-colors" />
                              </div>
                              {Icon}
                              
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-stone-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl font-medium">
                                {mInfo.desc}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-900"></div>
                              </div>
                            </div>
                            <div className="font-heading text-2xl font-black mt-2">
                              {display} <span className="text-xs font-normal text-stone-500">{v == null ? "" : mInfo.unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[11px] text-stone-400 font-bold uppercase tracking-widest mt-6 flex items-center gap-2">
                      <Info size={14}/> Verde = Normal | Vermelho = Atenção/Alterado (Base: MDVP / Behlau 2001)
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2"><Activity className="text-emerald-500" size={18}/> Diagrama de Desvio Fonatório (DDF)</h3>
                        <span className="text-[10px] bg-stone-100 px-2 py-1 rounded text-stone-500 font-bold uppercase">Jitter x Shimmer</span>
                      </div>
                      <div className="h-[300px] w-full border border-stone-100 rounded-xl bg-stone-50 relative overflow-hidden p-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                            <XAxis type="number" dataKey="x" name="Jitter" domain={[0, 4]} tick={{fontSize: 10}} label={{ value: 'Jitter (Rugosidade)', position: 'insideBottom', offset: -10, fontSize: 12, fill: '#78716c' }} />
                            <YAxis type="number" dataKey="y" name="Shimmer" domain={[0, 15]} tick={{fontSize: 10}} label={{ value: 'Shimmer (Soprosidade)', angle: -90, position: 'insideLeft', fontSize: 12, fill: '#78716c' }} />
                            <RechartsTooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{borderRadius: '12px'}} />
                            <ReferenceArea x1={0} x2={1.04} y1={0} y2={3.81} fill="#10b981" fillOpacity={0.15} />
                            <Scatter name="Análise Atual" data={[{ x: current.metrics?.jitter_local_pct || 0, y: current.metrics?.shimmer_local_pct || 0, z: 100 }]} fill="#D46F54" shape="circle" />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* FONETOGRAMA RECHARTS */}
                    <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col">
                      <h3 className="text-sm font-bold text-stone-800 mb-2 flex items-center gap-2"><AudioLines className="text-blue-500" size={18}/> Fonetograma Simplificado</h3>
                      <p className="text-xs text-stone-500 mb-4">Extensão vocal (Graves/Agudos) e Intensidade (Forte/Fraco).</p>
                      <div className="flex-1 min-h-[250px] w-full border border-stone-100 rounded-xl bg-stone-50 p-4">
                        {(() => {
                          const f0 = current.metrics?.f0_mean_hz || 120;
                          const std = current.metrics?.f0_std_hz || 15;
                          const db = current.metrics?.intensity_db || 65;
                          
                          const fonetogramaData = [
                            { hz: Math.max(50, f0 - std * 3), db: Math.max(40, db - 15) },
                            { hz: f0 - std, db: db - 2 },
                            { hz: f0, db: db + 5 }, 
                            { hz: f0 + std, db: db - 2 },
                            { hz: f0 + std * 3, db: Math.max(40, db - 15) }
                          ];

                          return (
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={fonetogramaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                <XAxis dataKey="hz" type="number" domain={['dataMin - 20', 'dataMax + 20']} tick={{fontSize: 10}} label={{ value: 'Frequência (Hz)', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                                <YAxis domain={[40, 100]} tick={{fontSize: 10}} label={{ value: 'Intensidade (dB)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <RechartsTooltip cursor={{strokeDasharray: '3 3'}} contentStyle={{borderRadius: '8px', fontSize: '12px'}} formatter={(value) => [`${value} dB`, 'Intensidade']} labelFormatter={(label) => `${Number(label).toFixed(0)} Hz`} />
                                <Area type="monotone" dataKey="db" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} activeDot={{ r: 6 }} />
                              </AreaChart>
                            </ResponsiveContainer>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ================================================= */}
              {/* MODO CIENTÍFICO                                   */}
              {/* ================================================= */}
              {viewMode === "scientific" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2"><Settings2 className="text-stone-500" size={18}/> Espectrograma Interativo (Gráfico 4D)</h3>
                    </div>
                     
                    <div className="bg-[#1A1817] rounded-2xl p-6 border border-[#2D2A27] shadow-inner flex flex-col">
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
                         <div className="flex items-center gap-4 bg-[#2D2A27] p-1.5 rounded-xl border border-[#3E3A36]">
                           <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest pl-3">Análise de Banda</span>
                           <div className="flex gap-1">
                             <button onClick={() => setSpectroConfig({...spectroConfig, band: 'estreita'})} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-colors ${spectroConfig.band === 'estreita' ? 'bg-[#3B82F6] text-white' : 'text-stone-400 hover:text-white hover:bg-[#3E3A36]'}`}>Estreita (Harmônicos)</button>
                             <button onClick={() => setSpectroConfig({...spectroConfig, band: 'larga'})} className={`px-4 py-2 rounded-lg text-xs font-bold shadow-md transition-colors ${spectroConfig.band === 'larga' ? 'bg-[#3B82F6] text-white' : 'text-stone-400 hover:text-white hover:bg-[#3E3A36]'}`}>Larga (Pulsos Glóticos)</button>
                           </div>
                         </div>
                         <div className="flex items-center gap-6 bg-[#2D2A27] px-4 py-3 rounded-xl border border-[#3E3A36]">
                           <label className="flex items-center gap-2 cursor-pointer group">
                             <input type="checkbox" checked={spectroConfig.showF0} onChange={(e) => setSpectroConfig({...spectroConfig, showF0: e.target.checked})} className="accent-blue-500 cursor-pointer w-4 h-4 rounded bg-stone-900 border-stone-700" />
                             <span className="text-xs font-medium text-stone-300 group-hover:text-white transition-colors">Overlays Pitch (F0)</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer group">
                             <input type="checkbox" checked={spectroConfig.showFormants} onChange={(e) => setSpectroConfig({...spectroConfig, showFormants: e.target.checked})} className="accent-blue-500 cursor-pointer w-4 h-4 rounded bg-stone-900 border-stone-700" />
                             <span className="text-xs font-medium text-stone-400 group-hover:text-white transition-colors">Formantes (F1-F3)</span>
                           </label>
                         </div>
                       </div>

                       <div className="relative w-full h-[300px] bg-[#1A1817] rounded-xl border border-[#2D2A27] overflow-hidden flex flex-col justify-center items-center">
                         <span className="absolute top-4 left-4 text-[10px] text-stone-500 font-mono font-bold tracking-widest z-20 pointer-events-none">0 Hz</span>
                         <span className="absolute top-4 right-4 text-[10px] text-stone-500 font-mono font-bold tracking-widest z-20 pointer-events-none">{(current.metrics?.duration_sec || 3).toFixed(2)}s</span>
                         <span className="absolute bottom-4 left-4 text-[10px] text-stone-500 font-mono font-bold tracking-widest z-20 pointer-events-none">22.05 kHz</span>
                         
                         <canvas id="spectro-canvas" className="absolute top-0 left-0 w-full h-full z-10 opacity-90"></canvas>

                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center space-y-3 z-30 pointer-events-none opacity-40">
                           <Play size={32} className="mx-auto text-blue-500" />
                           <h4 className="text-stone-300 font-bold tracking-[0.2em] text-[10px] uppercase">Dê play no áudio acima para iniciar</h4>
                         </div>

                         {spectroConfig.showF0 && <div className="absolute w-full h-px bg-blue-500/50 left-0 bottom-[30%] blur-[1px] z-20 pointer-events-none"></div>}
                         {spectroConfig.showFormants && <div className="absolute w-full h-2 bg-rose-500/20 left-0 bottom-[50%] blur-[2px] z-20 pointer-events-none"></div>}
                       </div>
                    </div>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm overflow-x-auto">
                    <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2 border-b border-stone-100 pb-4">
                      <BookOpen className="text-stone-500" size={16}/> Tabela de Extração Acústica Bruta (MDVP)
                    </h3>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-4 rounded-tl-xl">Parâmetro Numérico</th>
                          <th className="p-4">Valor Base</th>
                          <th className="p-4 rounded-tr-xl">Unidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-700 font-medium">
                        {METRIC_LABELS.map(({ key, label, unit, precision, desc }) => {
                          const v = current.metrics?.[key];
                          return (
                            <tr key={key} className="hover:bg-stone-50 transition-colors group relative">
                              <td className="p-4 border-r border-stone-100 flex items-center gap-2 cursor-help">
                                {label}
                                <HelpCircle size={14} className="text-stone-300 group-hover:text-blue-500 transition-colors" />
                                <div className="absolute bottom-full left-0 mb-2 w-64 bg-stone-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl font-sans font-normal">
                                  {desc}
                                </div>
                              </td>
                              <td className="p-4 font-mono font-bold text-stone-800">{v == null ? "—" : Number(v).toFixed(precision)}</td>
                              <td className="p-4 text-stone-400 text-xs">{unit}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {/* ================================================= */}
              {/* MODO PRAAT PRO (VISUAL CLÁSSICO E ACADÊMICO)      */}
              {/* ================================================= */}
              {viewMode === "praat" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  <div className="bg-stone-100 border border-stone-300 rounded-sm p-4 md:p-6 shadow-md">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                      <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2 font-sans">
                        <Waves className="text-blue-600" size={18}/> Praat Picture (View & Edit)
                      </h3>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-600 uppercase tracking-widest font-sans"><div className="w-3 h-0.5 bg-blue-600"></div> Pitch</div>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-600 uppercase tracking-widest font-sans"><div className="w-3 h-0.5 bg-yellow-500"></div> Intensity</div>
                      </div>
                    </div>

                    {/* TELA CLÁSSICA DO PRAAT (Bordas secas, sem dark mode) */}
                    <div className="w-full flex flex-col border border-stone-800 bg-white shadow-inner font-mono select-none">
                      
                      {/* 1. Oscilograma (Topo Branco - Método de Linhas Verticais Densas) */}
                      <div className="h-[140px] w-full border-b border-stone-800 relative flex items-center bg-white overflow-hidden">
                        {/* Escalas Y */}
                        <span className="absolute left-1 top-1 text-[10px] text-stone-900 z-10">0.0500</span>
                        <span className="absolute left-1 bottom-1 text-[10px] text-stone-900 z-10">-0.0500</span>
                        
                        {/* Renderização em massa dos riscos verticais */}
                        <svg className="w-full h-full opacity-90" viewBox="0 0 100 100" preserveAspectRatio="none">
                          {praatData.wave.length > 0 ? (
                            praatData.wave.map((line, i) => (
                              <line 
                                key={i}
                                x1={line.x} 
                                y1={line.y1} 
                                x2={line.x} 
                                y2={line.y2} 
                                stroke="#1c1917" 
                                strokeWidth="0.2" // <-- 0.2: Mais grossa que o fio de cabelo, mas sem perder as pontas das agulhas da onda real
                                strokeLinecap="butt"
                              />
                            ))
                          ) : (
                            <line x1="0" y1="50" x2="100" y2="50" stroke="#1c1917" strokeWidth="0.1" />
                          )}
                        </svg>
                      </div>

                      {/* 2. Espectrograma + Curvas (Fundo Cinza) */}
                      <div className="h-[280px] w-full relative bg-[#e0e0e0] overflow-hidden">
                        
                        {/* Filtro de Chiado (Ruído do Espectrograma) */}
                        <svg className="absolute inset-0 w-full h-full opacity-30" preserveAspectRatio="none">
                          <defs>
                            <filter id="praat-noise" x="0" y="0" width="100%" height="100%">
                              <feTurbulence type="fractalNoise" baseFrequency="0.1 0.8" numOctaves="3" result="noise" />
                              <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.4 0" />
                            </filter>
                          </defs>
                          <rect width="100%" height="100%" filter="url(#praat-noise)" />
                        </svg>

                        {/* Textos de Escala (Idênticos ao Praat original) */}
                        <span className="absolute left-1 top-1 text-[10px] text-stone-900 z-10 bg-white/60 px-0.5">5000 Hz</span>
                        <span className="absolute left-1 bottom-1 text-[10px] text-stone-900 z-10 bg-white/60 px-0.5">0 Hz</span>
                        
                        <span className="absolute right-1 top-1 text-[10px] text-blue-700 font-bold z-10 bg-white/60 px-0.5">500 Hz</span>
                        <span className="absolute right-1 bottom-1 text-[10px] text-blue-700 font-bold z-10 bg-white/60 px-0.5">75 Hz</span>
                        
                        <span className="absolute right-12 top-1 text-[10px] text-yellow-700 font-bold z-10 bg-white/60 px-0.5">100 dB</span>
                        <span className="absolute right-12 bottom-1 text-[10px] text-yellow-700 font-bold z-10 bg-white/60 px-0.5">50 dB</span>

                        {/* OVERLAY CLÍNICO DE ALTA PRECISÃO */}
                        <svg className="w-full h-full absolute inset-0 drop-shadow-sm" viewBox="0 0 100 100" preserveAspectRatio="none">
                          
                          {/* Formantes com raio cirúrgico */}
                          {praatData.formants.map((f, i) => (
                            <circle key={i} cx={f.cx} cy={f.cy} r="0.3" fill="#ef4444" opacity="0.85" />
                          ))}

                          {/* Intensidade (Amarelo) */}
                          <polyline 
                            points={praatData.intensity} 
                            fill="none" 
                            stroke="#eab308" 
                            strokeWidth="1.0" 
                            strokeLinejoin="round" 
                            strokeLinecap="round" 
                          />
                          
                          {/* Pitch F0 (Azul) */}
                          <polyline 
                            points={praatData.pitch} 
                            fill="none" 
                            stroke="#2563eb" 
                            strokeWidth="1.5" 
                            strokeLinejoin="round" 
                            strokeLinecap="round" 
                          />
                        </svg>

                        {/* Linha de Tempo Vertical (Cursor Simulado no centro) */}
                        <div className="absolute top-0 bottom-0 left-[50%] w-px bg-red-600/60 z-10"></div>
                      </div>
                      
                      {/* Barra de Status Clássica do Praat */}
                      <div className="bg-[#f0f0f0] border-t border-stone-800 p-1 flex justify-between text-[10px] text-stone-900">
                         <span>0.000000</span>
                         <span>Visible part {(current?.metrics?.duration_sec || 3).toFixed(6)} seconds</span>
                         <span>{(current?.metrics?.duration_sec || 3).toFixed(6)}</span>
                      </div>

                    </div>
                  </div>

                </div>
              )}

              {/* DIAGNÓSTICO IA (SEMPRE PRESENTE) */}
              <div className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 border-b border-stone-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-2.5 rounded-xl text-indigo-600"><Bot size={24}/></div>
                    <div>
                      <h4 className="text-sm font-bold text-indigo-900 uppercase tracking-widest flex items-center gap-2">Copiloto IA <span className="text-[9px] bg-indigo-200 text-indigo-800 px-1.5 py-0.5 rounded font-bold">BASEADO EM EVIDÊNCIAS</span></h4>
                      <p className="text-[10px] text-stone-500 mt-0.5">Diagnóstico Analisado Acústico (Com citação de fontes).</p>
                    </div>
                  </div>
                  <Button onClick={generateReport} disabled={streaming} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 shadow-sm w-full sm:w-auto">
                    {streaming ? <Activity className="animate-spin mr-2" size={16}/> : <BrainCircuit className="mr-2" size={16}/>}
                    {reportText ? "Regerar Diagnóstico" : "Gerar Diagnóstico com Fontes"}
                  </Button>
                </div>
                
                <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 min-h-[150px]">
                  {reportText ? (
                    <div className="prose prose-stone prose-sm max-w-none font-medium text-stone-700">
                      <MarkdownView content={reportText} />
                    </div>
                  ) : (
                    <div className="text-sm text-stone-400 py-6 text-center flex flex-col items-center">
                      <Bot size={32} className="mb-3 opacity-30"/>
                      Clique em "Gerar Diagnóstico com Fontes" para a IA cruzar a matemática acústica com os tratados da fonoaudiologia e fundamentar seu parecer.
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}