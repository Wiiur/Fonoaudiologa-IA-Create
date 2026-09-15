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
import { Filter, Music, Mic2, User, Activity, Info, PlayCircle } from 'lucide-react';

// ==========================================
// BIBLIOTECA RICA DE DESAFIOS (SISTEMA ESPECIALISTA COMPLETO)
// ==========================================
// ==========================================
// BIBLIOTECA RICA DE DESAFIOS (SISTEMA ESPECIALISTA COMPLETO)
// ==========================================
const BIBLIOTECA_DESAFIOS = [
  {
    id: "vogal_a_prolongada", title: "Vogal Prolongada (A)", categoria: "Fala", faixa_etaria: ["Adulto", "Idoso", "Infantil"], target_duration_sec: 15,
    instruction: "Inspire fundo e diga 'Ahhh' pelo maior tempo que conseguir, mantendo o volume e o tom constantes.",
    target: "Avaliar a capacidade respiratória e estabilidade vocal (TMF).", dica_clinica: "Excelente para medir a eficiência glótica basal.",
    biofeedback: "volume" // <--- CONTROLE ADICIONADO
  },
  {
    id: "relacao_s_z", title: "Relação S/Z", categoria: "Fala", faixa_etaria: ["Adulto", "Infantil"], target_duration_sec: 20,
    instruction: "Sustente o som de 'S' o máximo que puder. Respire, e depois faça o mesmo com o som de 'Z'.",
    target: "Comparar o tempo de fricativa surda (S) com a sonora (Z).", dica_clinica: "Valores onde 'Z' é muito menor que 'S' indicam possível fenda glótica.",
    biofeedback: "volume"
  },
  {
    id: "metodo_lsvt_loud", title: "Vogal em Alta Intensidade", categoria: "Fala", faixa_etaria: ["Idoso"], target_duration_sec: 10,
    instruction: "Diga 'Ahhhh' com a voz BEM FORTE e ALTA, mas sem gritar arranhando a garganta. Projete o som!",
    target: "Aumentar a pressão subglótica e o fechamento das pregas vocais.", dica_clinica: "Fundamental para pacientes com Parkinson.",
    biofeedback: "volume"
  },
  {
    id: "terapia_lax_vox", title: "Terapia na Água (Lax Vox)", categoria: "Cotidiano", faixa_etaria: ["Adulto", "Idoso"], target_duration_sec: 20,
    instruction: "Sopre ar por um canudo em uma garrafa com água, produzindo som de 'U' contínuo.",
    target: "Reduzir esforço fonatório e massagear pregas vocais.", dica_clinica: "Prescreva para professores com fadiga vocal aguda.",
    biofeedback: "volume"
  },
  {
    id: "fonacao_reversa", title: "Fonação Inspiratória", categoria: "Cotidiano", faixa_etaria: ["Adulto"], target_duration_sec: 10,
    instruction: "Produza o som da vogal 'I' enquanto puxa o ar para DENTRO (inspirando), suavemente.",
    target: "Afastamento das falsas cordas vocais e relaxamento.", dica_clinica: "Desfaz quadros de disfonia por tensão muscular severa.",
    biofeedback: "volume"
  },
  {
    id: "boca_chiusa", title: "Ressonância (Boca Chiusa)", categoria: "Cotidiano", faixa_etaria: ["Adulto", "Infantil"], target_duration_sec: 15,
    instruction: "De boca fechada, faça o som de 'Hummmm' sentindo a vibração nos lábios e no nariz.",
    target: "Transferir a ressonância da garganta para a máscara facial.", dica_clinica: "Limpa a voz rouca e reduz o esforço laringeo.",
    biofeedback: "volume"
  },
  {
    id: "trinado_labios", title: "Trinado de Lábios (Vibração)", categoria: "Canto", faixa_etaria: ["Adulto", "Infantil"], target_duration_sec: 20,
    instruction: "Faça os lábios vibrarem continuamente ('Brrrrrr') enquanto solta o ar.",
    target: "Equilibrar a pressão aerodinâmica e o controle laringeo.", dica_clinica: "O exercício de aquecimento vocal mais famoso do mundo.",
    biofeedback: "volume" // Trinado foca em manter fluxo de ar constante
  },
  {
    id: "glissando_sirene", title: "Glissando (Sirene)", categoria: "Canto", faixa_etaria: ["Adulto", "Infantil"], target_duration_sec: 10,
    instruction: "Faça o som de uma sirene usando a vogal 'U', deslizando do grave ao agudo e voltando sem quebrar.",
    target: "Testar flexibilidade, alongamento e encurtamento das pregas vocais.", dica_clinica: "Ideal para identificar quebras de registro.",
    biofeedback: "pitch" // <--- AQUI SIM O AVIÃO FAZ SENTIDO!
  },
  {
    id: "messa_di_voce", title: "Messa di Voce (Dinâmica)", categoria: "Canto", faixa_etaria: ["Adulto"], target_duration_sec: 15,
    instruction: "Inicie uma nota baixinho (pianissimo), aumente o volume ao máximo (fortissimo) e diminua novamente.",
    target: "Controle refinado da pressão de ar sem mudar a nota.", dica_clinica: "Avalia o domínio técnico absoluto do cantor.",
    biofeedback: "volume"
  },
  {
    id: "leitura_sobrearticulada", title: "Leitura Sobrearticulada", categoria: "Dublagem", faixa_etaria: ["Adulto", "Infantil"], target_duration_sec: 30,
    instruction: "Leia o texto abaixo de forma lenta, abrindo BEM a boca em cada vogal e exagerando a movimentação da língua nas consoantes.",
    target: "Melhorar a precisão articulatória e a clareza da dicção.", dica_clinica: "Perfeito para atores e pacientes com disartria leve.",
    biofeedback: "volume",
    texto_pratica: "O papagaio tagarela pulou no poço profundo, batendo o bico na beirada do balde. Trinta tigres tristes tentaram triturar três pratos de trigo trancados no quiosque."
  },
  {
    id: "fricativas_marcadas", title: "Staccato de Fricativas", categoria: "Dublagem", faixa_etaria: ["Adulto"], target_duration_sec: 15,
    instruction: "Produza os sons abaixo de forma muito curta, seca e forte, como se fossem pequenas explosões de ar.",
    target: "Apoio respiratório (appoggio) e clareza consonantal.", dica_clinica: "Essencial para dubladores projetarem sussurros.",
    biofeedback: "volume",
    texto_pratica: "F! F! F! — S! S! S! — X! X! X! (Repita 3 vezes com muita força no abdômen)"
  },
  {
    id: "voo_do_aviao", title: "O Voo do Aviãozinho", categoria: "Fala", faixa_etaria: ["Infantil"], target_duration_sec: 12,
    instruction: "Imite o som do avião lendo a frase abaixo. A voz precisa subir e descer de acordo com a história!",
    target: "Treinar modulação de frequência (pitch) de forma lúdica.", dica_clinica: "Ótimo para autistas ou crianças com fala monótona.",
    biofeedback: "pitch",
    texto_pratica: "Vuuuuuu... O avião subiu lá na nuvem! Vuuuuuu... O avião desceu na pista!"
  }
];

