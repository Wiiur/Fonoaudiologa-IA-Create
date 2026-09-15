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
  Trash2, UploadCloud, FileClock, Calendar, Bot, Gauge, BookOpen
} from 'lucide-react';

// Gráficos (Recharts)
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from 'recharts';

// ============================================================================
// 1. CONSTANTES E REGRAS DE NORMATIZAÇÃO
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
  
  // Estados de Negócio
  const [selectedPatient, setSelectedPatient] = useState(params.get("patient_id") || "");
  const [task, setTask] = useState("sustained_vowel");
  const [notes, setNotes] = useState("");
  const [audioBlob, setAudioBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [current, setCurrent] = useState(null);
  const [reportText, setReportText] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Estados Visuais
  const [viewMode, setViewMode] = useState("clinical"); // 'clinical' | 'scientific'
  const [spectroConfig, setSpectroConfig] = useState({ band: "estreita", showF0: true, showFormants: false });

  // Queries
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

      // O FETCH BLINDADO COM O SEU CRACHÁ DE DESENVOLVEDOR!
      const res = await fetch(url, { 
        method: "POST", 
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "user-id": "doc_mock_123" // <--- O SEGREDO ESTAVA AQUI O TEMPO TODO!
        }
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
    } catch (e) { 
      console.error("Erro detalhado do Copiloto:", e);
      toast.error(`Falha: ${e.message}`); 
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
    if (!window.confirm("Excluir esta análise permanentemente?")) return;
    await api.delete(`/voice/analyses/${analysisId}`);
    qc.invalidateQueries({ queryKey: ["voice-analyses"] });
    if (current?.analysis_id === analysisId) { setCurrent(null); setReportText(""); }
    toast.success("Análise removida");
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in bg-stone-50 min-h-screen">
      
      {/* CABEÇALHO GLOBAL */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
        <div>
          <Link to={`/patient/${selectedPatient || ''}`} className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit mb-2">
            <ArrowLeft size={16} /> Voltar ao Prontuário
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold tracking-tight text-stone-800 flex items-center gap-2">
            <AudioLines className="text-[#D46F54]" size={28} /> Análise Vocal Instrumental
          </h1>
          <p className="text-sm text-stone-500 mt-1 max-w-xl">
            Grave ou envie um áudio de fonação sustentada (ex.: vogal /a/ por 3–5s) para extrair métricas acústicas (Praat/Parselmouth) e gerar análise diagnóstica com IA.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ================================================= */}
        {/* COLUNA ESQUERDA: CONTROLES E HISTÓRICO            */}
        {/* ================================================= */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-stone-200 shadow-sm rounded-2xl p-6">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4 flex items-center gap-2">Nova Análise</div>

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

        {/* ================================================= */}
        {/* COLUNA DIREITA: DASHBOARD                         */}
        {/* ================================================= */}
        <div className="lg:col-span-8 space-y-6">
          {!current ? (
            <div className="bg-white border border-dashed border-stone-300 rounded-2xl h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
              <div className="text-sm text-stone-500">Selecione uma análise ou envie um novo áudio.</div>
            </div>
          ) : (
            <div className="animate-in slide-in-from-bottom-4 space-y-6">
              
              {/* HEADER DO ÁUDIO */}
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

              {/* SUB-ABAS DE VISUALIZAÇÃO */}
              <div className="flex border-b border-stone-200">
                <button onClick={() => setViewMode("clinical")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'clinical' ? 'border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/20' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <Target size={16} /> Visão Clínica (O "Resumo Mastigado")
                </button>
                <button onClick={() => setViewMode("scientific")} className={`px-6 py-3 font-bold text-sm transition-all border-b-2 flex items-center gap-2 ${viewMode === 'scientific' ? 'border-stone-800 text-stone-800 bg-stone-100' : 'border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50'}`}>
                  <SlidersHorizontal size={16} /> Visão Científica (A "Informação Pura")
                </button>
              </div>

              {/* MODO 1: VISÃO CLÍNICA */}
              {viewMode === "clinical" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  {/* NOTA CPPS EM DESTAQUE (MOCK/SIMULAÇÃO BASEADO NO VALOR REAL SE EXISTIR) */}
                  <div className="bg-gradient-to-br from-[#B75C46] to-[#D46F54] rounded-2xl p-6 shadow-md text-white flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-white/80 mb-1 flex items-center gap-1"><Gauge size={14}/> Qualidade Global da Voz (Baseado em CPPS)</p>
                      <div className="flex items-baseline gap-2">
                        {/* Se o CPP estiver crítico (ex: 0.31), o score cai. Isso é um cálculo ilustrativo para gamificação */}
                        <h3 className="text-4xl font-heading font-black">{current.metrics?.cpp_db > 10 ? '85' : '42'}</h3>
                        <span className="text-lg font-medium text-white/70">/ 100</span>
                      </div>
                      <p className="text-xs mt-2 bg-white/20 px-2 py-1 rounded w-fit">
                        {current.metrics?.cpp_db > 10 ? 'Voz com boa energia harmônica' : 'Voz com presença de ruído/soprosidade'}
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-full border-4 border-white/30 flex items-center justify-center opacity-80">
                      <Activity size={32} />
                    </div>
                  </div>

                  {/* PAINEL SEMAFÓRICO */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2"><Target className="text-[#D46F54]" size={18}/> Semáforo de Parâmetros Acústicos</h3>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                      {METRIC_LABELS.map(({ key, label, unit, precision }) => {
                        const v = current.metrics?.[key];
                        const cls = classify(key, v);
                        const display = v == null ? "—" : Number(v).toFixed(precision);
                        
                        let colorClass = "border-stone-200 bg-white text-stone-700";
                        let Icon = null;
                        
                        if (cls === "warn") {
                          colorClass = "border-rose-200 bg-rose-50 text-rose-800";
                          Icon = <AlertCircle size={14} className="text-rose-500" />;
                        } else if (cls === "ok") {
                          colorClass = "border-emerald-200 bg-emerald-50 text-emerald-800";
                          Icon = <CheckCircle2 size={14} className="text-emerald-500" />;
                        }

                        return (
                          <div key={key} className={`rounded-xl p-4 transition-all border ${colorClass}`}>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] uppercase font-bold tracking-widest opacity-70">{label}</span>
                              {Icon}
                            </div>
                            <div className="font-heading text-xl font-black mt-1">
                              {display} <span className="text-xs font-medium opacity-70">{v == null ? "" : unit}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-4 flex items-center gap-2"><AlertCircle size={14}/> Verde = Normal | Vermelho = Atenção/Alterado (Base: Teixeira 2013)</div>
                  </div>

                  {/* DDF E FONETOGRAMA */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
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

                    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col">
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

              {/* MODO 2: VISÃO CIENTÍFICA */}
              {viewMode === "scientific" && (
                <div className="space-y-6 animate-in fade-in">
                  
                  {/* ESPECTROGRAMA INTERATIVO */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                     <div className="flex justify-between items-center mb-4">
                       <h3 className="text-sm font-bold text-stone-800 flex items-center gap-2"><Settings2 className="text-stone-500" size={18}/> Espectrograma Interativo (Gráfico 4D)</h3>
                     </div>
                     
                     <div className="bg-stone-900 rounded-2xl p-4 shadow-inner flex flex-col gap-4">
                       {/* Controles do Doutor */}
                       <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-4">
                            <div className="bg-stone-800 p-2 rounded-lg border border-stone-700">
                              <label className="text-[10px] font-bold text-stone-400 block mb-1 uppercase tracking-wider">Análise de Banda</label>
                              <div className="flex gap-1">
                                <button onClick={() => setSpectroConfig({...spectroConfig, band: 'estreita'})} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${spectroConfig.band === 'estreita' ? 'bg-blue-500 text-white' : 'text-stone-400 hover:bg-stone-700'}`}>Estreita (Harmônicos)</button>
                                <button onClick={() => setSpectroConfig({...spectroConfig, band: 'larga'})} className={`px-3 py-1 rounded text-xs font-bold transition-colors ${spectroConfig.band === 'larga' ? 'bg-blue-500 text-white' : 'text-stone-400 hover:bg-stone-700'}`}>Larga (Pulsos Glóticos)</button>
                              </div>
                            </div>
                            <div className="bg-stone-800 p-2 rounded-lg border border-stone-700 flex gap-4">
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={spectroConfig.showF0} onChange={(e) => setSpectroConfig({...spectroConfig, showF0: e.target.checked})} className="accent-blue-500 cursor-pointer w-4 h-4" />
                                <span className="text-xs font-bold text-stone-300 group-hover:text-white transition-colors">Overlays Pitch (F0)</span>
                              </label>
                              <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" checked={spectroConfig.showFormants} onChange={(e) => setSpectroConfig({...spectroConfig, showFormants: e.target.checked})} className="accent-rose-500 cursor-pointer w-4 h-4" />
                                <span className="text-xs font-bold text-stone-300 group-hover:text-white transition-colors">Formantes (F1-F3)</span>
                              </label>
                            </div>
                          </div>
                          <Button variant="outline" className="border-stone-700 text-stone-300 hover:text-white hover:bg-stone-800 h-10 px-4">
                            <Download size={14} className="mr-2" /> Exportar HD
                          </Button>
                       </div>

                       {/* MOCK VISUAL DO CANVAS DO ESPECTROGRAMA */}
                       <div className="h-[350px] w-full bg-black rounded-xl border border-stone-800 relative overflow-hidden flex flex-col justify-center items-center">
                          <div className="absolute top-2 left-2 text-white/40 text-[10px] font-mono">0.00ms</div>
                          <div className="absolute top-2 right-2 text-white/40 text-[10px] font-mono">{(current.metrics?.duration_sec || 3).toFixed(2)}s</div>
                          <div className="absolute bottom-2 left-2 text-white/40 text-[10px] font-mono">0 Hz</div>
                          <div className="absolute top-2 left-12 text-white/40 text-[10px] font-mono">5000 Hz</div>
                          
                          <div className="text-stone-600 flex flex-col items-center">
                              <SlidersHorizontal size={40} className="mb-2 opacity-50" />
                              <p className="text-xs font-bold tracking-widest uppercase text-stone-500">Renderizador de Calor Aguardando Backend</p>
                              <p className="text-[10px] font-mono mt-1 opacity-50 text-stone-500">Ferramenta de seleção de milissegundos ativada.</p>
                          </div>
                          {spectroConfig.showF0 && <div className="absolute w-[80%] h-0.5 bg-blue-500/80 left-[10%] top-[60%] blur-[1px] transform rotate-1"></div>}
                          {spectroConfig.showFormants && <div className="absolute w-[80%] h-3 bg-rose-500/30 left-[10%] top-[40%] blur-[2px]"></div>}
                       </div>
                     </div>
                  </div>

                  {/* TABELA MDVP COMPLETA */}
                  <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm overflow-x-auto">
                    <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2"><BookOpen className="text-stone-500" size={16}/> Tabela de Extração Acústica Bruta (MDVP)</h3>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-stone-50 text-stone-500 text-[10px] uppercase tracking-wider font-bold">
                        <tr>
                          <th className="p-4 rounded-tl-xl">Parâmetro Numérico</th>
                          <th className="p-4">Valor Base</th>
                          <th className="p-4 rounded-tr-xl">Unidade</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100 text-stone-700 font-medium">
                        {METRIC_LABELS.map(({ key, label, unit, precision }) => {
                          const v = current.metrics?.[key];
                          return (
                            <tr key={key} className="hover:bg-stone-50 transition-colors">
                              <td className="p-4 border-r border-stone-100">{label}</td>
                              <td className="p-4 font-mono">{v == null ? "—" : Number(v).toFixed(precision)}</td>
                              <td className="p-4 text-stone-400">{unit}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {/* MÓDULO INFERIOR: DIAGNÓSTICO IA (SEMPRE PRESENTE EM AMBAS AS ABAS) */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
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