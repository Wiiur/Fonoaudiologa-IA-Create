import React, { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { streamPost } from "@/lib/sse";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import MarkdownView from "@/components/MarkdownView";

const SID_KEY = "vox_copilot_sid";

export default function Copilot() {
  const qc = useQueryClient();
  const [sid] = useState(() => {
    const existing = localStorage.getItem(SID_KEY);
    if (existing) return existing;
    const n = `cop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SID_KEY, n);
    return n;
  });
  const [input, setInput] = useState("");
  const [streamText, setStreamText] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const { data: history = [] } = useQuery({
    queryKey: ["copilot", sid],
    queryFn: async () => (await api.get(`/copilot/history/${sid}`)).data,
  });

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [history, streamText]);

  const send = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setStreamText("");
    const msg = input.trim();
    setInput("");
    // Optimistic append
    qc.setQueryData(["copilot", sid], (old = []) => [
      ...old, { role: "user", content: msg, created_at: new Date().toISOString() },
    ]);
    try {
      await streamPost("/copilot/chat", { session_id: sid, message: msg }, {
        onDelta: (d) => setStreamText((prev) => prev + d),
      });
    } catch {}
    setStreamText("");
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["copilot", sid] });
  };

  const newSession = () => {
    const n = `cop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(SID_KEY, n);
    window.location.reload();
  };

  return (
    <div className="p-8 md:p-10 flex flex-col h-screen">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Módulo 5</div>
          <h1 className="font-heading text-3xl font-medium tracking-tight mt-2">Copiloto Clínico Científico</h1>
        </div>
        <Button variant="outline" onClick={newSession} data-testid="new-copilot-session">
          <i className="fa-solid fa-plus mr-2"></i> Nova sessão
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-2">
        {history.length === 0 && !streamText && (
          <div className="bg-white border border-dashed border-stone-200 rounded-lg p-10 text-center text-sm text-stone-500">
            Pergunte sobre casos complexos, protocolos padronizados ou raciocínio diferencial.
            <div className="text-xs text-stone-400 mt-2">Baseado em evidências. Não inventa protocolos.</div>
          </div>
        )}
        {history.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div className={`max-w-[85%] rounded-lg p-4 ${m.role === "user" ? "bg-[#D46F54] text-white" : "bg-white border border-stone-200"}`}>
              {m.role === "user" ? (
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              ) : (
                <MarkdownView content={m.content} />
              )}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="max-w-[85%] rounded-lg p-4 bg-white border border-stone-200">
            <MarkdownView content={streamText} />
          </div>
        )}
      </div>

      <div className="mt-4 bg-white border border-stone-200 rounded-lg p-3 flex gap-2">
        <Textarea
          data-testid="copilot-input"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ex.: Protocolos padronizados para avaliação de disfagia neurogênica em adultos?"
          className="border-0 focus-visible:ring-0 resize-none"
        />
        <Button
          data-testid="copilot-send-btn"
          onClick={send}
          disabled={busy || !input.trim()}
          className="bg-[#D46F54] hover:bg-[#B75C46] text-white self-end"
        >
          {busy ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-paper-plane"></i>}
        </Button>
      </div>
    </div>
  );
}