// ==========================================
// MOTOR DE BIOFEEDBACK VISUAL (GAMIFICAÇÃO)
// ==========================================
function BiofeedbackVisual({ active, mode = "volume" }) {
  const canvasRef = useRef(null);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const animationRef = useRef(null);

  // Estados apenas para a UI interativa
  const [intensity, setIntensity] = useState(0); // 0 a 100
  const [pitchLevel, setPitchLevel] = useState(50); // 0 (Grave) a 100 (Agudo)

  useEffect(() => {
    if (!active) {
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
      cancelAnimationFrame(animationRef.current);
      setIntensity(0);
      setPitchLevel(50);
      return;
    }

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioContext();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        
        analyserRef.current.fftSize = 1024;
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const analyze = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let highestBin = 0;
          let maxVal = 0;

          // 1. CALIBRAGEM DA VOZ HUMANA
          for (let i = 2; i < 30; i++) {
            if (dataArray[i] > maxVal) {
              maxVal = dataArray[i];
              highestBin = i;
            }
          }
          
          // 2. CÁLCULO DE VOLUME GERAL (Amortecido via JS)
          let totalSum = 0;
          for (let i = 0; i < bufferLength; i++) totalSum += dataArray[i];
          const average = totalSum / bufferLength;
          const volumePctTarget = Math.min(100, (average / 40) * 100);
          
          // Correção do Bug da Barra Travada: Se tiver silêncio, força a descer.
          setIntensity(prev => {
             if (volumePctTarget < 2) return Math.max(0, prev - 3); // Cai rápido no silêncio
             return prev + ((volumePctTarget - prev) * 0.15);
          });

          // 3. MOVIMENTO DO AVIÃO (Pitch)
          if (volumePctTarget > 10) { 
             const pitchPctTarget = Math.min(100, Math.max(0, ((highestBin - 2) / 10) * 100));
             setPitchLevel(prev => prev + ((pitchPctTarget - prev) * 0.05));
          } else {
             setPitchLevel(prev => Math.max(0, prev - 0.8));
          }

          animationRef.current = requestAnimationFrame(analyze);
        };
        
        analyze();
      } catch (err) {
        console.error("Erro ao iniciar microfone", err);
      }
    };

    startAudio();

    return () => {
      if (audioCtxRef.current?.state !== 'closed') audioCtxRef.current?.close();
      cancelAnimationFrame(animationRef.current);
    };
  }, [active]);

  if (mode === "volume") {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 relative overflow-hidden flex flex-col items-center">
        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">Mantenha na Zona Verde!</h4>
        <div className="w-full h-8 bg-stone-200 rounded-full overflow-hidden relative shadow-inner">
          <div className="absolute left-[30%] right-[30%] top-0 bottom-0 bg-emerald-400/20 border-l-2 border-r-2 border-emerald-500/50 z-0"></div>
          {/* O SEGREDO ESTÁ AQUI: Removemos o duration-300 para o JS assumir o controle total */}
          <div 
            className={`h-full z-10 relative ${intensity > 70 ? 'bg-rose-500' : intensity > 30 ? 'bg-emerald-500' : 'bg-amber-400'}`}
            style={{ width: `${intensity}%` }}
          />
        </div>
        <p className="text-[10px] text-stone-400 font-bold mt-3">FORÇA DA VOZ (INTENSIDADE)</p>
      </div>
    );
  }

  // Modo Pitch (Agudo/Grave)
  return (
    <div className="bg-sky-50 border border-sky-100 rounded-2xl p-6 relative flex items-center min-h-[250px] pl-16 overflow-hidden">
       <div className="absolute top-4 left-4 text-[10px] font-bold text-sky-500 uppercase tracking-widest">
         Grave ↔ Agudo
       </div>
       <div className="relative w-full h-48 border-l-2 border-dashed border-sky-300 ml-4">
          {/* Aqui também removemos a transição lenta do CSS */}
          <div 
            className="absolute w-12 h-12 bg-white rounded-full shadow-md border-2 border-sky-400 flex items-center justify-center text-2xl z-10"
            style={{ 
              left: '-25px', 
              bottom: `${pitchLevel}%`,
              transform: `translateY(50%) scale(${intensity > 15 ? 1.1 : 1})` 
            }}
          >
            {pitchLevel > 60 ? '🚀' : pitchLevel < 40 ? '🐢' : '✈️'}
          </div>
       </div>
    </div>
  );
}

