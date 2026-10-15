import React, { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Filter, Music, Mic2, User, Activity, Info, PlayCircle, Mic, Square,
  RotateCcw, Sparkles, CheckCircle2, AlertTriangle, AlertCircle, Trash2,
  X, Quote, Volume2, TrendingUp, Timer, Award, Eye
} from "lucide-react";

// ============================================================================
// 1. CATÁLOGO CLÍNICO COM MODOS VISUAIS GUIADOS PARA O PACIENTE
// ============================================================================
const BIBLIOTECA_DESAFIOS = [
  {
    id: "vogal_a_prolongada",
    title: "Vogal Prolongada (/a/)",
    categoria: "Fala",
    faixa_etaria: ["Adulto", "Idoso", "Infantil"],
    target_duration_sec: 15,
    instruction: "Inspire fundo e diga 'Ahhhh' mantendo a bolinha dentro da faixa verde pelo maior tempo possível, sem deixar a voz tremer ou cair.",
    target: "Avaliar Tempo Máximo de Fonação (TMF) e estabilidade glótica.",
    dica_clinica: "Excelente para medir a eficiência glótica basal e coordenação pneumofonoarticulatória.",
    visual_mode: "sustain",
    target_zone: [35, 75]
  },
  {
    id: "relacao_s_z",
    title: "Relação S / Z (Guia em 2 Etapas)",
    categoria: "Fala",
    faixa_etaria: ["Adulto", "Infantil"],
    target_duration_sec: 20,
    instruction: "Siga o painel: na Etapa 1 faça 'Sssss' (só ar). Depois respire fundo e na Etapa 2 faça 'Zzzzz' (com som na garganta).",
    target: "Comparar sustentação aerodinâmica surda (/s/) vs sonora (/z/).",
    dica_clinica: "Quando o tempo de 'Z' é muito menor que 'S' (S/Z > 1.2), sugere fenda glótica ou hipercontração.",
    visual_mode: "sz_ratio",
    target_zone: [30, 80]
  },
  {
    id: "metodo_lsvt_loud",
    title: "Projeção Máxima (LSVT Loud)",
    categoria: "Fala",
    faixa_etaria: ["Idoso", "Adulto"],
    target_duration_sec: 10,
    instruction: "Diga 'Ahhhh' com voz firme e projetada até atingir a Meta de Potência Azul no topo do medidor, sem gritar ou arranhar a garganta!",
    target: "Aumentar pressão subglótica e coaptação das pregas vocais.",
    dica_clinica: "Padrão ouro para hipofonia (ex: Doença de Parkinson e presbifonia).",
    visual_mode: "power_target",
    target_zone: [65, 95]
  },
  {
    id: "terapia_lax_vox",
    title: "Terapia no Tubo (Lax Vox / ETVSO)",
    categoria: "Cotidiano",
    faixa_etaria: ["Adulto", "Idoso"],
    target_duration_sec: 20,
    instruction: "Sopre pelo canudo fazendo o som contínuo de 'Uuuu'. Mantenha o fluxo de bolhas constante na faixa verde!",
    target: "Reduzir esforço fonatório e ampliar impedância do trato vocal.",
    dica_clinica: "Ideal para professores e profissionais da voz com fadiga ou tensão laringofaríngea.",
    visual_mode: "sustain",
    target_zone: [30, 70]
  },
  {
    id: "fonacao_reversa",
    title: "Fonação Inspiratória Suave",
    categoria: "Cotidiano",
    faixa_etaria: ["Adulto"],
    target_duration_sec: 8,
    instruction: "Emita um 'Iiiii' suave enquanto puxa o ar para dentro (inspirando). O gráfico deve ficar na zona calma e estável.",
    target: "Afastamento das pregas vestibulares e relaxamento laríngeo.",
    dica_clinica: "Auxilia na desativação de compressão supraglótica severa.",
    visual_mode: "sustain",
    target_zone: [25, 65]
  },
  {
    id: "boca_chiusa",
    title: "Ressonância Facial (Boca Chiusa)",
    categoria: "Cotidiano",
    faixa_etaria: ["Adulto", "Infantil"],
    target_duration_sec: 15,
    instruction: "De lábios unidos sem apertar, faça 'Hummmm' sentindo os lábios vibrarem. Mantenha a linha estável no túnel verde!",
    target: "Anteriorizar a ressonância para a máscara facial.",
    dica_clinica: "Diminui o impacto colisional nas pregas vocais e melhora a projeção.",
    visual_mode: "sustain",
    target_zone: [30, 70]
  },
  {
    id: "trinado_labios",
    title: "Vibração de Lábios / Língua (Brrr)",
    categoria: "Canto",
    faixa_etaria: ["Adulto", "Infantil"],
    target_duration_sec: 15,
    instruction: "Faça os lábios vibrarem ('Brrrrr') sem deixar o motorzinho falhar! Acompanhe sua estabilidade no gráfico.",
    target: "Mobilizar a onda mucosa e equilibrar o fluxo transglótico.",
    dica_clinica: "Exercício chave para aquecimento vocal e suavização de ataque vocal brusco.",
    visual_mode: "sustain",
    target_zone: [35, 75]
  },
  {
    id: "glissando_sirene",
    title: "Glissando Guiado (Sirene Vocal)",
    categoria: "Canto",
    faixa_etaria: ["Adulto", "Infantil"],
    target_duration_sec: 10,
    instruction: "Com o som de 'Uuuu', faça sua bolinha seguir o desenho da Montanha na tela: comece grave, suba até o agudo e desça suavemente!",
    target: "Avaliar extensão fonatória e passagem de registros sem quebras.",
    dica_clinica: "Ação coordenada dos músculos cricotireóideo (CT) e tireoaritenóideo (TA).",
    visual_mode: "glissando"
  },
  {
    id: "messa_di_voce",
    title: "Messa di Voce (Diamante de Dinâmica)",
    categoria: "Canto",
    faixa_etaria: ["Adulto"],
    target_duration_sec: 14,
    instruction: "Siga o formato do Diamante: comece bem baixinho, cresça o volume no meio e volte a diminuir no final sem mudar a nota!",
    target: "Controle fino de intensidade mantendo a frequência fundamental estável.",
    dica_clinica: "Avalia o equilíbrio pneumofônico avançado em cantores e atores.",
    visual_mode: "dynamics"
  },
  {
    id: "leitura_sobrearticulada",
    title: "Leitura Sobrearticulada Guiada",
    categoria: "Dublagem",
    faixa_etaria: ["Adulto", "Infantil"],
    target_duration_sec: 25,
    instruction: "Leia o texto abaixo abrindo bem a boca. Faça cada palavra acender os anéis de clareza no painel!",
    target: "Precisão articulatória e projeção dos formantes.",
    dica_clinica: "Excelente para atores, locutores e pacientes com fala travada ou disartria leve.",
    visual_mode: "articulation",
    texto_pratica: "O papagaio tagarela pulou no poço profundo, batendo o bico na beirada do balde. Trinta tigres tristes tentaram triturar três pratos de trigo."
  },
  {
    id: "fricativas_marcadas",
    title: "Staccato de Fricativas (Apoio)",
    categoria: "Dublagem",
    faixa_etaria: ["Adulto"],
    target_duration_sec: 12,
    instruction: "Faça explosões curtas de ar pelo abdômen seguindo o texto. Observe os picos de energia subindo a cada pulso!",
    target: "Ativação do apoio diafragmático (appoggio) e precisão consonantal.",
    dica_clinica: "Treina resistência respiratória e evita tensão cervical na fala projetada.",
    visual_mode: "articulation",
    texto_pratica: "F! — F! — F!   |   S! — S! — S!   |   X! — X! — X!   (Pulso firme no abdômen)"
  },
  {
    id: "voo_do_aviao",
    title: "O Voo do Aviãozinho (Infantil)",
    categoria: "Fala",
    faixa_etaria: ["Infantil"],
    target_duration_sec: 12,
    instruction: "Use a sua voz para pilotar o aviãozinho! Faça uma voz fina (aguda) para ele subir até as estrelas e grossa (grave) para pousar!",
    target: "Estimular modulação de frequência (prosódia) de forma lúdica.",
    dica_clinica: "Altamente engajador para crianças ou pacientes com fala monótona.",
    visual_mode: "glissando",
    texto_pratica: "Vuuuuuu... O avião subiu lá nas nuvens! Vuuuuuu... Agora desceu na pista!"
  }
];

