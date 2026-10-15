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
import {
  Users, Calendar, CalendarDays, FileText, AlertTriangle, PieChart,
  ArrowRight, Building2, Video, UserPlus, CalendarPlus, Sparkles,
  Wallet, TrendingUp, CheckCheck, Megaphone, Smartphone, ChevronRight, Mic
} from "lucide-react";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const KPI = ({ label, value, icon: Icon, testid }) => (
  <div data-testid={testid} className="bg-white border border-stone-200 rounded-2xl p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200">
    <div className="flex items-center justify-between">
      <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">{label}</div>
      <div className="w-9 h-9 rounded-xl bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center">
        <Icon size={18} />
      </div>
    </div>
    <div className="font-heading text-4xl font-bold mt-4 text-stone-800 tracking-tight">{value}</div>
  </div>
);

const MetricBar = ({ title, label1, val1, color1, label2, val2, color2 }) => (
  <div className="mb-5 last:mb-0">
    <div className="flex justify-between text-sm font-bold text-stone-700 mb-2">
      <span>{title}</span>
    </div>
    <div className="flex h-3 w-full rounded-full overflow-hidden bg-stone-100 mb-2">
      <div style={{ width: `${val1}%` }} className={color1}></div>
      <div style={{ width: `${val2}%` }} className={color2}></div>
    </div>
    <div className="flex justify-between text-xs font-medium text-stone-500">
      <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${color1}`}></span>{label1}: {val1}%</div>
      <div className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${color2}`}></span>{label2}: {val2}%</div>
    </div>
  </div>
);

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
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
      toast.success("Perfil profissional completo!");
      setProfileOpen(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Erro ao salvar perfil");
    } finally { setSavingProf(false); }
  };

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => (await api.get("/dashboard/stats")).data,
  });

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  return (
    <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in duration-500 bg-stone-50 min-h-screen">
      
      {/* Alerta de Perfil CRFa */}
      {needsProfile && (
        <div className="mb-8 bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="font-heading font-bold text-amber-800">Complete seu perfil profissional</div>
              <div className="text-sm text-amber-700/80 font-medium">Informe seu CRFa para desbloquear todos os recursos clínicos.</div>
            </div>
          </div>
          <Button onClick={() => setProfileOpen(true)} className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl w-full sm:w-auto font-bold">
            Completar agora
          </Button>
        </div>
      )}

      {/* Cabeçalho */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold flex items-center gap-2 mb-2">
            <PieChart size={14} className="text-[#D46F54]" /> Painel Executivo
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-bold tracking-tight text-stone-800">
            {greeting}, {user?.name?.split(" ")[0] || "Doutor(a)"}.
          </h1>
          <p className="text-stone-500 text-sm mt-2 font-medium capitalize">
            {now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </div>

      {/* Linha 1: KPIs Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
        <KPI testid="kpi-patients" label="Pacientes ativos" value={stats?.total_patients ?? "—"} icon={Users} />
        <KPI testid="kpi-today" label="Sessões hoje" value={stats?.appointments_today ?? "—"} icon={Calendar} />
        <KPI testid="kpi-week" label="Próxima semana" value={stats?.appointments_week ?? "—"} icon={CalendarDays} />
        <KPI testid="kpi-records" label="Evoluções SOAP" value={stats?.records_count ?? "—"} icon={FileText} />
      </div>

      {/* Linha 2: Operação Diária + Atalhos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4">
            <div>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-1">Operação Diária</div>
              <h2 className="font-heading text-2xl font-bold text-stone-800 tracking-tight">Sessões de Hoje</h2>
            </div>
            <Link to="/agenda" className="text-sm font-bold text-[#D46F54] hover:text-[#B75C46] transition-colors bg-[#D46F54]/10 px-4 py-2 rounded-lg flex items-center gap-1.5">
              Ver agenda <ArrowRight size={14} />
            </Link>
          </div>
          
          {(stats?.today_list ?? []).length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-stone-400 py-10 bg-stone-50/50 rounded-xl border border-dashed border-stone-200">
              <Calendar size={32} className="mb-3 opacity-40" />
              <p className="text-sm font-medium">Nenhuma sessão programada para hoje.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {stats.today_list.map((apt) => (
                <div key={apt.appointment_id} className="py-4 flex items-center justify-between group hover:bg-stone-50 px-2 rounded-lg transition-colors -mx-2">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-10 rounded-full bg-emerald-500"></div>
                    <div>
                      <div className="font-bold text-stone-800">{apt.patient_name}</div>
                      <div className="text-xs font-medium text-stone-500 flex items-center gap-1.5 mt-1">
                        {apt.mode === "clinic" ? (
                          <><Building2 size={13} className="text-stone-400" /> Presencial</>
                        ) : (
                          <><Video size={13} className="text-indigo-500" /> Teleconsulta</>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm font-bold font-mono bg-stone-100 text-stone-600 px-3 py-1.5 rounded-lg">
                    {formatTime(apt.start)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações Rápidas (Todas apontando para rotas reais do App) */}
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-1">Atalhos</div>
          <h2 className="font-heading text-2xl font-bold text-stone-800 tracking-tight mb-6">Ações Rápidas</h2>
          
          <div className="space-y-3">
            <Link to="/patients" className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition-all group shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><UserPlus size={16} /></div>
                <span className="text-sm font-bold text-stone-700">Pacientes & Prontuários</span>
              </div>
              <ChevronRight size={16} className="text-stone-300 group-hover:text-emerald-500 transition-colors" />
            </Link>
            
            <Link to="/agenda" className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition-all group shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center"><CalendarPlus size={16} /></div>
                <span className="text-sm font-bold text-stone-700">Agendar Sessão</span>
              </div>
              <ChevronRight size={16} className="text-stone-300 group-hover:text-indigo-500 transition-colors" />
            </Link>
            
            {user?.role === "doctor" && (
              <>
                <Link to="/voice-lab" className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition-all group shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><Mic size={16} /></div>
                    <span className="text-sm font-bold text-stone-700">Laboratório Vocal (Praat)</span>
                  </div>
                  <ChevronRight size={16} className="text-stone-300 group-hover:text-amber-500 transition-colors" />
                </Link>
                
                <Link to="/packages" className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-stone-200 bg-white hover:bg-stone-50 hover:border-stone-300 transition-all group shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center"><Wallet size={16} /></div>
                    <span className="text-sm font-bold text-stone-700">Gestão & Faturamento</span>
                  </div>
                  <ChevronRight size={16} className="text-stone-300 group-hover:text-[#B75C46] transition-colors" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Linha 3: Inteligência de Negócio (LGPD) */}
      <div className="mb-6 border-b border-stone-200 pb-4">
        <h2 className="font-heading text-2xl font-bold text-stone-800 flex items-center gap-2">
          <TrendingUp size={22} className="text-[#D46F54]" /> Inteligência de Negócio
        </h2>
        <p className="text-sm text-stone-500 font-medium mt-1">Dados agregados e anonimizados para gestão clínica (Compliance LGPD).</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-8">
        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-stone-800 mb-5 flex items-center gap-2">
            <Users size={16} className="text-stone-400" /> Perfil Demográfico
          </h3>
          <MetricBar title="Público-Alvo" label1="Pediatria" val1={stats?.bi_pediatric_pct ?? 45} color1="bg-sky-400" label2="Adulto" val2={stats?.bi_adult_pct ?? 55} color2="bg-indigo-500" />
          <MetricBar title="Status Geral" label1="Ativos" val1={stats?.bi_active_pct ?? 85} color1="bg-emerald-400" label2="Inativos" val2={stats?.bi_inactive_pct ?? 15} color2="bg-stone-300" />
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-stone-800 mb-5 flex items-center gap-2">
            <Calendar size={16} className="text-stone-400" /> Formato & Assiduidade
          </h3>
          <MetricBar title="Modalidade Preferida" label1="Presencial" val1={stats?.bi_presential_pct ?? 70} color1="bg-[#D46F54]" label2="Online" val2={stats?.bi_online_pct ?? 30} color2="bg-amber-400" />
          <MetricBar title="Assiduidade nas Sessões" label1="Presentes" val1={stats?.bi_presence_pct ?? 90} color1="bg-emerald-400" label2="Faltas" val2={stats?.bi_absence_pct ?? 10} color2="bg-rose-400" />
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-stone-800 mb-5 flex items-center gap-2">
            <Megaphone size={16} className="text-stone-400" /> Origem e Retenção
          </h3>
          <div className="mb-4">
            <div className="flex justify-between text-sm font-bold text-stone-700 mb-3"><span>Canais de Captação</span></div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs font-medium"><span className="text-stone-500">Instagram / Redes</span><span className="font-bold text-stone-700">{stats?.bi_origin_social || "40%"}</span></div>
              <div className="flex justify-between items-center text-xs font-medium"><span className="text-stone-500">Indicação Médica (ORL)</span><span className="font-bold text-stone-700">{stats?.bi_origin_medical || "45%"}</span></div>
              <div className="flex justify-between items-center text-xs font-medium"><span className="text-stone-500">Busca Orgânica</span><span className="font-bold text-stone-700">{stats?.bi_origin_organic || "15%"}</span></div>
            </div>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-bold text-stone-800 mb-5 flex items-center gap-2">
            <Smartphone size={16} className="text-stone-400" /> Engajamento no App
          </h3>
          <div className="flex items-center justify-between bg-stone-50 rounded-xl p-4 mb-3 border border-stone-100">
            <div>
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Adoção do Portal</div>
              <div className="text-xl font-heading font-bold text-stone-800 mt-0.5">{stats?.bi_app_adoption || "68%"}</div>
            </div>
            <TrendingUp size={20} className="text-emerald-500" />
          </div>
          <div className="flex items-center justify-between bg-stone-50 rounded-xl p-4 border border-stone-100">
            <div>
              <div className="text-[10px] uppercase font-bold text-stone-400 tracking-wider">Exercícios Concluídos</div>
              <div className="text-xl font-heading font-bold text-stone-800 mt-0.5">{stats?.bi_app_exercises || "82%"}</div>
            </div>
            <CheckCheck size={20} className="text-indigo-500" />
          </div>
        </div>
      </div>

      {/* Modal Profile CRFa */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="max-w-md bg-stone-50 rounded-2xl">
          <DialogHeader className="bg-white p-5 border-b border-stone-200"><DialogTitle className="font-heading">Perfil profissional CRFa</DialogTitle></DialogHeader>
          <div className="space-y-4 p-5">
            <div>
              <Label className="text-xs font-bold text-stone-600 mb-1 block">Nome profissional completo</Label>
              <Input data-testid="prof-name-input" value={prof.professional_name} onChange={(e) => setProf({ ...prof, professional_name: e.target.value })} className="h-11 bg-white" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <Label className="text-xs font-bold text-stone-600 mb-1 block">Nº CRFa</Label>
                <Input data-testid="prof-crfa-input" placeholder="Ex.: 12345" value={prof.crfa_number} onChange={(e) => setProf({ ...prof, crfa_number: e.target.value })} className="h-11 bg-white" />
              </div>
              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1 block">UF</Label>
                <Select value={prof.crfa_state} onValueChange={(v) => setProf({ ...prof, crfa_state: v })}>
                  <SelectTrigger className="h-11 bg-white"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2">Declaração sob as penas da lei.</p>
            <Button data-testid="save-profile-btn" onClick={saveProfile} disabled={savingProf} className="w-full h-11 bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold rounded-xl mt-2">
              {savingProf ? "Salvando…" : "Salvar Perfil Seguro"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}