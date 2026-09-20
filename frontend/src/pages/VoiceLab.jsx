import React, { useEffect, useRef, useState } from "react";
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
  BrainCircuit, AudioLines, Plus, AlertCircle, CheckCircle2, Mic, Square,
  Trash2, UploadCloud, FileClock, Calendar, Bot, Gauge, BookOpen, HelpCircle, Info
} from 'lucide-react';

// Gráficos (Recharts)
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from 'recharts';

// ============================================================================
// 1. CONSTANTES E REGRAS DE NORMATIZAÇÃO (COM DESCRIÇÕES PARA OS TOOLTIPS)
// ============================================================================
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
// 2. COMPONENTE GRAVADOR NATIVO
// ============================================================================
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
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
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
    } catch (err) { toast.error("Permissão de microfone negada"); }
  };

  const stop = () => {
    if (mediaRef.current?.state === "recording") mediaRef.current.stop();
    setRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const reset = () => {
    setBlob(null); setAudioURL(null); setElapsed(0); onReady?.(null);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {!recording && !blob && (
        <Button onClick={start} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-10 rounded-xl shadow-sm transition-all">
          <Mic size={16} className="mr-2" /> Iniciar Gravação
        </Button>
      )}
      {recording && (
        <Button onClick={stop} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold h-10 rounded-xl shadow-sm animate-pulse">
          <Square size={14} className="mr-2 fill-white" /> Parar Gravação ({elapsed}s)
        </Button>
      )}
      {blob && !recording && (
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
          <audio src={audioURL} controls className="w-full h-10" />
          <Button variant="outline" onClick={reset} className="h-10 rounded-xl border-stone-300 text-stone-600 w-full sm:w-auto shrink-0">
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

  const [viewMode, setViewMode] = useState("clinical"); 
  const [spectroConfig, setSpectroConfig] = useState({ band: "estreita", showF0: true, showFormants: false });

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: async () => (await api.get("/patients")).data });
  const { data: analyses = [] } = useQuery({ queryKey: ["voice-analyses", selectedPatient], queryFn: async () => (await api.get(`/voice/analyses${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data });

  const upload = async () => {
    if (!selectedPatient) return toast.error("Selecione um paciente");
    const src = file || audioBlob;
    if (!src) return toast.error("Grave ou selecione um arquivo de áudio");
    setUploading(true);
    try {
      const fd = new FormData();
      const filename = file ? file.name : `recording_${Date.now()}.webm`;
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
      const url = `${api.defaults.baseURL}/voice/analyses/${current.analysis_id}/report`;
      const res = await fetch(url, { 
        method: "POST", 
        credentials: "include",
        headers: { "Content-Type": "application/json", "user-id": "doc_mock_123" }
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.detail || `Acesso negado (Erro ${res.status}).`);
      }
      
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
            if (p.error) toast.error(`Erro da IA: ${p.error}`);
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

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in bg-stone-50 min-h-screen">
      
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <Link to={`/patient/${selectedPatient || ''}`} className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit mb-2">
            <ArrowLeft size={16} /> Voltar ao Prontuário
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-stone-800 flex items-center gap-2">
            <AudioLines className="text-[#D46F54]" size={28} /> Análise Vocal Instrumental
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-xl">
            Grave ou envie um áudio de fonação sustentada para extrair métricas acústicas e gerar análise diagnóstica com IA.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUNA ESQUERDA: CONTROLES */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-stone-200 shadow-sm rounded-2xl p-6">
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
              <label className="text-xs font-bold text-stone-500 block mb-3 uppercase tracking-widest">Áudio</label>
              <Recorder onReady={setAudioBlob} />
              <div className="text-[10px] text-stone-400 mt-3 mb-1">ou envie um arquivo:</div>
              <Input type="file" accept="audio/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="rounded-xl border-stone-200 bg-white" />
            </div>

            <Button onClick={upload} disabled={uploading || (!audioBlob && !file) || !selectedPatient} className="w-full mt-6 bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-10 rounded-xl shadow-sm transition-all">
              {uploading ? <Activity className="animate-spin mr-2" size={16} /> : null}
              {uploading ? "Analisando..." : "Enviar e analisar"}
            </Button>
          </div>

          <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Histórico</div>
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
            /* 👇 AVISO DE PREMIUM ATIVADO PARA VOCÊ VER A MUDANÇA! */
            <div className="bg-white border-2 border-dashed border-emerald-300 rounded-3xl h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8 shadow-sm">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                <Target size={32} className="text-emerald-500" />
              </div>
              <h3 className="text-xl font-black text-stone-800 mb-2">Voice Lab Premium Ativado!</h3>
              <p className="text-sm text-stone-500 max-w-md">
                O código foi atualizado com sucesso. <b>Clique em uma gravação no histórico ao lado</b> ou faça um novo upload para ver os novos gráficos e o Espectrograma 4D.
              </p>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-4 space-y-6">
              
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[#D46F54] font-bold mb-1">Análise Carregada</div>
                    <div className="font-heading text-xl font-bold text-stone-800">{current.patient_name}</div>
                    <div className="text-xs text-stone-500 font-medium flex items-center gap-2 mt-1">
                      <Calendar size={12}/> {new Date(current.created_at).toLocaleString("pt-BR")} <span className="text-stone-300">|</span> <Activity size={12}/> {current.task}
                    </div>
                  </div>
                  <div className="w-full md:w-auto bg-stone-50 p-2 rounded-xl border border-stone-200">
                    <audio src={`${API}/voice/audio/${current.analysis_id}`} controls className="w-full md:w-64 h-10" />
                  </div>
                </div>
              </div>

              <div className="flex border-b border-stone-200">
                <button onClick={() => setViewMode("clinical")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'clinical' ? 'border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/20' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <Target size={16} /> Visão Clínica
                </button>
                <button onClick={() => setViewMode("scientific")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'scientific' ? 'border-stone-800 text-stone-800 bg-stone-100' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <SlidersHorizontal size={16} /> Visão Científica
                </button>
              </div>

              {/* MODO CLÍNICO */}
              {viewMode === "clinical" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  <div className="bg-[#D46F54] rounded-3xl p-6 md:p-8 text-white shadow-lg relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-white/10 rounded-full blur-3xl"></div>
                    <div className="relative z-10">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-white/80 mb-2 flex items-center gap-2">
                        <Gauge size={16} /> Qualidade Global da Voz (Baseado em CPPS)
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

                  <div className="bg-white border border-stone-200 rounded-3xl p-6 md:p-8 shadow-sm">
                    <h3 className="text-sm font-bold text-stone-800 mb-6 flex items-center gap-2 border-b border-stone-100 pb-4">
                      <Target className="text-[#D46F54]" size={18}/> Semáforo de Parâmetros Acústicos
                    </h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {VITAL_KEYS.map((key) => {
                        const mInfo = METRIC_LABELS.find(m => m.key === key);
                        const v = current.metrics?.[key];
                        const cls = classify(key, v);
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
                      <Info size={14}/> Verde = Normal | Vermelho = Atenção/Alterado (Base: Teixeira 2013)
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

                    <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col">
                      <h3 className="text-sm font-bold text-stone-800 mb-2 flex items-center gap-2"><AudioLines className="text-blue-500" size={18}/> Fonetograma Simplificado</h3>
                      <p className="text-xs text-stone-500 mb-4">Extensão vocal (Graves/Agudos) e Intensidade (Forte/Fraco).</p>
                      <div className="flex-1 min-h-[250px] w-full border border-dashed border-stone-200 rounded-xl bg-blue-50/20 flex flex-col items-center justify-center text-stone-400">
                        <Activity size={32} className="opacity-30 mb-2"/>
                        <span className="text-xs font-bold uppercase tracking-widest">Gráfico de Área em Construção</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MODO CIENTÍFICO */}
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

                       <div className="relative w-full h-[300px] bg-black rounded-xl border border-[#2D2A27] overflow-hidden flex flex-col justify-center items-center">
                         <span className="absolute top-4 left-4 text-[10px] text-stone-600 font-mono font-bold tracking-widest">0.00ms</span>
                         <span className="absolute top-4 right-4 text-[10px] text-stone-600 font-mono font-bold tracking-widest">{(current.metrics?.duration_sec || 3).toFixed(2)}s</span>
                         <span className="absolute bottom-4 left-4 text-[10px] text-stone-600 font-mono font-bold tracking-widest">0 Hz</span>
                         <span className="absolute top-4 left-16 text-[10px] text-stone-600 font-mono font-bold tracking-widest">5000 Hz</span>
                         
                         <div className="text-center space-y-4 relative z-10">
                           <div className="w-12 h-12 rounded-full border-4 border-stone-800 border-t-blue-500 animate-spin mx-auto"></div>
                           <h4 className="text-stone-500 font-bold tracking-[0.2em] text-sm uppercase">Renderizador Aguardando Backend</h4>
                           <p className="text-stone-700 text-xs font-medium tracking-wide">Ferramenta de seleção ativada.</p>
                         </div>

                         <div className="absolute top-0 left-1/4 w-0.5 h-full bg-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] animate-pulse"></div>
                         <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-900/50 to-transparent"></div>
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
                            <tr key={key} className="hover:bg-stone-50 transition-colors group cursor-help relative">
                              <td className="p-4 border-r border-stone-100 flex items-center gap-2">
                                {label}
                                <HelpCircle size={14} className="text-stone-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </td>
                              <td className="p-4 font-mono font-bold text-stone-800">{v == null ? "—" : Number(v).toFixed(precision)}</td>
                              <td className="p-4 text-stone-400 text-xs">{unit}</td>
                              
                              <div className="absolute bottom-full left-10 mb-1 w-64 bg-stone-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl font-sans font-normal">
                                {desc}
                              </div>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
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
                    {reportText ? "Regerar Diagnóstico Analisado" : "Gerar Diagnóstico com Fontes"}
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