const GRADE_STYLES = {
  ok: "border-emerald-400 bg-emerald-50 text-emerald-900",
  warn: "border-amber-400 bg-amber-50 text-amber-900",
  alert: "border-red-400 bg-red-50 text-red-900",
  info: "border-stone-300 bg-stone-50 text-stone-700",
};

function TaskMetricPill({ label, value, unit }) {
  return (
    <div className="border border-stone-200 rounded-xl p-3 bg-stone-50/70 shadow-sm">
      <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{label}</div>
      <div className="font-heading text-lg font-bold text-stone-800 mt-0.5">
        {value ?? "—"}{value != null && unit ? <span className="text-xs text-stone-400 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}

// ============================================================================
// 2. COACH VISUAL DE BIOFEEDBACK EM TEMPO REAL (AUXILIA O PACIENTE NA META)
// ============================================================================
function BiofeedbackCoach({ challenge, isRecording, elapsed }) {
  const [micActive, setMicActive] = useState(false);
  const [intensity, setIntensity] = useState(0);
  const [pitchPct, setPitchPct] = useState(25);
  const [history, setHistory] = useState(Array(40).fill(0));
  const [stabilityScore, setStabilityScore] = useState(100);
  const [szStep, setSzStep] = useState(1); // 1 = /S/, 2 = /Z/
  const [sTime, setSTime] = useState(0);
  const [zTime, setZTime] = useState(0);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);

  const mode = challenge?.visual_mode || "sustain";
  const [minZone, maxZone] = challenge?.target_zone || [30, 75];
  const targetSec = challenge?.target_duration_sec || 15;
  const progressPct = Math.min(100, (elapsed / targetSec) * 100);

  // Liga o sensor visual automaticamente quando estiver gravando ou em modo de treino
  const shouldListen = isRecording || micActive;

  useEffect(() => {
    if (!shouldListen) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      setIntensity(0);
      return;
    }

    let mounted = true;
    const startSensor = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
        analyserRef.current = audioCtxRef.current.createAnalyser();
        const source = audioCtxRef.current.createMediaStreamSource(stream);
        source.connect(analyserRef.current);
        analyserRef.current.fftSize = 1024;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const loop = () => {
          if (!analyserRef.current || !mounted) return;
          analyserRef.current.getByteFrequencyData(dataArray);

          let highestBin = 2;
          let maxVal = 0;
          for (let i = 2; i < 36; i++) {
            if (dataArray[i] > maxVal) {
              maxVal = dataArray[i];
              highestBin = i;
            }
          }

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
          const avg = sum / bufferLength;
          const targetVol = Math.min(100, (avg / 38) * 100);

          setIntensity(prev => {
            const next = targetVol < 3 ? Math.max(0, prev - 4) : prev + (targetVol - prev) * 0.22;
            setHistory(h => {
              const updated = [...h.slice(1), Math.round(next)];
              const activeSamples = updated.filter(v => v > 15);
              if (activeSamples.length > 5) {
                const inZone = activeSamples.filter(v => v >= minZone && v <= maxZone).length;
                setStabilityScore(Math.round((inZone / activeSamples.length) * 100));
              }
              return updated;
            });
            return next;
          });

          if (targetVol > 8) {
            const targetPitch = Math.min(95, Math.max(8, ((highestBin - 2) / 18) * 100));
            setPitchPct(prev => prev + (targetPitch - prev) * 0.12);
          } else {
            setPitchPct(prev => Math.max(10, prev - 1.2));
          }

          animRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        toast.error("Não foi possível acessar o microfone para o guia visual.");
      }
    };

    startSensor();
    return () => {
      mounted = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, [shouldListen, minZone, maxZone]);

  // Cronômetro auxiliar para o modo S/Z
  useEffect(() => {
    if (!isRecording || mode !== "sz_ratio") return;
    if (intensity > 20) {
      const t = setTimeout(() => {
        if (szStep === 1) setSTime(v => +(v + 0.1).toFixed(1));
        else setZTime(v => +(v + 0.1).toFixed(1));
      }, 100);
      return () => clearTimeout(t);
    }
  }, [isRecording, intensity, mode, szStep]);

  const isInGreenZone = intensity >= minZone && intensity <= maxZone;

  return (
    <div className="bg-stone-950/90 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-inner">
      
      {/* Topo do Coach Visual */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${shouldListen ? "bg-emerald-400 animate-ping" : "bg-stone-600"}`} />
          <span className="text-xs font-bold uppercase tracking-widest text-stone-300">
            Guia Visual do Paciente
          </span>
        </div>

        <div className="flex items-center gap-3">
          {mode === "sustain" && (
            <span className="text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full">
              Estabilidade no Alvo: {stabilityScore}%
            </span>
          )}
          {!isRecording && (
            <button
              type="button"
              onClick={() => setMicActive(!micActive)}
              className={`text-xs font-bold px-3 py-1 rounded-lg border transition-colors ${
                micActive
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-stone-800 border-stone-700 text-stone-300 hover:bg-stone-700"
              }`}
            >
              {micActive ? "Parar Teste Visual" : "Testar Voz Antes de Gravar"}
            </button>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODO 1: TÚNEL DE ESTABILIDADE (Vogal /a/, Lax Vox, Boca Chiusa)   */}
      {/* ================================================================= */}
      {(mode === "sustain" || mode === "power_target") && (
        <div className="space-y-3">
          <div className="flex justify-between items-center text-xs font-bold">
            <span className={isInGreenZone ? "text-emerald-400" : intensity > maxZone ? "text-rose-400" : "text-amber-300"}>
              {intensity < 10
                ? "🎙️ Emita o som contínuo para entrar na faixa verde..."
                : isInGreenZone
                ? "✅ Perfeito! Mantenha a voz firme nessa faixa!"
                : intensity > maxZone
                ? "⚠️ Muito forte! Suavize um pouco para não forçar."
                : "🔼 Um pouco mais de projeção para alcançar a faixa verde!"}
            </span>
            <span className="font-mono text-stone-400">{Math.round(intensity)}%</span>
          </div>

          {/* Gráfico de Túnel ao Vivo */}
          <div className="relative h-36 bg-stone-900 rounded-xl border border-stone-800 overflow-hidden flex items-end p-2 gap-1">
            {/* Faixa Verde Ideal */}
            <div
              className="absolute left-0 right-0 bg-emerald-500/15 border-y border-dashed border-emerald-400/50 pointer-events-none flex items-center justify-end pr-3"
              style={{
                bottom: `${minZone}%`,
                height: `${maxZone - minZone}%`
              }}
            >
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-300/80 bg-stone-950/70 px-2 py-0.5 rounded">
                Zona Alvo Ideal
              </span>
            </div>

            {/* Barras de Histórico Contínuo */}
            {history.map((val, idx) => {
              const ok = val >= minZone && val <= maxZone;
              return (
                <div
                  key={idx}
                  className={`flex-1 rounded-t transition-all duration-75 ${
                    val < 5 ? "bg-stone-800" : ok ? "bg-emerald-400" : val > maxZone ? "bg-rose-500" : "bg-amber-400"
                  }`}
                  style={{ height: `${Math.max(4, val)}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODO 2: CURVA GUIA DE FREQUÊNCIA (Glissando Sirene / Aviãozinho)  */}
      {/* ================================================================= */}
      {mode === "glissando" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-sky-300">
            <span>✈️ Siga a trilha pontilhada: Grave ➔ Agudo ➔ Grave</span>
            <span className="font-mono">Altura: {Math.round(pitchPct)}%</span>
          </div>
          <div className="relative h-44 bg-gradient-to-b from-sky-950/60 to-stone-900 rounded-xl border border-sky-500/30 overflow-hidden p-4">
            <span className="absolute top-2 left-3 text-[10px] font-bold text-sky-300 uppercase">Agudo (Fino) ⬆️</span>
            <span className="absolute bottom-2 left-3 text-[10px] font-bold text-sky-300 uppercase">Grave (Grosso) ⬇️</span>

            {/* Curva Guia SVG */}
            <svg className="w-full h-full inset-0 absolute" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path
                d="M 5 85 Q 50 -10 95 85"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
                strokeDasharray="3 3"
                opacity="0.55"
              />
            </svg>

            {/* Cursor do Paciente */}
            <div
              className="absolute w-11 h-11 rounded-full bg-white text-stone-900 font-bold flex items-center justify-center shadow-lg border-4 border-sky-400 transition-all duration-75 text-xl"
              style={{
                left: `${isRecording ? Math.min(90, Math.max(8, progressPct)) : 50}%`,
                bottom: `${pitchPct}%`,
                transform: "translate(-50%, 50%)"
              }}
            >
              {pitchPct > 65 ? "🚀" : pitchPct < 35 ? "🛫" : "✈️"}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODO 3: DIAMANTE DE DINÂMICA (Messa di Voce)                      */}
      {/* ================================================================= */}
      {mode === "dynamics" && (
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold text-purple-300">
            <span>💎 Comece suave, cresça no meio e diminua no final!</span>
            <span>Volume Atual: {Math.round(intensity)}%</span>
          </div>
          <div className="relative h-36 bg-stone-900 rounded-xl border border-purple-500/30 overflow-hidden flex items-center justify-center p-4">
            <svg className="w-full h-full absolute inset-0" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polygon
                points="2,50 50,8 98,50 50,92"
                fill="rgba(168, 85, 247, 0.15)"
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
            </svg>
            <div
              className="w-full bg-purple-500/60 rounded-full transition-all duration-75 z-10 flex items-center justify-center text-[11px] font-bold text-white"
              style={{ height: `${Math.max(12, intensity)}%` }}
            >
              {intensity > 65 ? "FORTE (Fortissimo)" : intensity > 25 ? "MÉDIO (Mezzo)" : "SUAVE (Pianissimo)"}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODO 4: RELAÇÃO S / Z (Cronômetro Duplo Guiado)                   */}
      {/* ================================================================= */}
      {mode === "sz_ratio" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div
              onClick={() => setSzStep(1)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                szStep === 1 ? "bg-emerald-500/20 border-emerald-400 text-white" : "bg-stone-900 border-stone-800 text-stone-400"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider">Etapa 1: Som de /S/ (Ar)</div>
              <div className="text-2xl font-heading font-bold mt-1">{sTime.toFixed(1)}s</div>
              <p className="text-[10px] opacity-80 mt-0.5">Clique aqui para medir o /S/</p>
            </div>
            <div
              onClick={() => setSzStep(2)}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                szStep === 2 ? "bg-indigo-500/20 border-indigo-400 text-white" : "bg-stone-900 border-stone-800 text-stone-400"
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider">Etapa 2: Som de /Z/ (Voz)</div>
              <div className="text-2xl font-heading font-bold mt-1">{zTime.toFixed(1)}s</div>
              <p className="text-[10px] opacity-80 mt-0.5">Clique aqui para medir o /Z/</p>
            </div>
          </div>
          {sTime > 0 && zTime > 0 && (
            <div className="text-xs font-bold text-center bg-stone-900 py-2 rounded-lg border border-stone-800 text-emerald-400">
              Índice S/Z Preliminar: {(sTime / zTime).toFixed(2)} (Ideal: próximo de 1.0)
            </div>
          )}
        </div>
      )}

      {/* ================================================================= */}
      {/* MODO 5: ARTICULAÇÃO E PULSO (Leitura Sobrearticulada / Staccato)  */}
      {/* ================================================================= */}
      {mode === "articulation" && (
        <div className="flex items-center justify-between bg-stone-900 p-4 rounded-xl border border-stone-800">
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Sensor de Precisão Articulatória</p>
            <p className="text-xs text-stone-400 mt-1">
              Abra bem a boca em cada sílaba para fazer o anel pulsar com energia!
            </p>
          </div>
          <div className="relative w-16 h-16 flex items-center justify-center shrink-0">
            <div
              className="absolute inset-0 rounded-full bg-amber-500/30 transition-transform duration-75"
              style={{ transform: `scale(${1 + (intensity / 100) * 0.6})` }}
            />
            <div className="relative w-10 h-10 rounded-full bg-amber-500 text-stone-950 font-black text-xs flex items-center justify-center">
              {Math.round(intensity)}%
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ============================================================================
// 3. GRAVADOR DO DESAFIO COM CONTADOR DE META
// ============================================================================
function ChallengeRecorder({ onReady, onRecordingChange, targetDuration }) {
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
        audio: { echoCancellation: false, noiseSuppression: false, sampleRate: 44100 },
      });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunksRef.current, { type: "audio/webm" });
        setBlob(b);
        setAudioURL(URL.createObjectURL(b));
        onReady?.(b);
        onRecordingChange?.(false, 0);
      };
      mr.start();
      setElapsed(0);
      setRecording(true);
      onRecordingChange?.(true, 0);
      timerRef.current = setInterval(() => {
        setElapsed((e) => {
          const next = e + 1;
          onRecordingChange?.(true, next);
          return next;
        });
      }, 1000);
    } catch {
      toast.error("Permissão de microfone negada.");
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
    onRecordingChange?.(false, 0);
  };

  const pct = targetDuration ? Math.min(100, (elapsed / targetDuration) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        {!recording && !blob && (
          <Button onClick={start} data-testid="chal-rec-start" className="bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-sm h-11 px-5">
            <Mic size={16} className="mr-2" /> Iniciar Gravação Oficial
          </Button>
        )}
        {recording && (
          <Button onClick={stop} variant="destructive" data-testid="chal-rec-stop" className="animate-pulse rounded-xl font-bold shadow-sm h-11 px-5">
            <Square size={15} className="mr-2 fill-white" /> Finalizar Gravação ({elapsed}s / {targetDuration}s)
          </Button>
        )}
        {blob && !recording && (
          <div className="flex items-center gap-3 w-full flex-wrap">
            <audio src={audioURL} controls className="max-w-xs h-10" data-testid="chal-playback" />
            <Button variant="outline" onClick={reset} data-testid="chal-reset" className="rounded-xl border-stone-600 text-stone-200 bg-stone-800 hover:bg-stone-700">
              <RotateCcw size={14} className="mr-2" /> Gravar Novamente
            </Button>
          </div>
        )}
      </div>
      {recording && targetDuration && (
        <div className="w-full pt-2">
          <div className="flex justify-between text-[11px] font-bold text-stone-300 mb-1">
            <span>Progresso de Sustentação</span>
            <span className={elapsed >= targetDuration ? "text-emerald-400" : "text-amber-300"}>
              {elapsed >= targetDuration ? "🎉 Meta Atingida! Pode continuar ou parar." : `Meta: ${targetDuration} segundos`}
            </span>
          </div>
          <div className="h-3 bg-stone-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${elapsed >= targetDuration ? "bg-emerald-500" : "bg-rose-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// 4. PÁGINA PRINCIPAL DE DESAFIOS VOCAIS
// ============================================================================
export default function VoiceChallenges() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [selectedPatient, setSelectedPatient] = useState(params.get("patient_id") || "");
  const [selectedChallenge, setSelectedChallenge] = useState(null);

  const [filtroIdade, setFiltroIdade] = useState("Todos");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");

  const [blob, setBlob] = useState(null);
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [resultAudioUrl, setResultAudioUrl] = useState(null);

  const [isRecordingNow, setIsRecordingNow] = useState(false);
  const [recElapsed, setRecElapsed] = useState(0);

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["challenge-attempts", selectedPatient],
    queryFn: async () => (await api.get(`/voice/challenges/attempts${selectedPatient ? `?patient_id=${selectedPatient}` : ""}`)).data,
  });

  // Carrega o áudio do resultado de forma autenticada (Blob)
  useEffect(() => {
    let url = null;
    if (lastResult?.attempt_id) {
      setResultAudioUrl(null);
      api.get(`/voice/challenges/audio/${lastResult.attempt_id}/download?format=wav`, { responseType: "blob" })
        .then(res => {
          url = URL.createObjectURL(res.data);
          setResultAudioUrl(url);
        })
        .catch(() => {});
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [lastResult?.attempt_id]);

  const downloadAudio = async (format) => {
    try {
      const response = await api.get(`/voice/challenges/audio/${lastResult.attempt_id}/download?format=${format}`, {
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      const safeTitle = lastResult.challenge_title ? lastResult.challenge_title.replace(/\s+/g, "_") : "Desafio";
      link.setAttribute("download", `${safeTitle}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Áudio .${format.toUpperCase()} baixado com sucesso!`);
    } catch {
      toast.error("Erro ao baixar o áudio convertido.");
    }
  };

  const submit = async () => {
    if (!selectedPatient || !selectedChallenge) {
      return toast.error("Selecione o paciente e o desafio primeiro.");
    }
    const src = file || blob;
    if (!src) {
      return toast.error("Grave ou envie um áudio para analisar.");
    }
    setBusy(true);
    try {
      const fd = new FormData();
      const filename = file ? file.name : `challenge_${Date.now()}.webm`;
      fd.append("file", src, filename);
      fd.append("patient_id", selectedPatient);
      fd.append("challenge_type", selectedChallenge.id);
      fd.append("challenge_title", selectedChallenge.title);
      if (notes) fd.append("notes", notes);

      const { data } = await api.post("/voice/challenges/attempt", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setLastResult(data);
      setBlob(null);
      setFile(null);
      setNotes("");
      toast.success("Execução analisada com sucesso!");
      qc.invalidateQueries({ queryKey: ["challenge-attempts"] });
    } catch (e) {
      toast.error(e.response?.data?.detail || "Falha na análise acústica do desafio.");
    } finally {
      setBusy(false);
    }
  };

  const del = async (id) => {
    if (!window.confirm("Excluir tentativa do histórico?")) return;
    await api.delete(`/voice/challenges/attempts/${id}`);
    qc.invalidateQueries({ queryKey: ["challenge-attempts"] });
    if (lastResult?.attempt_id === id) setLastResult(null);
    toast.success("Tentativa removida.");
  };

  const renderGradeIcon = (g, size = 20) => {
    if (g === "ok") return <CheckCircle2 size={size} className="text-emerald-500 shrink-0" />;
    if (g === "warn") return <AlertTriangle size={size} className="text-amber-500 shrink-0" />;
    if (g === "alert") return <AlertCircle size={size} className="text-rose-500 shrink-0" />;
    return <Info size={size} className="text-stone-400 shrink-0" />;
  };

  const humanizeKey = (k) => k.replace(/_/g, " ").replace(/hz|db|pct|sec/g, (m) => m.toUpperCase());

  const desafiosFiltrados = BIBLIOTECA_DESAFIOS.filter((desafio) => {
    const bateIdade = filtroIdade === "Todos" || desafio.faixa_etaria.includes(filtroIdade);
    const bateCat = filtroCategoria === "Todas" || desafio.categoria === filtroCategoria;
    return bateIdade && bateCat;
  });

  return (
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* CABEÇALHO */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1 flex items-center gap-2">
            <Award size={14} className="text-[#D46F54]" /> Gamificação & Biofeedback Acústico
          </div>
          <h1 className="font-heading text-3xl font-bold text-stone-800">Desafios Vocais Guiados</h1>
          <p className="text-sm text-stone-500 mt-1 max-w-2xl">
            Selecione um exercício interativo para guiar visualmente o paciente em tempo real e extrair os parâmetros que você precisa avaliar.
          </p>
        </div>

        <div className="min-w-[280px] bg-stone-50 p-4 rounded-2xl border border-stone-100">
          <label className="text-xs font-bold text-stone-600 block mb-2 uppercase tracking-wider">Paciente em Atendimento</label>
          <Select value={selectedPatient} onValueChange={setSelectedPatient}>
            <SelectTrigger className="bg-white border-stone-200 h-11 shadow-sm"><SelectValue placeholder="Selecione o paciente..." /></SelectTrigger>
            <SelectContent>
              {patients.map((p) => (
                <SelectItem key={p.patient_id} value={p.patient_id} className="font-medium">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* SALA DE EXECUÇÃO INTERATIVA */}
      {selectedChallenge && (
        <div className="bg-stone-900 text-white border border-stone-800 rounded-3xl p-6 md:p-8 mb-8 shadow-2xl animate-in slide-in-from-top-4">
          <div className="flex items-start justify-between mb-6 border-b border-stone-800 pb-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold mb-1 flex items-center gap-2">
                <PlayCircle size={14} /> Sala de Execução Guiada
              </div>
              <div className="font-heading text-2xl font-bold">{selectedChallenge.title}</div>
              <p className="text-xs text-stone-400 mt-1">Objetivo Clínico: {selectedChallenge.target}</p>
            </div>
            <button
              onClick={() => { setSelectedChallenge(null); setBlob(null); setIsRecordingNow(false); }}
              className="text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 space-y-5">
              <div className="bg-stone-800/60 border border-stone-700/60 rounded-2xl p-5">
                <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-1.5">Como fazer (Orientação ao Paciente)</div>
                <div className="text-base md:text-lg font-medium leading-relaxed text-stone-100">{selectedChallenge.instruction}</div>
              </div>

              {selectedChallenge.texto_pratica && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 shadow-inner">
                  <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold mb-2 flex items-center gap-2">
                    <Quote size={14} /> Texto para Leitura em Voz Alta
                  </div>
                  <div className="text-xl md:text-2xl font-serif italic text-amber-50 leading-relaxed font-medium">
                    "{selectedChallenge.texto_pratica}"
                  </div>
                </div>
              )}

              {/* COACH VISUAL INTELIGENTE */}
              <BiofeedbackCoach
                challenge={selectedChallenge}
                isRecording={isRecordingNow}
                elapsed={recElapsed}
              />
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between space-y-6 bg-stone-800/40 p-6 rounded-2xl border border-stone-800">
              <div className="space-y-4">
                <div className="text-xs font-bold uppercase tracking-widest text-stone-400 flex items-center gap-2">
                  <Timer size={15} className="text-[#D46F54]" /> Captura Acústica (Meta: {selectedChallenge.target_duration_sec}s)
                </div>

                <div className="bg-stone-900 p-5 rounded-2xl border border-stone-700">
                  <ChallengeRecorder
                    onReady={setBlob}
                    targetDuration={selectedChallenge.target_duration_sec}
                    onRecordingChange={(rec, el) => {
                      setIsRecordingNow(rec);
                      setRecElapsed(el);
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="text-xs font-bold text-stone-400 block mb-1.5 uppercase">Ou envie áudio salvo</label>
                    <Input
                      type="file"
                      accept="audio/*,.wav,.mp3,.webm,.ogg"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="bg-stone-900 border-stone-700 text-stone-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-stone-400 block mb-1.5 uppercase">Observação Clínica</label>
                    <Input
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Ex: Ataque vocal suave..."
                      className="bg-stone-900 border-stone-700 text-stone-300"
                    />
                  </div>
                </div>
              </div>

              <Button
                onClick={submit}
                disabled={busy || (!blob && !file) || !selectedPatient}
                className="w-full h-14 text-base bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg"
              >
                {busy ? (
                  <><Activity size={18} className="mr-2 animate-spin" /> Processando Métricas no Praat…</>
                ) : (
                  <><Sparkles size={18} className="mr-2" /> Processar e Avaliar Desempenho</>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* RESULTADO DA AVALIAÇÃO */}
      {lastResult && (
        <div className={`border rounded-3xl p-6 mb-8 shadow-sm animate-in zoom-in-95 ${GRADE_STYLES[lastResult.evaluation?.grade] || "bg-white border-stone-200"}`}>
          <div className="text-xs uppercase tracking-widest font-bold mb-4 flex items-center gap-2 opacity-75">
            <Activity size={14} /> Parecer Acústico do Desafio
          </div>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 w-full mb-6">
            <div className="flex items-start gap-4 flex-1">
              {renderGradeIcon(lastResult.evaluation?.grade, 36)}
              <div>
                <div className="font-heading text-xl font-bold">{lastResult.challenge_title}</div>
                <div className="text-sm mt-1 font-medium leading-relaxed">{lastResult.evaluation?.message}</div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3 shrink-0 bg-white/80 p-3 rounded-2xl border border-stone-200/80">
              {resultAudioUrl && <audio src={resultAudioUrl} controls className="max-w-[240px] h-10" />}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mr-1">Exportar:</span>
                {["wav", "mp3", "ogg"].map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => downloadAudio(fmt)}
                    className="bg-white hover:bg-[#D46F54] hover:text-white text-stone-700 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all border border-stone-200 shadow-sm uppercase"
                  >
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-5 rounded-2xl border border-stone-200/80">
            {lastResult.task_metrics && Object.keys(lastResult.task_metrics).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-3">Métricas Específicas da Tarefa</div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(lastResult.task_metrics).map(([k, v]) => (
                    <TaskMetricPill key={k} label={humanizeKey(k)} value={typeof v === "number" ? v.toFixed(2) : v} />
                  ))}
                </div>
              </div>
            )}

            {lastResult.metrics && Object.keys(lastResult.metrics).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-3">Parâmetros Glóticos (Praat)</div>
                <div className="grid grid-cols-2 gap-3">
                  {["duration_sec", "f0_mean_hz", "jitter_local_pct", "shimmer_local_pct", "hnr_db", "intensity_db"].map((k) => (
                    lastResult.metrics[k] != null && (
                      <TaskMetricPill key={k} label={humanizeKey(k)} value={Number(lastResult.metrics[k]).toFixed(2)} />
                    )
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GRADE DE DESAFIOS + HISTÓRICO */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2">
          
          {/* Filtros */}
          <div className="bg-stone-100 p-2 rounded-2xl border border-stone-200 mb-6 flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex bg-white rounded-xl p-1 border border-stone-200">
              <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase flex items-center">Público:</div>
              {["Todos", "Infantil", "Adulto", "Idoso"].map((idade) => (
                <button
                  key={idade}
                  onClick={() => setFiltroIdade(idade)}
                  className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-all ${
                    filtroIdade === idade ? "bg-stone-900 text-white shadow-sm" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {idade}
                </button>
              ))}
            </div>

            <div className="flex-1 flex bg-white rounded-xl p-1 border border-stone-200 overflow-x-auto">
              <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase flex items-center">Área:</div>
              {["Todas", "Cotidiano", "Canto", "Dublagem", "Fala"].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFiltroCategoria(cat)}
                  className={`px-3 text-xs font-bold py-1.5 rounded-lg transition-all whitespace-nowrap ${
                    filtroCategoria === cat ? "bg-[#D46F54] text-white shadow-sm" : "text-stone-500 hover:text-stone-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Cards de Desafios */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {desafiosFiltrados.map((desafio) => (
              <div
                key={desafio.id}
                className="bg-white border border-stone-200 rounded-3xl p-5 hover:border-[#D46F54]/60 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-2 rounded-xl ${
                          desafio.categoria === "Canto"
                            ? "bg-rose-100 text-rose-600"
                            : desafio.categoria === "Dublagem"
                            ? "bg-indigo-100 text-indigo-600"
                            : "bg-emerald-100 text-emerald-600"
                        }`}
                      >
                        {desafio.categoria === "Canto" && <Music size={16} />}
                        {desafio.categoria === "Dublagem" && <Mic2 size={16} />}
                        {desafio.categoria === "Cotidiano" && <Activity size={16} />}
                        {desafio.categoria === "Fala" && <User size={16} />}
                      </div>
                      <h4 className="font-heading font-bold text-base text-stone-800 leading-tight">{desafio.title}</h4>
                    </div>
                    <span className="text-[10px] font-bold bg-stone-100 text-stone-600 px-2.5 py-1 rounded-full shrink-0">
                      {desafio.target_duration_sec}s
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 leading-relaxed mb-4">{desafio.instruction}</p>
                </div>

                <div>
                  <div className="bg-[#F3E7E4]/50 border border-[#D46F54]/15 rounded-xl p-3 flex gap-2 items-start mb-4">
                    <Info size={14} className="text-[#D46F54] shrink-0 mt-0.5" />
                    <p className="text-[11px] font-medium text-stone-700 leading-snug">
                      <span className="font-bold text-[#B75C46]">Objetivo:</span> {desafio.target}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setSelectedChallenge(desafio);
                      setLastResult(null);
                      setBlob(null);
                      setFile(null);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="w-full bg-stone-900 hover:bg-black text-white font-bold rounded-xl h-10 shadow-sm"
                  >
                    Iniciar Desafio Guiado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* COLUNA DIREITA: HISTÓRICO */}
        <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm h-fit max-h-[800px] flex flex-col">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Histórico de Tentativas</div>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-3">
            {!selectedPatient ? (
              <div className="text-xs font-bold text-stone-400 text-center py-10 bg-stone-50 rounded-2xl border border-stone-100">
                Selecione um paciente no topo para ver a evolução nos desafios.
              </div>
            ) : attempts.length === 0 ? (
              <div className="text-xs font-bold text-stone-400 text-center py-10 bg-stone-50 rounded-2xl border border-stone-100">
                Nenhuma tentativa gravada para este paciente.
              </div>
            ) : (
              attempts.map((a) => (
                <div
                  key={a.attempt_id}
                  onClick={() => { setLastResult(a); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={`p-4 border rounded-2xl cursor-pointer transition-all ${
                    lastResult?.attempt_id === a.attempt_id
                      ? "border-[#D46F54] bg-[#F3E7E4]/30 shadow-sm"
                      : "border-stone-100 bg-stone-50 hover:border-stone-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {renderGradeIcon(a.evaluation?.grade, 16)}
                      <div className="font-bold text-sm text-stone-800 truncate">{a.challenge_title}</div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); del(a.attempt_id); }}
                      className="text-stone-300 hover:text-rose-500 transition-colors ml-2 p-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="text-[10px] font-bold text-stone-400 mb-2">
                    {new Date(a.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                  {a.evaluation?.message && (
                    <div className="text-[11px] text-stone-600 line-clamp-2 leading-tight bg-white p-2.5 rounded-xl border border-stone-100">
                      {a.evaluation.message}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}