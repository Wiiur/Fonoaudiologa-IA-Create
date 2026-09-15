import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { 
  Calendar, Mic, BookHeart, User, Download, Play, 
  CheckCircle2, ChevronRight, Activity, Bell, LayoutTemplate,
  LogOut, Settings, X, AudioLines, BellRing, Smartphone, MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function PatientPortal() {
  const { user, logout } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("home");
  
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedDiary, setSelectedDiary] = useState(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [diaryAnswers, setDiaryAnswers] = useState({});
  const [notifSettings, setNotifSettings] = useState({
    whatsapp: true, sessionReminders: true, diaryAlerts: true, vocalTips: false
  });

  const [showInstallPrompt, setShowInstallPrompt] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallPrompt(true);
    });
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setShowInstallPrompt(false);
      setDeferredPrompt(null);
    } else {
      toast.info("Para instalar o app", { description: "Toque nos 3 pontinhos do Chrome e selecione 'Adicionar à tela inicial'." });
    }
  };

  const { data: dashboardData, isLoading } = useQuery({
    queryKey: ["patient_portal_dashboard"],
    queryFn: async () => (await api.get("/portal/dashboard")).data
  });

  // Sincroniza dados do banco com a tela
  useEffect(() => {
    if (dashboardData) {
      let count = (dashboardData.nextSession ? 1 : 0) + (dashboardData.diaries?.length || 0);
      const lastRead = localStorage.getItem("@vox_notif_read");
      if (!lastRead || parseInt(lastRead) < count) setUnreadNotifications(count);
      
      // Carrega as configs que vieram do banco
      if (dashboardData.settings && Object.keys(dashboardData.settings).length > 0) {
        setNotifSettings(dashboardData.settings);
      }
    }
  }, [dashboardData]);

  const completeActivity = useMutation({
    mutationFn: async (activity) => await api.post('/portal/activities/complete', { activity_id: activity.id, title: activity.title }),
    onSuccess: () => { toast.success("Treino registrado! O doutor será avisado."); setSelectedActivity(null); }
  });

  const submitDiary = useMutation({
    mutationFn: async (diary) => await api.post('/portal/diaries/submit', { diary_id: diary.id, title: diary.title, answers: diaryAnswers }),
    onSuccess: () => { toast.success("Respostas enviadas com sucesso para a IA!"); setSelectedDiary(null); setDiaryAnswers({}); }
  });

  // 🚀 A NOVA LÓGICA DE SALVAMENTO (Atualização Imediata no Cache)
  const saveSettings = useMutation({
    mutationFn: async (settings) => await api.post('/portal/settings', settings),
    onSuccess: (_, variables) => {
      toast.success("Preferências salvas com sucesso!");
      
      // Forçamos o aplicativo a gravar a nova configuração na memória na mesma hora!
      qc.setQueryData(["patient_portal_dashboard"], (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, settings: variables };
      });
      
      setIsSettingsOpen(false);
    },
    onError: () => toast.error("Ocorreu um erro ao salvar as configurações no servidor.")
  });

  const handleOpenNotifications = () => {
    setIsNotificationsOpen(true);
    setUnreadNotifications(0); 
    const totalCurrent = (dashboardData?.nextSession ? 1 : 0) + (dashboardData?.diaries?.length || 0);
    localStorage.setItem("@vox_notif_read", totalCurrent.toString());
  };

  const getInitial = (name) => name ? name.charAt(0).toUpperCase() : "P";
  const formatSessionDate = (dateString) => {
    if (!dateString) return "Data a definir";
    const date = new Date(dateString);
    const dataFormatada = date.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
    return `${dataFormatada.charAt(0).toUpperCase() + dataFormatada.slice(1)} · ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  if (isLoading) return <div className="min-h-screen bg-stone-50 flex items-center justify-center flex-col gap-4"><Activity size={32} className="text-[#D46F54] animate-pulse" /><p className="text-stone-500 text-sm font-bold animate-pulse">Sincronizando seus dados...</p></div>;

  const { patient, nextSession, diaries, activities } = dashboardData || {};

  return (
    <div className="min-h-screen bg-stone-50 pb-24 font-sans animate-in fade-in duration-500 relative">
      
      {showInstallPrompt && (
        <div className="bg-[#D46F54] text-white px-4 py-3 flex items-center justify-between shadow-md relative z-50">
          <div className="flex items-center gap-3"><div className="bg-white p-1.5 rounded-lg text-[#D46F54]"><Download size={18} /></div><div className="text-sm"><p className="font-bold">Instalar Aplicativo</p><p className="text-[10px] opacity-90">Acesso rápido na tela inicial</p></div></div>
          <button onClick={handleInstallApp} className="bg-white text-[#D46F54] text-xs font-bold px-3 py-1.5 rounded-full shadow-sm">Instalar</button>
        </div>
      )}

      {activeTab === "home" && (
        <header className="bg-white px-6 py-5 rounded-b-[2rem] shadow-sm mb-6 relative animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 rounded-full bg-[#F3E7E4] flex items-center justify-center text-[#D46F54] font-bold text-lg shadow-sm">{getInitial(patient?.first_name)}</div>
               <div><h1 className="text-base font-bold text-stone-800">Olá, {patient?.first_name || "Paciente"}! 👋</h1><p className="text-[10px] text-stone-500 uppercase tracking-widest mt-0.5">Sua jornada vocal</p></div>
            </div>
            <button onClick={handleOpenNotifications} className="relative p-2 text-stone-400 hover:text-[#D46F54] transition-colors bg-stone-50 hover:bg-[#F3E7E4] rounded-full active:scale-95">
               <Bell size={20} />
               {unreadNotifications > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 border-2 border-white rounded-full"></span>}
            </button>
          </div>

          <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
             <div className="absolute top-0 right-0 w-32 h-32 bg-white opacity-5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/4"></div>
             <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1.5">Próxima Sessão</p>
             {nextSession ? (
               <><h2 className="text-xl font-heading font-bold mb-4">{formatSessionDate(nextSession.start_time)}</h2><div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-400/10 w-fit px-3 py-1.5 rounded-full border border-emerald-400/20"><CheckCircle2 size={14} /> Confirmado</div></>
             ) : (
               <><h2 className="text-lg font-heading font-bold mb-4 text-stone-300">Nenhuma sessão marcada</h2><div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-400/10 w-fit px-3 py-1.5 rounded-full border border-amber-400/20">Fale com a recepção</div></>
             )}
          </div>
        </header>
      )}

      <main className="px-6 space-y-6 pt-4">
        {activeTab === "home" && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><Activity size={18} className="text-[#D46F54]" /> Atividades de Hoje</h3>
            {activities && activities.slice(0,1).map((act) => (
              <div key={act.id} onClick={() => setSelectedActivity(act)} className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex items-center justify-between mb-4 hover:border-indigo-300 transition-colors cursor-pointer active:scale-95">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center shrink-0"><Play size={20} className="ml-1" /></div><div><h4 className="text-sm font-bold text-stone-800">{act.title}</h4><p className="text-xs text-stone-500 mt-0.5">{act.desc}</p></div></div><ChevronRight size={20} className="text-stone-300" />
              </div>
            ))}
            {diaries && diaries.length > 0 && (
              <div onClick={() => setActiveTab("diary")} className="bg-rose-50/50 rounded-2xl p-4 shadow-sm border border-rose-100 flex items-center justify-between cursor-pointer active:scale-95 transition-transform group">
                <div className="flex items-center gap-4"><div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-xl flex items-center justify-center shrink-0"><BookHeart size={20} /></div><div><h4 className="text-sm font-bold text-rose-900">Lembrete de Diário</h4><p className="text-xs text-rose-600/80 font-medium mt-0.5">Você tem {diaries.length} questionário(s) pendente(s)</p></div></div><ChevronRight size={20} className="text-rose-300" />
              </div>
            )}
          </div>
        )}

        {activeTab === "activities" && (
           <div className="animate-in fade-in slide-in-from-bottom-4">
             <h2 className="font-heading text-2xl font-bold text-stone-800 mb-1">Seus Treinos</h2>
             <p className="text-xs text-stone-500 mb-6">Exercícios recomendados pela clínica.</p>
             <div className="space-y-4">
               {activities && activities.map((act) => (
                 <div key={act.id} onClick={() => setSelectedActivity(act)} className="bg-white border border-stone-200 rounded-2xl p-4 shadow-sm flex items-center justify-between cursor-pointer active:scale-95 transition-transform">
                   <div className="flex items-center gap-4"><div className="w-12 h-12 bg-indigo-50 text-indigo-500 rounded-xl flex items-center justify-center shrink-0"><AudioLines size={20} /></div><div><h4 className="text-sm font-bold text-stone-800">{act.title}</h4><p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-0.5">{act.desc}</p></div></div><div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center border border-stone-100"><Play size={14} className="text-stone-400 ml-0.5" /></div>
                 </div>
               ))}
             </div>
           </div>
        )}

        {activeTab === "diary" && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
             <div className="bg-[#F3E7E4] rounded-3xl p-6 text-center mb-6 shadow-inner"><div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm text-[#D46F54]"><BookHeart size={32} /></div><h3 className="font-bold text-stone-800 mb-1 text-lg">Diários Clínicos</h3><p className="text-xs text-stone-600 max-w-[250px] mx-auto leading-relaxed">Responda aos questionários para a IA monitorar sua evolução.</p></div>
             <div className="space-y-4">
               {diaries && diaries.length > 0 ? diaries.map((diary) => (
                   <div key={diary.id} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm relative overflow-hidden flex flex-col"><div className={`absolute left-0 top-0 bottom-0 w-1.5 ${diary.type === 'emocoes' ? 'bg-rose-400' : diary.type === 'fadiga' ? 'bg-amber-400' : 'bg-blue-400'}`}></div><div className="flex justify-between items-start mb-2"><h4 className="font-bold text-stone-800 text-sm max-w-[70%]">{diary.title}</h4><span className="bg-rose-100 text-rose-700 text-[9px] font-bold px-2 py-1 rounded uppercase tracking-wider">Pendente</span></div><p className="text-xs text-stone-500 mb-5 leading-relaxed">{diary.desc}</p><Button onClick={() => setSelectedDiary(diary)} className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-xl h-11 text-xs font-bold shadow-md transition-transform hover:scale-[1.02]">Responder Agora ({diary.questions_count || diary.questions?.length || 1} pgtas)</Button></div>
               )) : <div className="text-center p-8 border-2 border-dashed border-stone-200 rounded-2xl"><LayoutTemplate size={32} className="text-stone-300 mx-auto mb-3" /><p className="font-bold text-stone-700 text-sm">Nenhum diário ativo</p></div>}
             </div>
          </div>
        )}

        {activeTab === "profile" && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            <h2 className="font-heading text-2xl font-bold text-stone-800 mb-6">Seu Perfil</h2>
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100 text-center mb-6"><div className="w-20 h-20 rounded-full bg-[#D46F54] text-white flex items-center justify-center font-heading text-3xl font-bold mx-auto mb-4 shadow-lg shadow-[#D46F54]/20">{getInitial(patient?.first_name)}</div><h3 className="font-bold text-stone-800 text-lg">{patient?.name || "Paciente"}</h3><p className="text-xs text-stone-500 mt-1">{patient?.email}</p></div>
            <div className="space-y-3">
              <Button onClick={() => setIsSettingsOpen(true)} variant="outline" className="w-full justify-start h-14 rounded-xl font-bold text-stone-600 border-stone-200 hover:border-[#D46F54] hover:text-[#D46F54] transition-colors"><Settings size={18} className="mr-3" /> Configurações de Notificação</Button>
              <Button onClick={() => logout()} variant="outline" className="w-full justify-start h-14 rounded-xl font-bold text-rose-600 border-rose-100 hover:bg-rose-50 hover:border-rose-200 transition-colors"><LogOut size={18} className="mr-3" /> Sair do Aplicativo</Button>
            </div>
          </div>
        )}
      </main>

      <Dialog open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
        <DialogContent className="max-w-md w-[90vw] bg-white border-stone-200 rounded-[2rem] p-0 overflow-hidden flex flex-col max-h-[85vh] hide-default-close">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50"><h2 className="font-heading text-xl font-bold text-stone-800 flex items-center gap-2"><BellRing size={20} className="text-[#D46F54]" /> Central de Avisos</h2><button onClick={() => setIsNotificationsOpen(false)} className="text-stone-400 hover:text-rose-500 p-2"><X size={20}/></button></div>
          <div className="p-6 overflow-y-auto custom-scrollbar space-y-4 bg-white">
            {nextSession && (<div className="flex gap-4 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl animate-in fade-in slide-in-from-right-4"><div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Calendar size={18}/></div><div><h4 className="text-sm font-bold text-stone-800 mb-1">Consulta Confirmada</h4><p className="text-xs text-stone-600 leading-relaxed">Sua sessão está agendada para {formatSessionDate(nextSession.start_time)}. Te esperamos!</p></div></div>)}
            {diaries && diaries.length > 0 && (<div className="flex gap-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl animate-in fade-in slide-in-from-right-4 delay-75"><div className="w-10 h-10 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center shrink-0"><BookHeart size={18}/></div><div><h4 className="text-sm font-bold text-stone-800 mb-1">Novo Diário Disponível</h4><p className="text-xs text-stone-600 leading-relaxed">A clínica liberou {diaries.length} questionário(s) de rotina para você.</p></div></div>)}
            {!nextSession && (!diaries || diaries.length === 0) && (<div className="text-center p-8"><Bell size={32} className="text-stone-200 mx-auto mb-3" /><p className="text-sm font-bold text-stone-500">Tudo limpo por aqui!</p></div>)}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-md w-[90vw] bg-white border-stone-200 rounded-[2rem] p-0 overflow-hidden flex flex-col max-h-[85vh] hide-default-close">
          <div className="p-6 border-b border-stone-100 flex justify-between items-center bg-stone-50/50"><h2 className="font-heading text-xl font-bold text-stone-800 flex items-center gap-2"><Settings size={20} className="text-[#D46F54]" /> Preferências</h2><button onClick={() => setIsSettingsOpen(false)} className="text-stone-400 hover:text-rose-500 p-2"><X size={20}/></button></div>
          <div className="p-6 overflow-y-auto custom-scrollbar space-y-5 bg-white">
            <p className="text-xs text-stone-500 mb-2">Escolha como prefere ser avisado(a):</p>
            <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100"><div className="flex items-center gap-3"><MessageSquare size={18} className="text-emerald-500" /><div><p className="text-sm font-bold text-stone-800">WhatsApp</p><p className="text-[10px] text-stone-500">Links e lembretes via chat.</p></div></div><input type="checkbox" checked={notifSettings.whatsapp} onChange={e => setNotifSettings({...notifSettings, whatsapp: e.target.checked})} className="w-5 h-5 accent-emerald-500 cursor-pointer" /></div>
            <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100"><div className="flex items-center gap-3"><Calendar size={18} className="text-blue-500" /><div><p className="text-sm font-bold text-stone-800">Lembretes de Sessão</p><p className="text-[10px] text-stone-500">Avisar antes da consulta.</p></div></div><input type="checkbox" checked={notifSettings.sessionReminders} onChange={e => setNotifSettings({...notifSettings, sessionReminders: e.target.checked})} className="w-5 h-5 accent-blue-500 cursor-pointer" /></div>
            <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100"><div className="flex items-center gap-3"><BookHeart size={18} className="text-rose-500" /><div><p className="text-sm font-bold text-stone-800">Alertas de Diários</p><p className="text-[10px] text-stone-500">Notificar novos questionários.</p></div></div><input type="checkbox" checked={notifSettings.diaryAlerts} onChange={e => setNotifSettings({...notifSettings, diaryAlerts: e.target.checked})} className="w-5 h-5 accent-rose-500 cursor-pointer" /></div>
            <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100"><div className="flex items-center gap-3"><Smartphone size={18} className="text-[#D46F54]" /><div><p className="text-sm font-bold text-stone-800">Dicas Vocais Diárias</p><p className="text-[10px] text-stone-500">Receber cuidados da IA.</p></div></div><input type="checkbox" checked={notifSettings.vocalTips} onChange={e => setNotifSettings({...notifSettings, vocalTips: e.target.checked})} className="w-5 h-5 accent-[#D46F54] cursor-pointer" /></div>
          </div>
          <div className="p-5 border-t border-stone-100 bg-white shrink-0">
            <Button onClick={() => saveSettings.mutate(notifSettings)} disabled={saveSettings.isPending} className="w-full bg-stone-900 hover:bg-black text-white font-bold h-12 rounded-xl shadow-md">{saveSettings.isPending ? "Salvando..." : "Salvar Alterações"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedActivity} onOpenChange={() => setSelectedActivity(null)}>
        <DialogContent className="max-w-md w-[90vw] bg-stone-900 border-stone-800 text-white rounded-[2rem] p-6 pt-10 text-center hide-default-close"><button onClick={() => setSelectedActivity(null)} className="absolute top-4 right-4 text-stone-400"><X size={20}/></button><div className="w-16 h-16 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4"><AudioLines size={32} /></div><DialogTitle className="font-heading text-2xl mb-2">{selectedActivity?.title}</DialogTitle><p className="text-xs text-stone-400 mb-8">{selectedActivity?.desc}</p><div className="bg-stone-800 rounded-2xl p-6 mb-8 shadow-inner"><div className="flex items-center justify-center gap-1 h-12 mb-6">{[40, 70, 40, 90, 60, 30, 80, 50, 20].map((h, i) => (<div key={i} className="w-2 bg-indigo-500 rounded-full animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 0.1}s` }}></div>))}</div><Button className="w-16 h-16 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30"><Play size={24} className="ml-1" /></Button></div><Button onClick={() => completeActivity.mutate(selectedActivity)} disabled={completeActivity.isPending} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-14 rounded-xl text-base">{completeActivity.isPending ? "Processando..." : "Marcar como Concluído"}</Button></DialogContent>
      </Dialog>

      <Dialog open={!!selectedDiary} onOpenChange={() => setSelectedDiary(null)}>
        <DialogContent className="max-w-md w-[90vw] bg-white border-stone-200 rounded-[2rem] p-0 overflow-hidden flex flex-col max-h-[85vh] hide-default-close"><div className="bg-[#D46F54] p-6 text-white shrink-0 text-center relative"><button onClick={() => setSelectedDiary(null)} className="absolute top-4 right-4 p-2 bg-black/10 rounded-full backdrop-blur-sm"><X size={16}/></button><BookHeart size={32} className="mx-auto mb-2 opacity-80" /><DialogTitle className="font-heading text-xl">{selectedDiary?.title}</DialogTitle></div><div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">{selectedDiary?.questions?.map((q, idx) => (<div key={idx} className="bg-stone-50 p-4 rounded-2xl border border-stone-100"><p className="text-sm font-bold text-stone-800 mb-3">{idx + 1}. {q}</p><input type="range" min="0" max="10" value={diaryAnswers[idx] || 5} onChange={(e) => setDiaryAnswers({...diaryAnswers, [idx]: e.target.value})} className="w-full accent-[#D46F54] h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer mb-2" /><div className="flex justify-between text-[10px] font-bold text-stone-400 uppercase tracking-widest"><span>Nada ({diaryAnswers[idx] || 5})</span><span>Muito</span></div></div>)) || <p className="text-center text-sm text-stone-500">Nenhuma pergunta cadastrada.</p>}</div><div className="p-5 border-t border-stone-100 shrink-0 bg-white"><Button onClick={() => submitDiary.mutate(selectedDiary)} disabled={submitDiary.isPending} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-14 rounded-xl text-base shadow-md">{submitDiary.isPending ? "Enviando..." : "Enviar Respostas"}</Button></div></DialogContent>
      </Dialog>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 pb-safe pt-2 px-6 flex justify-between items-center z-40 rounded-t-[2rem] shadow-[0_-15px_40px_rgba(0,0,0,0.06)]">
        {[{ id: "home", icon: Calendar, label: "Início" }, { id: "activities", icon: Mic, label: "Treinos" }, { id: "diary", icon: BookHeart, label: "Diários" }, { id: "profile", icon: User, label: "Perfil" }].map((item) => (
          <button key={item.id} onClick={() => setActiveTab(item.id)} className={`flex flex-col items-center p-2 w-16 transition-all duration-300 ${activeTab === item.id ? "text-[#D46F54] -translate-y-1" : "text-stone-400 hover:text-stone-600"}`}>
            <item.icon size={22} strokeWidth={activeTab === item.id ? 2.5 : 2} className="mb-1" /><span className={`text-[9px] font-bold tracking-wide ${activeTab === item.id ? 'opacity-100' : 'opacity-70'}`}>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}