import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { streamPost } from "@/lib/sse";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MarkdownView from "@/components/MarkdownView";

const SID_KEY = "vox_copilot_sid";
const SESSIONS_LIST_KEY = "vox_copilot_sessions_list";

export default function Copilot() {
  const qc = useQueryClient();
  
  // 1. Busca os pacientes para o médico poder selecionar
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  // 2. Gerenciamento do Histórico de Sessões (Cards da Barra Lateral)
  const [sessionsList, setSessionsList] = useState(() => {
    const saved = localStorage.getItem(SESSIONS_LIST_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // UX FIX 1: Sempre inicia um chat NOVO e ZERADO ao abrir a página
  const [sid, setSid] = useState(() => {
    const n = `cop_${Date.now()}`;
    localStorage.setItem(SID_KEY, n);
    return n;
  });

  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  // Busca as mensagens da sessão atual
  const { data: history = [] } = useQuery({
    queryKey: ["copilot", sid],
    queryFn: async () => (await api.get(`/copilot/history/${sid}`)).data,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history, streamText]);

  // Atualiza a lista de sessões no navegador sempre que ela mudar
  useEffect(() => {
    localStorage.setItem(SESSIONS_LIST_KEY, JSON.stringify(sessionsList));
  }, [sessionsList]);

  // Função para criar um Novo Chat
  const startNewSession = () => {
    const n = `cop_${Date.now()}`;
    localStorage.setItem(SID_KEY, n);
    setSid(n);
    setSelectedPatientId(""); // Reseta o paciente
    setInput("");
  };

  // Função para carregar um chat antigo clicando no Card
  const loadSession = (sessionId, patientId) => {
    localStorage.setItem(SID_KEY, sessionId);
    setSid(sessionId);
    setSelectedPatientId(patientId || "");
  };

  const send = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setStreamText("");
    const msg = input.trim();
    setInput("");
    
    // Atualiza a barra lateral com segurança
    setSessionsList(prev => {
      const exists = prev.find(s => s.id === sid);
      if (!exists) {
        const patientName = patients?.find(p => p.patient_id === selectedPatientId)?.name || "Paciente Não Informado";
        return [{
          id: sid,
          title: msg.substring(0, 40) + (msg.length > 40 ? "..." : ""),
          patientId: selectedPatientId,
          patientName: patientName,
          date: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
        }, ...prev];
      }
      return prev;
    });

    // Animação Otimista
    qc.setQueryData(["copilot", sid], (old = []) => [
      ...old, { role: "user", content: msg, created_at: new Date().toISOString() },
    ]);

    try {
      const payload = { 
        session_id: sid, 
        message: msg 
      };
      
      if (selectedPatientId && selectedPatientId.trim() !== "") {
        payload.patient_id = selectedPatientId;
      }
      
      await streamPost("/copilot/chat", payload, {
        onDelta: (d) => setStreamText((prev) => prev + d),
      });
      
    } catch (error) {
      console.error("Erro CRÍTICO no Copiloto:", error);
      alert("Erro de conexão ao enviar mensagem.");
      qc.setQueryData(["copilot", sid], (old = []) => old.filter(m => m.content !== msg));
    }
    
    setStreamText("");
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["copilot", sid] });
  };

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden font-sans">
      
      {/* ========================================== */}
      {/* BARRA LATERAL (HISTÓRICO E CARDS)          */}
      {/* ========================================== */}
      <div className="w-80 bg-white border-r border-stone-200 flex-col hidden lg:flex shadow-sm z-10">
        <div className="p-5 border-b border-stone-100">
          <div className="text-[10px] uppercase tracking-[0.2em] text-[#D46F54] font-bold mb-1">Módulo 5</div>
          <h2 className="font-heading text-xl font-bold text-stone-800">Copiloto Clínico</h2>
          
          <Button 
            onClick={startNewSession} 
            className="w-full mt-4 bg-stone-900 hover:bg-stone-800 text-white rounded-xl shadow-sm h-11 flex items-center justify-center gap-2 transition-all"
          >
            <i className="fa-solid fa-plus text-sm"></i> Novo Raciocínio
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-stone-200">
          <p className="text-xs font-bold text-stone-400 uppercase tracking-wider pl-2 mb-3 mt-2">Histórico Recente</p>
          
          {sessionsList.length === 0 && (
            <div className="text-center text-sm text-stone-400 p-4 italic">Nenhum chat salvo ainda.</div>
          )}

          {sessionsList.map(session => (
            <div 
              key={session.id}
              onClick={() => loadSession(session.id, session.patientId)}
              className={`p-4 rounded-xl cursor-pointer transition-all border ${sid === session.id ? 'bg-[#D46F54]/5 border-[#D46F54]/20 shadow-sm' : 'bg-white border-stone-100 hover:border-stone-300 hover:bg-stone-50'}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-stone-400">{session.date}</span>
                {session.patientName !== "Paciente Não Informado" && (
                  <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                    <i className="fa-regular fa-user"></i> {session.patientName.split(" ")[0]}
                  </span>
                )}
              </div>
              <h4 className={`text-sm font-medium line-clamp-2 leading-relaxed ${sid === session.id ? 'text-[#D46F54]' : 'text-stone-700'}`}>
                "{session.title}"
              </h4>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================== */}
      {/* ÁREA PRINCIPAL DO CHAT                     */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col h-full relative bg-[#F9F9F8]">
        
        {/* BARRA SUPERIOR (HEADER) LIMPA */}
        <div className="h-16 bg-white border-b border-stone-200 flex items-center justify-between px-6 shadow-sm shrink-0">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-[#D46F54]/10 flex items-center justify-center text-[#D46F54]">
               <i className="fa-solid fa-brain"></i>
             </div>
             <div>
               <h3 className="font-bold text-stone-800 text-sm">SSDC Integrado</h3>
               <p className="text-[10px] text-stone-500 font-medium">Sistema de Suporte à Decisão Clínica</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2">
             <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
               <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Motores Online
             </span>
          </div>
        </div>

        {/* ÁREA DE ROLAGEM DAS MENSAGENS */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-thin scrollbar-thumb-stone-200">
          
          {/* BANNER LEGAL */}
          <div className="max-w-3xl mx-auto bg-amber-50 border border-amber-200 text-amber-800 text-xs px-5 py-3 rounded-xl flex items-start gap-3 shadow-sm mb-8">
            <i className="fa-solid fa-shield-halved mt-0.5 text-amber-500 text-lg"></i>
            <p className="leading-relaxed">
              <strong>Aviso Ético Profissional (CFFa):</strong> Este Copiloto fornece hipóteses funcionais baseadas em evidências. Ele <strong>não emite diagnósticos médicos estruturais</strong>. A conduta e o laudo final são de responsabilidade exclusiva do fonoaudiólogo.
            </p>
          </div>

          {history.length === 0 && !streamText && (
            <div className="max-w-2xl mx-auto mt-12 text-center">
               <h2 className="text-2xl font-heading font-bold text-stone-700 mb-3">Como posso ajudar na sua avaliação hoje?</h2>
               <p className="text-stone-500 mb-8">Cruze dados acústicos ou peça sugestões de conduta baseadas em literatura.</p>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                 <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:border-[#D46F54] hover:shadow-md transition-all group" onClick={() => setInput("Quais as diferenças acústicas esperadas no Praat entre uma fenda em ampulheta e uma fenda triangular em mulheres adultas?")}>
                   <i className="fa-solid fa-wave-square text-[#D46F54] text-xl mb-3 opacity-80 group-hover:opacity-100"></i>
                   <p className="text-sm text-stone-600 font-medium leading-relaxed">Comparar padrões acústicos de diferentes fendas glóticas.</p>
                 </div>
                 <div className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm cursor-pointer hover:border-[#D46F54] hover:shadow-md transition-all group" onClick={() => setInput("Considerando os protocolos aplicados, quais as hipóteses funcionais e sugestão de conduta?")}>
                   <i className="fa-solid fa-stethoscope text-[#D46F54] text-xl mb-3 opacity-80 group-hover:opacity-100"></i>
                   <p className="text-sm text-stone-600 font-medium leading-relaxed">Avaliar métricas e protocolos do paciente selecionado.</p>
                 </div>
               </div>
            </div>
          )}
          
          <div className="max-w-4xl mx-auto space-y-6">
            {history.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {m.role !== "user" && (
                  <div className="w-8 h-8 rounded-full bg-[#D46F54] flex items-center justify-center text-white shrink-0 mr-3 mt-1 shadow-sm">
                    <i className="fa-solid fa-robot text-xs"></i>
                  </div>
                )}
                <div className={`max-w-[85%] rounded-2xl p-5 shadow-sm ${m.role === "user" ? "bg-stone-800 text-white rounded-tr-sm" : "bg-white border border-stone-200 text-stone-700 rounded-tl-sm"}`}>
                  {m.role === "user" ? (
                    <div className="text-sm whitespace-pre-wrap font-medium">{m.content}</div>
                  ) : (
                    <div className="prose prose-sm prose-stone max-w-none">
                      <MarkdownView content={m.content} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {streamText && (
              <div className="flex justify-start">
                 <div className="w-8 h-8 rounded-full bg-[#D46F54] flex items-center justify-center text-white shrink-0 mr-3 mt-1 shadow-sm">
                    <i className="fa-solid fa-robot text-xs"></i>
                 </div>
                 <div className="max-w-[85%] rounded-2xl rounded-tl-sm p-5 bg-white border border-stone-200 shadow-sm prose prose-sm prose-stone max-w-none">
                   <MarkdownView content={streamText} />
                 </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================== */}
        {/* ÁREA DE DIGITAÇÃO FIXA NO RODAPÉ           */}
        {/* ========================================== */}
        <div className="p-4 md:px-8 md:pb-6 bg-gradient-to-t from-[#F9F9F8] via-[#F9F9F8] to-transparent shrink-0">
          
          {/* UX FIX 2: Seletor de Paciente integrado visualmente ao chat */}
          <div className="max-w-4xl mx-auto mb-2">
             <div className="flex items-center gap-2 bg-white w-fit px-3 py-1.5 rounded-t-xl rounded-br-xl border border-stone-200 border-b-0 shadow-sm relative z-10 translate-y-[1px]">
               <i className="fa-regular fa-folder-open text-[#D46F54] text-sm"></i>
               <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest hidden sm:block">Contexto Clínico:</label>
               <select
                 value={selectedPatientId}
                 onChange={(e) => setSelectedPatientId(e.target.value)}
                 className="bg-transparent border-none text-stone-700 text-sm focus:ring-0 cursor-pointer font-bold outline-none w-48 md:w-64 p-0 appearance-auto"
               >
                 <option value="">Análise Geral (Sem Prontuário)</option>
                 {patients.map(p => (
                   <option key={p.patient_id} value={p.patient_id}>{p.name}</option>
                 ))}
               </select>
             </div>
          </div>

          <div className="max-w-4xl mx-auto bg-white border border-stone-200 rounded-2xl rounded-tl-none p-2 pl-4 flex gap-3 shadow-lg items-end transition-all focus-within:ring-2 focus-within:ring-[#D46F54]/30 focus-within:border-[#D46F54] relative z-20">
            <Textarea
              data-testid="copilot-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Descreva o quadro clínico ou peça uma análise..."
              className="border-0 focus-visible:ring-0 resize-none flex-1 text-sm bg-transparent shadow-none py-3 min-h-[44px] max-h-[120px]"
            />
            <Button
              data-testid="copilot-send-btn"
              onClick={send}
              disabled={busy || !input.trim()}
              className="bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-xl h-11 w-11 p-0 flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:opacity-50 mb-0.5 mr-0.5"
            >
              {busy ? <i className="fa-solid fa-spinner fa-spin text-lg"></i> : <i className="fa-solid fa-arrow-up text-lg"></i>}
            </Button>
          </div>
          
          <p className="text-center text-[10px] text-stone-400 mt-3 font-medium">
            O Copiloto pode cometer erros. Revise os dados com a literatura científica (Praat/MDVP).
          </p>
        </div>

      </div>
    </div>
  );
}