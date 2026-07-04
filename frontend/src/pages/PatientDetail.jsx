import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

export default function PatientDetail() {
  const { id } = useParams();
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgForm, setMsgForm] = useState({ kind: "reminder", channel: "whatsapp", context: "" });
  const [msgResult, setMsgResult] = useState(null);
  const [msgBusy, setMsgBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);

  const generateMsg = async () => {
    setMsgBusy(true); setMsgResult(null);
    try {
      const { data } = await api.post("/messages/draft", { patient_id: id, ...msgForm });
      setMsgResult(data);
    } catch { toast.error("Erro ao gerar mensagem"); }
    setMsgBusy(false);
  };
  const createInvite = async () => {
    try {
      const { data } = await api.post(`/patients/${id}/invite`, {});
      const full = `${window.location.origin}${data.invite_link}`;
      try { await navigator.clipboard.writeText(full); } catch {}
      setInviteLink(full);
      toast.success("Link de convite copiado");
    } catch { toast.error("Erro ao gerar convite"); }
  };
  const { data: p } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => (await api.get(`/patients/${id}`)).data,
  });
  const { data: records = [] } = useQuery({
    queryKey: ["records", id],
    queryFn: async () => (await api.get(`/records?patient_id=${id}`)).data,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["activities", id],
    queryFn: async () => (await api.get(`/activities?patient_id=${id}`)).data,
  });
  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments-patient", id],
    queryFn: async () => (await api.get(`/appointments`)).data.filter((a) => a.patient_id === id),
  });

  // Analytics: sessions per month + records per month
  const monthly = React.useMemo(() => {
    const bucket = {};
    const bump = (iso, key) => {
      if (!iso) return;
      const d = new Date(iso);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      bucket[k] = bucket[k] || { month: k, sessions: 0, records: 0, activities: 0 };
      bucket[k][key] += 1;
    };
    appointments.forEach((a) => bump(a.start, "sessions"));
    records.forEach((r) => bump(r.session_date || r.created_at, "records"));
    activities.forEach((a) => bump(a.created_at, "activities"));
    return Object.values(bucket).sort((a, b) => a.month.localeCompare(b.month));
  }, [appointments, records, activities]);

  if (!p) return <div className="p-10 text-stone-500">Carregando…</div>;

  return (
    <div className="p-8 md:p-10">
      <Link to="/patients" className="text-sm text-stone-500 hover:text-stone-900">
        <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
      </Link>

      <div className="flex items-center gap-4 mt-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-[#F3E7E4] flex items-center justify-center text-[#B75C46] text-2xl font-heading">
          {p.name?.[0]}
        </div>
        <div>
          <h1 className="font-heading text-3xl font-medium tracking-tight">{p.name}</h1>
          <div className="text-sm text-stone-500 mt-1">
            {p.diagnosis && <span className="px-2 py-0.5 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-medium mr-2">{p.diagnosis}</span>}
            {p.age && <span>{p.age} anos</span>}
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Link to={`/voice-lab?patient_id=${p.patient_id}`}>
            <Button variant="outline" data-testid="open-voice-lab-btn">
              <i className="fa-solid fa-wave-square mr-2"></i> Análise Vocal
            </Button>
          </Link>
          <Button variant="outline" onClick={createInvite} data-testid="invite-patient-btn">
            <i className="fa-solid fa-link mr-2"></i> Convidar paciente
          </Button>
          <Button onClick={() => setMsgOpen(true)} data-testid="draft-message-btn" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <i className="fa-solid fa-comment-dots mr-2"></i> Rascunhar mensagem
          </Button>
        </div>
      </div>

      {inviteLink && (
        <div className="mb-4 bg-[#F3E7E4]/40 border border-[#D46F54]/30 rounded-md p-3 text-xs text-stone-700">
          <span className="font-medium">Link:</span> <code className="text-[#B75C46]">{inviteLink}</code>
        </div>
      )}

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Rascunho de mensagem</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <Select value={msgForm.kind} onValueChange={(v) => setMsgForm({ ...msgForm, kind: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Lembrete de sessão</SelectItem>
                  <SelectItem value="post_session">Pós-sessão</SelectItem>
                  <SelectItem value="pre_consult">Pré-consulta</SelectItem>
                  <SelectItem value="welcome">Boas-vindas</SelectItem>
                  <SelectItem value="follow_up">Reengajamento</SelectItem>
                </SelectContent>
              </Select>
              <Select value={msgForm.channel} onValueChange={(v) => setMsgForm({ ...msgForm, channel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea rows={2} placeholder="Contexto adicional (opcional)" value={msgForm.context} onChange={(e) => setMsgForm({ ...msgForm, context: e.target.value })} />
            <Button data-testid="gen-message-btn" onClick={generateMsg} disabled={msgBusy} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white">
              {msgBusy ? "Gerando…" : "Gerar rascunho"}
            </Button>
            {msgResult && (
              <div className="bg-stone-50 border border-stone-200 rounded-md p-3 text-sm whitespace-pre-wrap">{msgResult.text}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(msgResult.text); toast.success("Copiado"); }}>
                    <i className="fa-solid fa-copy mr-2"></i> Copiar
                  </Button>
                  {msgResult.wa_link && (
                    <a href={msgResult.wa_link} target="_blank" rel="noreferrer">
                      <Button size="sm" className="bg-[#25D366] hover:bg-[#1EAE54] text-white">
                        <i className="fa-brands fa-whatsapp mr-2"></i> Abrir WhatsApp
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Contato</div>
          <div className="text-sm space-y-1.5">
            <div><span className="text-stone-500">E-mail:</span> {p.email || "—"}</div>
            <div><span className="text-stone-500">Telefone:</span> {p.phone || "—"}</div>
            <div><span className="text-stone-500">Interesses:</span> {p.interests || "—"}</div>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-6 lg:col-span-2">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Observações clínicas</div>
          <div className="text-sm text-stone-700 whitespace-pre-wrap">{p.notes || "—"}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold">Prontuário recente</div>
            <Link to="/prontuario" className="text-xs text-[#B75C46]">Ver todos →</Link>
          </div>
          {records.length === 0 ? (
            <div className="text-sm text-stone-500 py-6 text-center">Sem registros ainda.</div>
          ) : (
            <div className="space-y-3">
              {records.slice(0, 3).map((r) => (
                <div key={r.record_id} className="border-l-2 border-[#D46F54] pl-3">
                  <div className="text-xs text-stone-500">{r.session_date}</div>
                  <div className="text-sm mt-1 line-clamp-2">{r.subjective || r.assessment}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold">Atividades geradas</div>
            <Link to="/activities" className="text-xs text-[#B75C46]">Ver todas →</Link>
          </div>
          {activities.length === 0 ? (
            <div className="text-sm text-stone-500 py-6 text-center">Nenhuma atividade ainda.</div>
          ) : (
            <div className="space-y-3">
              {activities.slice(0, 3).map((a) => (
                <div key={a.activity_id} className="border-l-2 border-[#6B8E7C] pl-3">
                  <div className="text-xs text-stone-500 capitalize">{a.environment === "clinic" ? "Clínica" : "Home care"}</div>
                  <div className="text-sm mt-1 font-medium line-clamp-1">{a.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