const GRADE_STYLES = {
  ok: "border-emerald-400 bg-emerald-50 text-emerald-900",
  warn: "border-amber-400 bg-amber-50 text-amber-900",
  alert: "border-red-400 bg-red-50 text-red-900",
  info: "border-stone-300 bg-stone-50 text-stone-700",
};

function TaskMetricPill({ label, value, unit }) {
  return (
    <div className="border border-stone-200 rounded-md p-2 bg-white shadow-sm">
      <div className="text-[10px] uppercase tracking-widest text-stone-500">{label}</div>
      <div className="font-heading text-base font-bold text-stone-800 mt-0.5">
        {value ?? "—"}{value != null && unit ? <span className="text-xs text-stone-400 ml-1">{unit}</span> : null}
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
          <Button onClick={start} data-testid="chal-rec-start" className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm">
            <i className="fa-solid fa-microphone mr-2"></i> Iniciar Gravação
          </Button>
        )}
        {recording && (
          <Button onClick={stop} variant="destructive" data-testid="chal-rec-stop" className="animate-pulse rounded-xl font-bold shadow-sm">
            <i className="fa-solid fa-stop mr-2"></i> Parar ({elapsed}s)
          </Button>
        )}
        {blob && !recording && (
          <>
            <audio src={audioURL} controls className="max-w-xs h-10" data-testid="chal-playback" />
            <Button variant="outline" onClick={reset} data-testid="chal-reset" className="rounded-xl border-stone-300">
              <i className="fa-solid fa-rotate-left mr-2"></i> Refazer
            </Button>
          </>
        )}
      </div>
      {recording && targetDuration && (
        <div className="w-full mt-4">
          <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-[11px] text-stone-500 mt-1 font-bold">Meta: {targetDuration} segundos</div>
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
  
  // ESTADOS DOS NOVOS FILTROS
  const [filtroIdade, setFiltroIdade] = useState('Todos');
  const [filtroCategoria, setFiltroCategoria] = useState('Todas');

  const [blob, setBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });
  const { data: attempts = [] } = useQuery({
    queryKey: ["challenge-attempts", selectedPatient],
    queryFn: async () => (await api.get(`/voice/challenges/attempts${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data,
  });

  // Função para baixar arquivos usando a segurança do Axios
  const downloadAudio = async (format) => {
    try {
      // O seu 'api' já manda os cabeçalhos de segurança (usuário logado)
      const response = await api.get(`/voice/challenges/audio/${lastResult.attempt_id}/download?format=${format}`, {
        responseType: 'blob' // ISSO É A MÁGICA: Avisa que vai chegar um arquivo, não um texto!
      });
      
      // Cria um link invisível na memória do navegador e clica nele automaticamente
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // Formata um nome bonito para o arquivo
      const safeTitle = lastResult.challenge_title ? lastResult.challenge_title.replace(/\s+/g, '_') : 'Desafio';
      link.setAttribute('download', `${safeTitle}.${format}`);
      
      document.body.appendChild(link);
      link.click();
      link.remove(); // Limpa a memória
    } catch (error) {
      console.error("Erro completo:", error);
      
      // Se o erro veio do servidor disfarçado de arquivo Blob, nós lemos ele!
      if (error.response && error.response.data) {
         try {
           const textErro = await error.response.data.text();
           const jsonErro = JSON.parse(textErro);
           alert(`O servidor recusou o download:\n\n${jsonErro.detail}`);
         } catch(e) {
           alert("Erro desconhecido ao baixar o áudio.");
         }
      } else {
         alert("Erro de conexão ao baixar o arquivo.");
      }
    }
  };

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
      fd.append("challenge_title", selectedChallenge.title); // O Backend vai receber o título do desafio
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

  // LÓGICA DE FILTRAGEM DOS DESAFIOS
  const desafiosFiltrados = BIBLIOTECA_DESAFIOS.filter(desafio => {
    const bateIdade = filtroIdade === 'Todos' || desafio.faixa_etaria.includes(filtroIdade);
    const bateCat = filtroCategoria === 'Todas' || desafio.categoria === filtroCategoria;
    return bateIdade && bateCat;
  });

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* CABEÇALHO DA PÁGINA */}
      <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1 flex items-center gap-2">
            <Mic2 size={14} className="text-[#D46F54]"/> Laboratório Vocal
          </div>
          <h1 className="font-heading text-3xl font-bold text-stone-800">Prescrição e Análise</h1>
          <p className="text-sm text-stone-500 mt-2 max-w-xl">
            Filtre desafios específicos, grave a execução do paciente e receba a análise acústica da inteligência artificial na hora.
          </p>
        </div>
        
        <div className="min-w-[280px] bg-stone-50 p-4 rounded-xl border border-stone-100">
          <label className="text-xs font-bold text-stone-600 block mb-2 uppercase tracking-wider">Selecione o Paciente</label>
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger className="bg-white border-stone-200 h-11 shadow-sm"><SelectValue placeholder="Buscar paciente..." /></SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.patient_id} value={p.patient_id} className="font-medium">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* PAINEL DE EXECUÇÃO (Abre quando um desafio é clicado) */}
      {selectedChallenge && (
        <div className="bg-stone-900 text-white border border-stone-800 rounded-2xl p-6 mb-8 shadow-xl animate-in slide-in-from-top-4">
          <div className="flex items-start justify-between mb-6 border-b border-stone-800 pb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1 flex items-center gap-2">
                <PlayCircle size={14}/> Sala de Execução Ativa
              </div>
              <div className="font-heading text-2xl font-bold">{selectedChallenge.title}</div>
            </div>
            <button onClick={() => { setSelectedChallenge(null); setBlob(null); }} className="text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="bg-stone-800/50 border border-stone-700/50 rounded-xl p-5">
                <div className="text-xs uppercase tracking-widest text-stone-400 font-bold mb-2">Instrução ao paciente</div>
                <div className="text-lg font-medium leading-relaxed">{selectedChallenge.instruction}</div>
              </div>
              
              {selectedChallenge.texto_pratica && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 shadow-inner">
                  <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-3 flex items-center gap-2">
                    <i className="fa-solid fa-quote-left"></i> Leia em voz alta
                  </div>
                  <div className="text-2xl font-serif italic text-amber-50 leading-relaxed font-medium">
                    "{selectedChallenge.texto_pratica}"
                  </div>
                </div>
              )}
              {/* VISUALIZADOR MÁGICO */}
              <BiofeedbackVisual 
                 active={!blob} 
                 mode={selectedChallenge.biofeedback} 
              />
            </div>

            <div className="flex flex-col justify-end space-y-6">
              
              <div className="bg-stone-800/80 p-5 rounded-xl border border-stone-700">
                <ChallengeRecorder onReady={setBlob} targetDuration={selectedChallenge.target_duration_sec} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                 <div>
                   <label className="text-xs font-bold text-stone-400 block mb-2 uppercase">Ou envie um arquivo</label>
                   <Input type="file" accept="audio/*,.wav,.mp3,.webm,.ogg" onChange={(e) => setFile(e.target.files?.[0] || null)} className="bg-stone-800 border-stone-700 text-stone-300" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-stone-400 block mb-2 uppercase">Notas (Opcional)</label>
                   <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: Voz soprosa..." className="bg-stone-800 border-stone-700 text-stone-300" />
                 </div>
              </div>

              <Button onClick={submit} disabled={busy || (!blob && !file) || !selectedPatient} className="w-full h-14 text-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg">
                {busy ? "Analisando com Inteligência Artificial…" : (<><i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Analisar Execução</>)}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ÁREA DE RESULTADO (Aparece após a análise ou ao clicar no histórico) */}
      {lastResult && (
        <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-8 shadow-sm animate-in zoom-in-95">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4 flex items-center gap-2">
            <Activity size={14} className="text-[#D46F54]"/> Laudo da Análise
          </div>
          
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 w-full">
              <div className="flex items-start gap-4 flex-1">
                <i className={`fa-solid ${gradeIcon(lastResult.evaluation?.grade)} text-4xl mt-1 opacity-80`}></i>
                <div>
                  <div className="font-heading text-xl font-bold">{lastResult.challenge_title}</div>
                  <div className="text-sm mt-2 font-medium opacity-90 leading-relaxed text-stone-700">{lastResult.evaluation?.message}</div>
                </div>
              </div>
              
              {/* ÁREA DO PLAYER E BOTÕES DE DOWNLOAD */}
              <div className="flex flex-col items-end gap-3 shrink-0">
                <audio src={`${API}/voice/challenges/audio/${lastResult.attempt_id}`} controls className="max-w-[240px] h-10 rounded-lg shadow-sm" />
                
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-stone-400 uppercase tracking-widest mr-1">Baixar:</span>
                  
                  <button 
                    onClick={() => downloadAudio('wav')}
                    className="flex items-center justify-center bg-stone-100 hover:bg-[#D46F54] hover:text-white text-stone-600 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-all border border-stone-200 hover:border-[#D46F54] shadow-sm cursor-pointer"
                    title="Qualidade Máxima para o Praat"
                  >
                    .WAV (Praat)
                  </button>
                  
                  <button 
                    onClick={() => downloadAudio('mp3')}
                    className="flex items-center justify-center bg-stone-100 hover:bg-[#D46F54] hover:text-white text-stone-600 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-all border border-stone-200 hover:border-[#D46F54] shadow-sm cursor-pointer"
                    title="Leve para enviar no WhatsApp"
                  >
                    .MP3 (Paciente)
                  </button>
                  
                  <button 
                    onClick={() => downloadAudio('ogg')}
                    className="flex items-center justify-center bg-stone-100 hover:bg-[#D46F54] hover:text-white text-stone-600 text-[10px] font-bold px-2.5 py-1.5 rounded-md transition-all border border-stone-200 hover:border-[#D46F54] shadow-sm cursor-pointer"
                  >
                    .OGG
                  </button>
                </div>
              </div>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {lastResult.task_metrics && Object.keys(lastResult.task_metrics).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-3">Métricas da Execução</div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(lastResult.task_metrics).map(([k, v]) => (
                    <TaskMetricPill key={k} label={humanizeKey(k)} value={v} />
                  ))}
                </div>
              </div>
            )}

            {lastResult.metrics && Object.keys(lastResult.metrics).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-3">Acústica Vocal</div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(lastResult.metrics).map(([k, v]) => (
                    <TaskMetricPill key={k} label={humanizeKey(k)} value={v} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* COLUNA ESQUERDA: BIBLIOTECA E FILTROS (Ocupa 2/3) */}
        <div className="xl:col-span-2">
          
          {/* Barra de Filtros */}
          <div className="bg-stone-50 p-2 rounded-xl border border-stone-200 mb-6 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex bg-white rounded-lg p-1 border border-stone-200">
              <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase flex items-center">Idade:</div>
              {['Todos', 'Infantil', 'Adulto', 'Idoso'].map(idade => (
                <button key={idade} onClick={() => setFiltroIdade(idade)} className={`flex-1 text-xs font-bold py-1.5 rounded-md transition-all ${filtroIdade === idade ? 'bg-stone-800 text-white shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                  {idade}
                </button>
              ))}
            </div>

            <div className="flex-1 flex bg-white rounded-lg p-1 border border-stone-200 overflow-x-auto">
              <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase flex items-center">Foco:</div>
              {['Todas', 'Cotidiano', 'Canto', 'Dublagem', 'Fala'].map(cat => (
                <button key={cat} onClick={() => setFiltroCategoria(cat)} className={`px-3 text-xs font-bold py-1.5 rounded-md transition-all whitespace-nowrap ${filtroCategoria === cat ? 'bg-[#D46F54] text-white shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grade de Desafios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {desafiosFiltrados.map(desafio => (
              <div key={desafio.id} className="bg-white border border-stone-200 rounded-2xl p-5 hover:border-[#D46F54]/50 transition-colors shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`p-1.5 rounded-lg ${desafio.categoria === 'Canto' ? 'bg-rose-100 text-rose-600' : (desafio.categoria === 'Dublagem' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600')}`}>
                      {desafio.categoria === 'Canto' && <Music size={16}/>}
                      {desafio.categoria === 'Dublagem' && <Mic2 size={16}/>}
                      {desafio.categoria === 'Cotidiano' && <Activity size={16}/>}
                      {desafio.categoria === 'Fala' && <User size={16}/>}
                    </div>
                    <h4 className="font-heading font-bold text-base text-stone-800 leading-tight">{desafio.title}</h4>
                  </div>
                  <p className="text-xs text-stone-600 line-clamp-2 mb-4">{desafio.instruction}</p>
                </div>

                <div>
                  <div className="bg-[#F3E7E4]/40 border border-[#D46F54]/10 rounded-xl p-3 flex gap-2 items-start mb-4">
                    <Info size={14} className="text-[#D46F54] shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium text-stone-700 leading-snug">
                      <span className="font-bold text-[#B75C46]">Dica Clínica:</span> {desafio.dica_clinica}
                    </p>
                  </div>
                  <Button onClick={() => { setSelectedChallenge(desafio); setLastResult(null); setBlob(null); setFile(null); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full bg-stone-900 hover:bg-black text-white font-bold rounded-xl shadow-sm">
                    Selecionar Desafio
                  </Button>
                </div>
              </div>
            ))}
            {desafiosFiltrados.length === 0 && (
              <div className="col-span-1 sm:col-span-2 text-center py-12 border-2 border-dashed border-stone-200 rounded-2xl">
                <Filter className="mx-auto text-stone-300 mb-3" size={32}/>
                <p className="text-sm font-bold text-stone-400">Nenhum desafio encontrado para estes filtros.</p>
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO DE TENTATIVAS (Ocupa 1/3) */}
        <div className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm h-fit max-h-[800px] flex flex-col">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Histórico do Paciente</div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
            {!selectedPatient ? (
              <div className="text-xs font-bold text-stone-400 text-center py-10 bg-stone-50 rounded-xl border border-stone-100">Selecione um paciente para ver o histórico.</div>
            ) : attempts.length === 0 ? (
              <div className="text-xs font-bold text-stone-400 text-center py-10 bg-stone-50 rounded-xl border border-stone-100">Nenhuma gravação registrada ainda.</div>
            ) : (
              attempts.map((a) => (
                <div
                  key={a.attempt_id}
                  onClick={() => { setLastResult(a); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className={`p-4 border rounded-xl cursor-pointer transition-all ${lastResult?.attempt_id === a.attempt_id ? "border-[#D46F54] bg-[#F3E7E4]/30 shadow-sm" : "border-stone-100 bg-stone-50 hover:border-stone-300"}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className={`fa-solid ${gradeIcon(a.evaluation?.grade)} ${
                        a.evaluation?.grade === "ok" ? "text-emerald-500" :
                        a.evaluation?.grade === "warn" ? "text-amber-500" :
                        a.evaluation?.grade === "alert" ? "text-red-500" : "text-stone-400"
                      }`}></i>
                      <div className="font-bold text-sm text-stone-800 truncate">{a.challenge_title}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); del(a.attempt_id); }} className="text-stone-300 hover:text-red-500 transition-colors ml-2">
                      <i className="fa-solid fa-trash text-xs"></i>
                    </button>
                  </div>
                  <div className="text-[10px] font-bold text-stone-500 mb-1">{new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: 'short', timeStyle: 'short' })}</div>
                  {a.evaluation?.message && <div className="text-[11px] text-stone-600 line-clamp-2 leading-tight bg-white p-2 rounded-lg border border-stone-100">{a.evaluation.message}</div>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}