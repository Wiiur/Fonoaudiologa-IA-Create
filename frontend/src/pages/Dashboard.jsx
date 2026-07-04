import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const KPI = ({ label, value, icon, testid }) => (
  <div
    data-testid={testid}
    className="bg-white border border-stone-200 rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
  >
    <div className="flex items-center justify-between">
      <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">{label}</div>
      <div className="w-8 h-8 rounded-md bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center">
        <i className={`fa-solid ${icon} text-xs`}></i>
      </div>
    </div>
    <div className="font-heading text-4xl font-medium mt-4 tracking-tight">{value}</div>
  </div>
);

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
};

export default function Dashboard() {
  const { user, checkAuth } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [prof, setProf] = useState({ crfa_number: "", crfa_state: "", professional_name: "" });
  const [savingProf, setSavingProf] = useState(false);
  const needsProfile = user?.role === "doctor" && !user?.crfa_number;

  const saveProfile = async () => {
    setSavingProf(true);
    try {
      await api.patch("/auth/profile", prof);
      await checkAuth();
      toast.success("Perfil profissional completo");
      setProfileOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar");
    } finally { setSavingProf(false); }
  };

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/dashboard/stats")).data,
  });

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="p-8 md:p-10">
      {needsProfile && (
        <div className="mb-6 bg-[#F3E7E4] border border-[#D46F54]/30 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-triangle-exclamation text-[#B75C46]"></i>
            <div>
              <div className="font-heading font-semibold text-sm text-[#B75C46]">Complete seu perfil profissional</div>
              <div className="text-xs text-stone-600">Informe seu CRFa para desbloquear todos os recursos clínicos.</div>
            </div>
          </div>
          <Button data-testid="complete-profile-btn" onClick={() => setProfileOpen(true)} className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
            Completar agora
          </Button>
        </div>
      )}

      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-heading">Perfil profissional CRFa</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs">Nome profissional completo</Label>
              <Input data-testid="prof-name-input" value={prof.professional_name} onChange={(e) => setProf({ ...prof, professional_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nº CRFa</Label>
                <Input data-testid="prof-crfa-input" placeholder="Ex.: 12345" value={prof.crfa_number} onChange={(e) => setProf({ ...prof, crfa_number: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Select value={prof.crfa_state} onValueChange={(v) => setProf({ ...prof, crfa_state: v })}>
                  <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-stone-500">Declaração sob as penas da lei. Verificação KYC por upload de carteira profissional em breve.</p>
            <Button data-testid="save-profile-btn" onClick={saveProfile} disabled={savingProf} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white">
              {savingProf ? "Salvando…" : "Salvar perfil"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="mb-10">
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Painel executivo</div>
        <h1 className="font-heading text-4xl sm:text-5xl font-medium tracking-tight mt-2">
          {greeting}, {user?.name?.split(" ")[0]}.
        </h1>
        <p className="text-stone-500 text-sm mt-2">
          {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KPI testid="kpi-patients" label="Pacientes ativos" value={stats?.total_patients ?? "—"} icon="fa-users" />
        <KPI testid="kpi-today" label="Sessões hoje" value={stats?.appointments_today ?? "—"} icon="fa-calendar-day" />
        <KPI testid="kpi-week" label="Próxima semana" value={stats?.appointments_week ?? "—"} icon="fa-calendar-week" />
        <KPI testid="kpi-records" label="Prontuários" value={stats?.records_count ?? "—"} icon="fa-notes-medical" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Hoje</div>
              <h2 className="font-heading text-xl font-medium tracking-tight mt-1">Sessões agendadas</h2>
            </div>
            <Link
              to="/agenda"
              className="text-sm text-[#B75C46] hover:text-[#9A4B3A] transition-colors"
              data-testid="dashboard-see-agenda"
            >
              Ver agenda completa <i className="fa-solid fa-arrow-right text-xs ml-1"></i>
            </Link>
          </div>
          {(stats?.today_list ?? []).length === 0 ? (
            <div className="text-sm text-stone-500 py-10 text-center border border-dashed border-stone-200 rounded-md">
              Nenhuma sessão hoje. Aproveite para revisar prontuários ou gerar atividades.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {stats.today_list.map((apt) => (
                <div key={apt.appointment_id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{apt.patient_name}</div>
                    <div className="text-xs text-stone-500">{apt.mode === "clinic" ? "Presencial" : "Telehealth"}</div>
                  </div>
                  <div className="text-sm font-mono text-stone-700">{formatTime(apt.start)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 rounded-lg p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Ações rápidas</div>
          <h2 className="font-heading text-xl font-medium tracking-tight mt-1 mb-5">Comece agora</h2>
          <div className="space-y-2">
            <Link
              to="/patients"
              data-testid="quick-new-patient"
              className="flex items-center justify-between px-4 py-3 rounded-md bg-stone-50 hover:bg-[#F3E7E4] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-user-plus text-[#B75C46]"></i>
                <span className="text-sm font-medium">Novo paciente</span>
              </div>
              <i className="fa-solid fa-arrow-right text-xs text-stone-400 group-hover:text-[#B75C46]"></i>
            </Link>
            <Link
              to="/agenda"
              data-testid="quick-new-appointment"
              className="flex items-center justify-between px-4 py-3 rounded-md bg-stone-50 hover:bg-[#F3E7E4] transition-colors group"
            >
              <div className="flex items-center gap-3">
                <i className="fa-solid fa-calendar-plus text-[#B75C46]"></i>
                <span className="text-sm font-medium">Agendar sessão</span>
              </div>
              <i className="fa-solid fa-arrow-right text-xs text-stone-400 group-hover:text-[#B75C46]"></i>
            </Link>
            {user?.role === "doctor" && (
              <>
                <Link
                  to="/activities"
                  data-testid="quick-new-activity"
                  className="flex items-center justify-between px-4 py-3 rounded-md bg-stone-50 hover:bg-[#F3E7E4] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-wand-magic-sparkles text-[#B75C46]"></i>
                    <span className="text-sm font-medium">Gerar atividade IA</span>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xs text-stone-400 group-hover:text-[#B75C46]"></i>
                </Link>
                <Link
                  to="/reports"
                  data-testid="quick-new-report"
                  className="flex items-center justify-between px-4 py-3 rounded-md bg-stone-50 hover:bg-[#F3E7E4] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <i className="fa-solid fa-file-signature text-[#B75C46]"></i>
                    <span className="text-sm font-medium">Novo relatório</span>
                  </div>
                  <i className="fa-solid fa-arrow-right text-xs text-stone-400 group-hover:text-[#B75C46]"></i>
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
