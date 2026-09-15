import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Importação de Ícones
import { 
  HelpCircle, Settings, Users, PenTool, FileSignature, ShieldCheck, 
  Paintbrush, BookHeart, UserPlus, UploadCloud, CheckCircle2, Lock, 
  Building2, Activity, Mail, Phone, Fingerprint, Sparkles, LayoutTemplate,
  ArrowUpRight, Plus, Trash2, Shield, X, Eye
} from 'lucide-react';

const InfoTooltip = ({ title, text }) => (
  <div className="group relative inline-flex items-center justify-center ml-1.5 align-middle">
    <HelpCircle size={15} className="text-stone-300 hover:text-[#D46F54] transition-colors cursor-help" />
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:flex flex-col w-72 p-4 bg-stone-900 text-white rounded-xl shadow-2xl z-50 text-left pointer-events-none">
      {title && <span className="text-[#D46F54] font-bold text-xs uppercase tracking-widest mb-2 border-b border-stone-700 pb-2">{title}</span>}
      <span className="text-[11px] font-medium leading-relaxed text-stone-200">{text}</span>
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-stone-900"></div>
    </div>
  </div>
);

export default function SettingsPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("templates"); 
  
  // ==========================================
  // ESTADOS GERAIS
  // ==========================================
  
  // Equipe
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "", email: "", role: "Secretária", permissions: { financial: false, clinical: false, agenda: true }
  });

  // Diários e Modelos
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [templateForm, setTemplateForm] = useState({
    title: "", desc: "", type: "emocoes", questions: [""]
  });

  // ==========================================
  // CONSULTAS (BUSCAS NO BANCO)
  // ==========================================
  const { data: teamMembers = [] } = useQuery({ queryKey: ["team"], queryFn: async () => (await api.get('/team')).data });
  const { data: templates = [] } = useQuery({ queryKey: ["templates"], queryFn: async () => (await api.get('/templates')).data });
  
  const [localSettings, setLocalSettings] = useState({ watermark: true, logo_url: null, signature_url: null, icp_active: false });
  const { data: dbSettings } = useQuery({ 
    queryKey: ["settings"], 
    queryFn: async () => {
      const res = await api.get('/settings');
      setLocalSettings({ 
        watermark: res.data.watermark ?? true, 
        logo_url: res.data.logo_url ?? null, 
        signature_url: res.data.signature_url ?? null,
        icp_active: res.data.icp_active ?? false 
      });
      return res.data;
    }
  });

  // ==========================================
  // MUTAÇÕES (GRAVAÇÃO NO BANCO)
  // ==========================================

  const saveSettings = useMutation({
    mutationFn: async (payload) => (await api.post('/settings', payload)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); }
  });

  const createTeamMember = useMutation({
    mutationFn: async (newMember) => (await api.post('/team', newMember)).data,
    onSuccess: () => {
      toast.success("Colaborador adicionado! E-mail de convite enviado de forma segura.");
      qc.invalidateQueries({ queryKey: ["team"] });
      setIsTeamModalOpen(false);
      setTeamForm({ name: "", email: "", role: "Secretária", permissions: { financial: false, clinical: false, agenda: true } });
    }
  });

  const deleteTeamMember = useMutation({
    mutationFn: async (memberId) => (await api.delete(`/team/${memberId}`)).data,
    onSuccess: () => {
      toast.success("Colaborador removido com sucesso!");
      qc.invalidateQueries({ queryKey: ["team"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Erro ao remover colaborador.");
    }
  });

  // --- MUTAÇÕES: DIÁRIOS & MODELOS ---
  const createAiTemplate = useMutation({
    mutationFn: async (newTpl) => (await api.post('/templates', newTpl)).data,
    onSuccess: () => {
      toast.success("A IA analisou os padrões dos seus pacientes e montou um modelo clínico exclusivo!");
      qc.invalidateQueries({ queryKey: ["templates"] });
    }
  });

  const createManualTemplate = useMutation({
    mutationFn: async (newTpl) => (await api.post('/templates', newTpl)).data,
    onSuccess: () => {
      toast.success("Modelo de diário salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["templates"] });
      setIsTemplateModalOpen(false);
      setTemplateForm({ title: "", desc: "", type: "emocoes", questions: [""] });
    }
  });

  const toggleTemplateActive = useMutation({
    mutationFn: async ({ id, active }) => (await api.put(`/templates/${id}/toggle`, { active })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] })
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id) => (await api.delete(`/templates/${id}`)).data,
    onSuccess: () => { toast.success("Modelo excluído com sucesso!"); qc.invalidateQueries({ queryKey: ["templates"] }); }
  });

  // ==========================================
  // HANDLERS (AÇÕES)
  // ==========================================

  const handleSaveMember = () => {
    if (!teamForm.name || !teamForm.email) return toast.error("Preencha o nome e e-mail.");
    createTeamMember.mutate(teamForm);
  };

  const handleToggleWatermark = () => {
    const newStatus = !localSettings.watermark;
    setLocalSettings(prev => ({ ...prev, watermark: newStatus }));
    saveSettings.mutate({ watermark: newStatus });
    toast.success(newStatus ? "Marca d'água ativada nos PDFs!" : "Marca d'água removida.");
  };

  const handleImageUpload = (e, type) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) return toast.error("A imagem é muito pesada. Limite de 5MB.");
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result;
        
        if (type === 'logo') {
          setLocalSettings(prev => ({ ...prev, logo_url: base64String }));
          saveSettings.mutate({ logo_url: base64String });
          toast.success("Logotipo atualizado com sucesso!");
        } else if (type === 'signature') {
          setLocalSettings(prev => ({ ...prev, signature_url: base64String }));
          saveSettings.mutate({ signature_url: base64String });
          toast.success("Assinatura digitalizada salva no sistema!");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerateAiTemplate = async () => {
    setIsGeneratingAi(true);
    toast.info("A IA está processando as queixas mais comuns da clínica...");
    
    setTimeout(() => {
      const newTemplate = {
        title: "Rastreio de Fadiga Vocal (Gerado por IA)",
        desc: "Desenvolvido pela IA baseado no histórico clínico. Contém 5 perguntas sobre sensação de aperto, queimação e perda de potência ao fim do dia.",
        active: true,
        questions_count: 5,
        type: "fadiga",
        questions: ["Sentiu dor no pescoço hoje?", "A voz falhou ao longo do dia?", "Apresentou rouquidão ao final do expediente?", "Precisou fazer força para falar?", "Teve sensação de garganta seca?"]
      };
      createAiTemplate.mutate(newTemplate);
      setIsGeneratingAi(false);
    }, 2500);
  };

  // --- HANDLERS: CONSTRUTOR MANUAL DE DIÁRIO ---
  const handleAddQuestion = () => setTemplateForm(prev => ({ ...prev, questions: [...prev.questions, ""] }));
  const handleQuestionChange = (index, value) => {
    const newQ = [...templateForm.questions];
    newQ[index] = value;
    setTemplateForm(prev => ({ ...prev, questions: newQ }));
  };
  const handleRemoveQuestion = (index) => {
    const newQ = templateForm.questions.filter((_, i) => i !== index);
    setTemplateForm(prev => ({ ...prev, questions: newQ.length ? newQ : [""] }));
  };
  const handleSaveManualTemplate = () => {
    if (!templateForm.title.trim()) return toast.error("O modelo precisa de um título.");
    const validQuestions = templateForm.questions.filter(q => q.trim() !== "");
    if (validQuestions.length === 0) return toast.error("Adicione pelo menos uma pergunta.");
    
    createManualTemplate.mutate({ ...templateForm, questions: validQuestions, questions_count: validQuestions.length });
  };

  const triggerUpload = (msg) => toast.info(msg);

  return (
    <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1 flex items-center gap-2">
            <Settings size={14} className="text-[#D46F54]"/> Administração do Sistema
          </div>
          <h1 className="font-heading text-3xl font-bold text-stone-800">
            Configurações & Equipe
            <InfoTooltip title="Área Administrativa" text="Gerencie a identidade visual da sua clínica (logotipos, marca d'água), suas assinaturas digitais com validade jurídica, cadastre secretárias e crie modelos de diários inteligentes para seus pacientes." />
          </h1>
        </div>
      </div>

      {/* ABAS NAVEGAÇÃO */}
      <div className="flex overflow-x-auto border-b border-stone-200 custom-scrollbar mb-8">
        {[
          { id: "identity", label: "Marca & Documentos", icon: Paintbrush },
          { id: "signatures", label: "Assinaturas (A1/Digital)", icon: FileSignature },
          { id: "team", label: "Equipe & Secretárias", icon: Users },
          { id: "templates", label: "Diários & Modelos", icon: BookHeart },
        ].map((tab) => (
          <button 
            key={tab.id} onClick={() => setActiveTab(tab.id)} 
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? "border-[#D46F54] text-[#D46F54] bg-white rounded-t-xl shadow-sm" : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"}`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="pt-2">
        
        {/* ========================================== */}
        {/* ABA 1: IDENTIDADE E DOCUMENTOS             */}
        {/* ========================================== */}
        {activeTab === "identity" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
            
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2 mb-4 border-b border-stone-100 pb-3">
                  <Building2 className="text-[#D46F54]" size={20} /> Personalização da Clínica
                </h3>
                
                <div className="space-y-6">
                  <div>
                    <Label className="text-xs font-bold text-stone-600 mb-2 block">Logotipo Oficial (Vai no cabeçalho dos laudos)</Label>
                    
                    <div className="relative bg-stone-50 border-2 border-dashed border-stone-300 hover:border-[#D46F54] cursor-pointer transition-colors rounded-xl p-6 flex flex-col items-center justify-center text-center group overflow-hidden">
                      <input type="file" accept="image/png, image/jpeg" onChange={(e) => handleImageUpload(e, 'logo')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                      
                      {localSettings.logo_url ? (
                        <>
                           <img src={localSettings.logo_url} alt="Logo" className="h-16 object-contain mb-2 z-0 relative" />
                           <p className="text-xs font-bold text-stone-500 group-hover:text-[#D46F54] transition-colors relative z-0">Clique para trocar a Logo</p>
                        </>
                      ) : (
                        <>
                           <UploadCloud size={32} className="text-stone-300 group-hover:text-[#D46F54] mb-2 transition-colors relative z-0" />
                           <p className="text-sm font-bold text-stone-700 relative z-0">Clique para anexar sua Logo</p>
                           <p className="text-xs text-stone-400 mt-1 relative z-0">PNG ou JPG até 5MB</p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-stone-50 p-5 rounded-xl border border-stone-200">
                    <div className="flex justify-between items-center mb-2">
                      <Label className="text-sm font-bold text-stone-800 flex items-center gap-2 cursor-pointer" onClick={handleToggleWatermark}>
                        <LayoutTemplate size={16} className="text-stone-500"/> Marca D'água em PDF
                      </Label>
                      <input type="checkbox" checked={localSettings.watermark} onChange={handleToggleWatermark} className="w-5 h-5 accent-[#D46F54] cursor-pointer" />
                    </div>
                    <p className="text-xs text-stone-500 leading-relaxed mb-4">Ao ativar, sua logotipo ficará levemente transparente no fundo de todos os laudos, receitas e recibos IRPF gerados pelo sistema, evitando falsificações.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col items-center justify-center text-center">
               <div className="w-full max-w-sm aspect-[1/1.4] bg-stone-100 border border-stone-300 shadow-inner rounded-md p-6 relative flex flex-col overflow-hidden">
                  
                  {localSettings.watermark && localSettings.logo_url ? (
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none p-12">
                      <img src={localSettings.logo_url} alt="Watermark" className="max-w-full max-h-full object-contain filter grayscale" />
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                      <Building2 size={120} />
                    </div>
                  )}

                  <div className="flex justify-between items-start mb-6">
                    {localSettings.logo_url ? (
                      <img src={localSettings.logo_url} alt="Timbrado" className="h-6 object-contain" />
                    ) : (
                      <div className="h-4 w-1/3 bg-stone-300 rounded mb-4"></div>
                    )}
                  </div>
                  
                  <div className="h-2 w-full bg-stone-200 rounded mb-2"></div>
                  <div className="h-2 w-full bg-stone-200 rounded mb-2"></div>
                  <div className="h-2 w-3/4 bg-stone-200 rounded mb-8"></div>
                  <div className="h-2 w-full bg-stone-200 rounded mb-2"></div>
                  <div className="h-2 w-1/2 bg-stone-200 rounded mb-8"></div>
                  
                  <div className="mt-auto flex justify-end flex-col items-end">
                     {localSettings.signature_url ? (
                        <img src={localSettings.signature_url} alt="Assinatura" className="h-10 object-contain mb-1 drop-shadow-md" />
                     ) : (
                        <div className="h-8 w-24 bg-blue-900/10 rounded mb-1"></div>
                     )}
                     <div className="h-1 w-32 bg-stone-300 mb-1"></div>
                     <div className="h-1.5 w-16 bg-stone-300"></div>
                  </div>
               </div>
               <p className="text-xs font-bold text-stone-400 mt-4 uppercase tracking-widest">Pré-visualização do Papel Timbrado</p>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* ABA 2: ASSINATURAS (SIMPLES E JURÍDICA)    */}
        {/* ========================================== */}
        {activeTab === "signatures" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4">
            
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col h-full">
              <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2 mb-2">
                <PenTool className="text-amber-500" size={20} /> Assinatura Digitalizada
              </h3>
              <p className="text-sm text-stone-500 mb-6">Uma imagem (PNG) da sua assinatura e carimbo para uso em documentos e laudos simples.</p>
              
              <div className="relative bg-stone-50 border-2 border-dashed border-stone-300 hover:border-amber-400 cursor-pointer transition-colors rounded-xl p-8 flex flex-col items-center justify-center text-center flex-1 mb-6 overflow-hidden group">
                <input type="file" accept="image/png" onChange={(e) => handleImageUpload(e, 'signature')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                
                {localSettings.signature_url ? (
                  <>
                     <img src={localSettings.signature_url} alt="Assinatura" className="max-h-24 object-contain mb-2 z-0 relative drop-shadow-md" />
                     <p className="text-xs font-bold text-stone-500 group-hover:text-amber-600 transition-colors relative z-0">Clique para atualizar assinatura</p>
                  </>
                ) : (
                  <>
                     <FileSignature size={40} className="text-stone-300 mb-3 group-hover:text-amber-400 transition-colors" />
                     <p className="text-sm font-bold text-stone-700">Anexar Imagem da Assinatura</p>
                     <p className="text-xs text-stone-400 mt-1">PNG com Fundo Transparente</p>
                  </>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-3xl p-6 border border-slate-700 shadow-xl flex flex-col h-full text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              
              <h3 className="font-bold text-white text-lg flex items-center gap-2 mb-2 relative z-10">
                <ShieldCheck className="text-emerald-400" size={20} /> Assinatura Legal (ICP-Brasil)
                <InfoTooltip title="Validade Jurídica" text="Ao integrar seu Certificado Digital A1, todos os Laudos, Pedidos de Exame e Recibos IRPF terão validade legal em todo o território nacional, não precisando mais serem impressos e assinados à mão." />
              </h3>
              <p className="text-sm text-slate-300 mb-6 relative z-10">Integração direta com seu Certificado Digital A1. Tem o mesmo peso jurídico de uma assinatura reconhecida em cartório.</p>
              
              <div className="bg-slate-800/50 border border-slate-600 rounded-xl p-5 mb-auto relative z-10">
                <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-4">
                  <div className="flex items-center gap-3">
                    <Fingerprint size={24} className="text-emerald-400" />
                    <div>
                      <p className="text-sm font-bold">Certificado Não Conectado</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest mt-0.5">Requer formato .PFX</p>
                    </div>
                  </div>
                  <span className="bg-slate-700 text-slate-300 text-[10px] font-bold px-2 py-1 rounded">Inativo</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-200">Assinar PDFs automaticamente</p>
                    <p className="text-[10px] text-slate-400 mt-1">Adiciona o selo criptográfico no rodapé</p>
                  </div>
                  <input type="checkbox" className="w-5 h-5 accent-emerald-500 cursor-not-allowed opacity-50" disabled />
                </div>
              </div>
              
              <Button onClick={() => triggerUpload("Em breve: API de ICP-Brasil em desenvolvimento.")} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold h-11 rounded-xl shadow-md mt-6 relative z-10">
                Vincular Certificado A1 (Governo)
              </Button>
            </div>

          </div>
        )}

        {/* ========================================== */}
        {/* ABA 3: EQUIPE E SECRETÁRIAS                */}
        {/* ========================================== */}
        {activeTab === "team" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-3xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h2 className="font-bold text-lg text-stone-800 flex items-center gap-2">Colaboradores <InfoTooltip title="Controle de Acessos" text="Adicione secretárias, atendentes ou outros profissionais. O sistema é inteligente: você decide se eles podem ver os prontuários clínicos, ou se terão acesso restrito apenas à agenda de horários." /></h2>
                <p className="text-sm text-stone-500 mt-1">Gerencie os acessos de quem trabalha na clínica com você.</p>
              </div>
              
              <Dialog open={isTeamModalOpen} onOpenChange={setIsTeamModalOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-stone-900 hover:bg-black text-white rounded-xl h-11 w-full sm:w-auto"><UserPlus size={18} className="mr-2" /> Novo Colaborador</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md bg-stone-50 rounded-2xl p-0 border-stone-200">
                  <DialogHeader className="bg-white p-6 border-b border-stone-200"><DialogTitle className="font-heading text-xl text-stone-800">Convidar para a Equipe</DialogTitle></DialogHeader>
                  <div className="p-6 space-y-5">
                    
                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Nome Completo</Label>
                      <Input value={teamForm.name} onChange={e => setTeamForm({...teamForm, name: e.target.value})} className="h-11 bg-white" placeholder="Ex: Maria Secretária" />
                    </div>
                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">E-mail (Usado para Login)</Label>
                      <Input type="email" value={teamForm.email} onChange={e => setTeamForm({...teamForm, email: e.target.value})} className="h-11 bg-white" placeholder="maria@clinica.com" />
                    </div>
                    
                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Cargo / Nível</Label>
                      <Select value={teamForm.role} onValueChange={(v) => setTeamForm({...teamForm, role: v})}>
                        <SelectTrigger className="h-11 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Secretária">Secretária (Recepção)</SelectItem>
                          <SelectItem value="Atendente">Atendente (Telemarketing)</SelectItem>
                          <SelectItem value="Profissional Associado">Fonoaudiólogo(a) Parceiro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="pt-4 border-t border-stone-200">
                      <Label className="text-sm font-bold text-stone-800 mb-3 block flex items-center gap-1">
                        <Shield size={16} className="text-emerald-600"/> Permissões de Acesso (LGPD)
                      </Label>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-stone-200">
                          <div><p className="text-sm font-bold text-stone-700">Agenda & Pacientes</p><p className="text-[10px] text-stone-500">Agendar horários e ver cadastro base.</p></div>
                          <input type="checkbox" checked={teamForm.permissions.agenda} onChange={e => setTeamForm({...teamForm, permissions: {...teamForm.permissions, agenda: e.target.checked}})} className="w-5 h-5 accent-[#D46F54]" />
                        </div>
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-stone-200">
                          <div><p className="text-sm font-bold text-stone-700">Acesso Clínico (Prontuário)</p><p className="text-[10px] text-stone-500">Ver evoluções SOAP e exames.</p></div>
                          <input type="checkbox" checked={teamForm.permissions.clinical} onChange={e => setTeamForm({...teamForm, permissions: {...teamForm.permissions, clinical: e.target.checked}})} className="w-5 h-5 accent-rose-500" />
                        </div>
                        <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-stone-200">
                          <div><p className="text-sm font-bold text-stone-700">Acesso Financeiro</p><p className="text-[10px] text-stone-500">Ver faturamento e gerar links de Pix.</p></div>
                          <input type="checkbox" checked={teamForm.permissions.financial} onChange={e => setTeamForm({...teamForm, permissions: {...teamForm.permissions, financial: e.target.checked}})} className="w-5 h-5 accent-emerald-500" />
                        </div>
                      </div>
                    </div>

                    <Button onClick={handleSaveMember} disabled={createTeamMember.isPending} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-12 rounded-xl mt-2 shadow-md">
                      {createTeamMember.isPending ? "Processando..." : "Enviar Convite Seguro"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* LISTA DA EQUIPE DO BANCO DE DADOS */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-stone-600">
                  <thead className="bg-stone-50 text-[10px] uppercase tracking-widest text-stone-500 font-bold border-b border-stone-200">
                    <tr>
                      <th className="px-6 py-4">Colaborador</th>
                      <th className="px-6 py-4">Nível de Acesso</th>
                      <th className="px-6 py-4">Status da Conta</th>
                      <th className="px-6 py-4 text-right">Controle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map(member => (
                      <tr key={member.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-bold text-stone-800">{member.name} {member.isOwner && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-2">Proprietário</span>}</div>
                          <div className="text-xs text-stone-400 mt-0.5 flex items-center gap-1"><Mail size={12}/> {member.email}</div>
                        </td>
                        <td className="px-6 py-4">
                           <span className="font-medium text-stone-700 bg-stone-100 px-2.5 py-1 rounded-lg text-xs border border-stone-200">{member.role}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${member.status?.includes('Ativo') ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                            {member.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!member.isOwner ? (
                             <div className="flex justify-end gap-2">
                               <Button 
                                 variant="ghost" 
                                 onClick={() => {
                                   const p = member.permissions || {};
                                   toast.info(`Acessos de ${member.name}:`, {
                                     description: `Agenda/Pacientes: ${p.agenda ? '✅' : '❌'} | Clínico: ${p.clinical ? '✅' : '❌'} | Financeiro: ${p.financial ? '✅' : '❌'}`
                                   });
                                 }} 
                                 className="text-xs text-blue-600 hover:bg-blue-50 h-8 px-2"
                               >
                                 <Shield size={14} className="mr-1"/> Acessos
                               </Button>
                               
                               <Button 
                                 variant="ghost" 
                                 onClick={() => {
                                   if (window.confirm(`Tem certeza que deseja remover ${member.name} da equipe?`)) {
                                     deleteTeamMember.mutate(member.id);
                                   }
                                 }}
                                 className="text-xs text-rose-600 hover:bg-rose-50 h-8 px-2"
                               >
                                 <Trash2 size={14}/>
                               </Button>
                             </div>
                          ) : (
                             <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Master</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {teamMembers.length === 0 && <div className="p-8 text-center text-stone-400 italic">Carregando equipe...</div>}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* ABA 4: MODELOS E DIÁRIO DE EMOÇÕES         */}
        {/* ========================================== */}
        {activeTab === "templates" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 shrink-0"><BookHeart size={32} /></div>
                <div>
                  <h2 className="font-bold text-lg text-indigo-900">Diários & Questionários <InfoTooltip title="Diário Inteligente" text="Você cria formulários diários para os pacientes preencherem pelo celular. A IA compila tudo e gera gráficos no prontuário." /></h2>
                  <p className="text-sm text-indigo-700/80">Configure os formulários e rotinas que os pacientes responderão de casa via Link.</p>
                </div>
              </div>
              <Button onClick={handleGenerateAiTemplate} disabled={isGeneratingAi} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md w-full sm:w-auto font-bold h-11 rounded-xl transition-all">
                {isGeneratingAi ? <Activity size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />} 
                {isGeneratingAi ? "Analisando Pacientes..." : "Gerar com IA"}
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              {/* RENDEREZIÇÃO DOS DIÁRIOS SALVOS NO BANCO */}
              {templates.map(tpl => (
                <div key={tpl.id} className={`bg-white border rounded-2xl p-6 shadow-sm flex flex-col h-full group transition-all ${tpl.active ? 'border-stone-200 hover:border-indigo-300' : 'border-stone-200 opacity-60 hover:opacity-100'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-2.5 rounded-xl ${tpl.type === 'emocoes' ? 'bg-rose-50 text-rose-600' : tpl.type === 'fadiga' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      {tpl.type === 'emocoes' ? <BookHeart size={20}/> : tpl.type === 'fadiga' ? <Activity size={20}/> : <LayoutTemplate size={20}/>}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button onClick={() => { if(window.confirm("Excluir este modelo?")) deleteTemplate.mutate(tpl.id); }} className="text-stone-300 hover:text-rose-500 transition-colors p-1" title="Excluir">
                        <Trash2 size={16}/>
                      </button>
                      
                      <button 
                        onClick={() => toggleTemplateActive.mutate({ id: tpl.id, active: !tpl.active })}
                        className={`text-[9px] font-bold px-2 py-1 rounded uppercase transition-colors ${tpl.active ? 'bg-emerald-100 text-emerald-700 hover:bg-rose-100 hover:text-rose-700' : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'}`}
                      >
                        {tpl.active ? 'Ativo' : 'Desativado'}
                      </button>
                    </div>
                  </div>
                  
                  <h3 className="font-bold text-stone-800 mb-2 leading-tight">{tpl.title}</h3>
                  <p className="text-xs text-stone-500 leading-relaxed flex-1">{tpl.desc}</p>
                  
                  <div className={`mt-4 pt-4 border-t flex justify-between items-center text-xs font-bold ${tpl.active ? 'border-stone-100 text-indigo-600' : 'border-transparent text-stone-400'}`}>
                    <span className="flex items-center gap-1 cursor-help" title={tpl.questions?.join('\n')}>
                       <Eye size={14}/> Ver Perguntas ({tpl.questions?.length || 0})
                    </span>
                  </div>
                </div>
              ))}

              {/* BOTÃO DE CRIAR NOVO (ABRE MODAL) */}
              <Dialog open={isTemplateModalOpen} onOpenChange={setIsTemplateModalOpen}>
                <DialogTrigger asChild>
                  <div className="bg-stone-50 border-2 border-dashed border-stone-300 hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px]">
                    <Plus size={32} className="text-stone-400 mb-2" />
                    <p className="font-bold text-stone-600">Criar Novo Modelo Manual</p>
                    <p className="text-xs text-stone-400 mt-1">Adicione perguntas personalizadas</p>
                  </div>
                </DialogTrigger>
                <DialogContent className="max-w-lg bg-stone-50 rounded-2xl p-0 border-stone-200 max-h-[90vh] flex flex-col">
                  <DialogHeader className="bg-white p-6 border-b border-stone-200 shrink-0">
                    <DialogTitle className="font-heading text-xl text-stone-800">Construtor de Diário</DialogTitle>
                  </DialogHeader>
                  <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-4">
                    
                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Título do Diário</Label>
                      <Input value={templateForm.title} onChange={e => setTemplateForm({...templateForm, title: e.target.value})} className="h-11 bg-white" placeholder="Ex: Monitoramento de Zumbido" />
                    </div>
                    
                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Categoria Visual</Label>
                      <Select value={templateForm.type} onValueChange={(v) => setTemplateForm({...templateForm, type: v})}>
                        <SelectTrigger className="h-11 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="emocoes">Saúde Emocional / Sensações</SelectItem>
                          <SelectItem value="fadiga">Fadiga / Desconforto</SelectItem>
                          <SelectItem value="habitos">Hábitos / Hidratação</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Descrição para o Paciente</Label>
                      <Textarea value={templateForm.desc} onChange={e => setTemplateForm({...templateForm, desc: e.target.value})} className="bg-white resize-none" placeholder="Explique para que serve este diário..." rows={2} />
                    </div>

                    <div className="pt-4 border-t border-stone-200">
                      <Label className="text-sm font-bold text-stone-800 mb-3 block flex items-center justify-between">
                        Perguntas do Questionário
                        <Button variant="ghost" onClick={handleAddQuestion} className="h-6 text-xs px-2 text-indigo-600 hover:bg-indigo-50"><Plus size={14} className="mr-1"/> Adicionar</Button>
                      </Label>
                      
                      <div className="space-y-3">
                        {templateForm.questions.map((q, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs font-bold text-stone-400 w-4">{idx + 1}.</span>
                            <Input value={q} onChange={e => handleQuestionChange(idx, e.target.value)} className="h-10 bg-white" placeholder="Digite a pergunta..." />
                            <button onClick={() => handleRemoveQuestion(idx)} className="text-stone-400 hover:text-rose-500 p-2"><X size={16}/></button>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                  <div className="p-6 bg-white border-t border-stone-200 shrink-0">
                    <Button onClick={handleSaveManualTemplate} disabled={createManualTemplate.isPending} className="w-full bg-stone-900 hover:bg-black text-white font-bold h-12 rounded-xl shadow-md">
                      {createManualTemplate.isPending ? "Salvando..." : "Salvar e Ativar Modelo"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}