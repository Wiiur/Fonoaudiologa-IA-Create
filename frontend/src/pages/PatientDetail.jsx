import React, { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Activity, Link as LinkIcon, MessageSquare, FileText, User, 
  Phone, Target, Lock, CheckCircle2, XCircle, FileClock, Paperclip, BarChart, 
  UploadCloud, File, Image as ImageIcon, Music, Video, Trash2, Download,
  Folder, FolderPlus, FolderOpen, ChevronRight } from 'lucide-react';

export default function PatientDetail() {
  const { id } = useParams();
  const [activeTab, setActiveTab] = useState("overview");
  const queryClient = useQueryClient(); // Para invalidar queries após ações de atualização
  // Estados para modais e mensagens
  const [msgOpen, setMsgOpen] = useState(false);
  const [msgForm, setMsgForm] = useState({ kind: "reminder", channel: "whatsapp", context: "" });
  const [msgResult, setMsgResult] = useState(null);
  const [msgBusy, setMsgBusy] = useState(false);

  // Estado para o registro selecionado na lista de evoluções
  const [selectedRecord, setSelectedRecord] = useState(null);
  
  // Estado para o Formulário SOAP
  const [soapForm, setSoapForm] = useState({
    attendance: "presente", // presente, falta, cancelado
    subjective: "",
    objective: "",
    assessment: "",
    plan: ""
  });

  // ==========================================
  // ESTADOS E FUNÇÕES DE PASTAS E ANEXOS
  // ==========================================
  const [folders, setFolders] = useState([
    { id: "pasta-1", name: "Videolaringoscopias", date: "2026-08-15" }
  ]);
  const [currentFolder, setCurrentFolder] = useState(null); // null = Raiz
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [attachments, setAttachments] = useState([
    { id: 1, name: "Videolaringoscopia_Agosto.mp4", type: "video/mp4", size: "15 MB", date: "2026-08-15", folderId: "pasta-1" },
    { id: 2, name: "Encaminhamento_Otorrino.pdf", type: "application/pdf", size: "2 MB", date: "2026-08-15", folderId: null }
  ]);
  const [isUploading, setIsUploading] = useState(false);

  // Função para Criar Nova Pasta
  const handleCreateFolder = (e) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    
    const newFolder = {
      id: `pasta-${Date.now()}`,
      name: newFolderName,
      date: new Date().toISOString().split('T')[0]
    };
    
    setFolders(prev => [...prev, newFolder]);
    setNewFolderName("");
    setIsFolderModalOpen(false);
    toast.success("Pasta criada com sucesso!");
  };

  // Função para Upload de Arquivos
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      // Simula um tempo de envio
      await new Promise(resolve => setTimeout(resolve, 1000));
      const newAttachments = files.map((file, index) => ({
        id: Date.now() + index,
        name: file.name,
        type: file.type,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB',
        date: new Date().toISOString().split('T')[0],
        folderId: currentFolder // Vincula o arquivo à pasta atual!
      }));
      setAttachments(prev => [...newAttachments, ...prev]);
      toast.success(`${files.length} arquivo(s) anexado(s)!`);
    } catch { 
      toast.error("Erro no envio."); 
    } finally { 
      setIsUploading(false); 
    }
  };

  // Função para Excluir Anexo
  const handleDeleteAttachment = (id) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
    toast.success("Anexo removido.");
  };

  // Descobrir qual ícone usar
  const getFileIcon = (fileType) => {
    if (fileType.includes('image')) return <ImageIcon size={24} className="text-blue-500" />;
    if (fileType.includes('video')) return <Video size={24} className="text-purple-500" />;
    if (fileType.includes('audio')) return <Music size={24} className="text-amber-500" />;
    if (fileType.includes('pdf')) return <FileText size={24} className="text-rose-500" />;
    return <File size={24} className="text-stone-500" />;
  };

  // 1. Estado para guardar o link gerado
  const [inviteLink, setInviteLink] = useState(null);

  const createInvite = async () => {
    try {
      const { data } = await api.post(`/patients/${id}/invite`, {});
      const full = `${window.location.origin}${data.invite_link}`;
      try { await navigator.clipboard.writeText(full); } catch {}
      setInviteLink(full);
      toast.success("Link de convite copiado");
    } catch { 
      toast.error("Erro ao gerar convite"); 
    }
  };
  
  // Estado para Nota Privada
  const [privateNote, setPrivateNote] = useState("");

  const { data: p } = useQuery({
    queryKey: ["patient", id],
    queryFn: async () => (await api.get(`/patients/${id}`)).data,
  });

  const { data: records = [] } = useQuery({
    queryKey: ["records", id],
    queryFn: async () => (await api.get(`/records?patient_id=${id}`)).data,
  });

  const handleSaveSoap = async (e) => {
    e.preventDefault();
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const payload = { 
        patient_id: id, 
        session_date: today, 
        ...soapForm 
      };

      // RAIO-X: Vai imprimir no console exatamente o que o React está tentando enviar
      console.log("DADOS QUE O REACT ESTÁ ENVIANDO:", payload);

      await api.post('/records', payload);
      
      toast.success("Evolução salva com sucesso!");
      setSoapForm({ attendance: "presente", subjective: "", objective: "", assessment: "", plan: "" });
      queryClient.invalidateQueries({ queryKey: ["records", id] });

    } catch (error) {
      // RAIO-X: Vai imprimir no console exatamente qual campo o Python recusou desta vez
      console.error("O PYTHON RECUSOU POR CAUSA DISSO:", error.response?.data);
      toast.error("Erro ao salvar evolução.");
    }
  };

  const handleSavePrivateNote = async () => {
    try {
      // await api.patch(`/patients/${id}/private-notes`, { note: privateNote });
      toast.success("Nota privada salva com segurança.");
    } catch {
      toast.error("Erro ao salvar nota.");
    }
  };

  if (!p) return (
    <div className="flex items-center justify-center h-screen text-stone-500 animate-pulse font-medium">
      Carregando prontuário...
    </div>
  );

  const calculateAge = (birthDate) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age >= 0 ? age : null;
  };

  const displayAge = p.age ?? calculateAge(p.birth_date);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      
      {/* HEADER DE NAVEGAÇÃO */}
      <Link to="/patients" className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit">
        <ArrowLeft size={20} /> Voltar para lista
      </Link>

      {/* CABEÇALHO FIXO: Dados vitais e Metas */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col md:flex-row gap-6 items-center md:items-start">
        
        {/* Avatar */}
        <div className="relative shrink-0">
          {p.photo_url ? (
            <img src={p.photo_url} alt={p.name} className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center font-bold text-3xl border-4 border-white shadow-md font-heading">
              {p.name?.[0]?.toUpperCase()}
            </div>
          )}
          <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white ${p.status !== 'inactive' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </div>

        {/* Info Vital */}
        <div className="flex-1 text-center md:text-left space-y-2">
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight font-heading">{p.name}</h1>
          <div className="text-sm text-stone-500 flex flex-wrap items-center justify-center md:justify-start gap-3">
            {p.otorrhoea_diagnosis && (
              <span className="px-3 py-1 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-bold">{p.otorrhoea_diagnosis}</span>
            )}
            
            {/* Correção da Idade */}
            <span className="flex items-center gap-1 font-medium">
              <User size={16}/> {displayAge !== null ? `${displayAge} anos` : 'Idade N/I'}
            </span>
            
            <span className="flex items-center gap-1 font-medium"><Phone size={16}/> {p.phone || 'Sem telefone'}</span>
          </div>

          {/* Exibição do Link de Convite Gerado */}
          {inviteLink && (
            <div className="mt-3 bg-[#F3E7E4]/40 border border-[#D46F54]/30 rounded-lg p-3 text-xs text-stone-700 inline-block w-full max-w-md text-left">
              <span className="font-bold">Link de Convite:</span> <code className="text-[#B75C46] select-all">{inviteLink}</code>
            </div>
          )}
          
          {/* Metas Terapêuticas Fixas */}
          <div className="mt-3 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 inline-block w-full max-w-2xl text-left">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-1 flex items-center gap-1">
              <Target size={14} /> Metas Terapêuticas Atuais
            </h4>
            <p className="text-xs text-stone-700 font-medium leading-relaxed">
              {p.goals || "Nenhuma meta definida. Adicione na aba de Visão Geral."}
            </p>
          </div>
        </div>

        {/* Ações Rápidas */}
        <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
          <Link to={`/voice-lab?patient_id=${p.patient_id}`} className="w-full">
            <Button variant="outline" className="w-full justify-start border-stone-300">
              <Activity size={16} className="mr-2 text-[#D46F54]" /> Análise Vocal
            </Button>
          </Link>
          
          {/* Botão de Convidar Paciente Restaurado */}
          <Button variant="outline" onClick={createInvite} className="w-full justify-start border-stone-300">
            <LinkIcon size={16} className="mr-2 text-[#D46F54]" /> Convidar Paciente
          </Button>

          <Button onClick={() => setMsgOpen(true)} className="w-full justify-start bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <MessageSquare size={16} className="mr-2" /> Rascunhar Mensagem
          </Button>
        </div>
      </div>

      {/* BARRA DE NAVEGAÇÃO DAS ABAS (TABS) */}
      <div className="flex overflow-x-auto border-b border-stone-200 custom-scrollbar pb-px">
        {[
          { id: "overview", label: "Visão Geral", icon: FileText },
          { id: "soap", label: "Evoluções (SOAP)", icon: FileClock },
          { id: "activities", label: "Atividades/Desafios", icon: Activity },
          { id: "exams", label: "Exames/Anexos", icon: Paperclip },
          { id: "reports", label: "Relatórios", icon: BarChart },
          { id: "private", label: "Notas Privadas", icon: Lock, isPrivate: true },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${
              activeTab === tab.id 
                ? tab.isPrivate ? "border-rose-500 text-rose-600 bg-rose-50/50" : "border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/30"
                : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"
            }`}
          >
            <tab.icon size={16} /> {tab.label}
            {tab.isPrivate && <Lock size={12} className="ml-1" />}
          </button>
        ))}
      </div>

      {/* CONTEÚDO DAS ABAS */}
      <div className="pt-2">
        
        {/* ABA: VISÃO GERAL */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Informações de Contato</h3>
              <div className="space-y-3 text-sm text-stone-700">
                <p><span className="font-bold">E-mail:</span> {p.email || "Não informado"}</p>
                <p><span className="font-bold">Endereço:</span> {p.address || "Não informado"}</p>
                <p><span className="font-bold">Responsável:</span> {p.has_responsible ? `${p.responsible?.name} (${p.responsible?.relationship})` : "N/A"}</p>
              </div>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Queixa e Contexto</h3>
              <p className="text-sm text-stone-700 italic">"{p.chief_complaint}"</p>
              <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-sm text-stone-700">
                <p><span className="font-bold">Profissão:</span> {p.profession_vocal_demand}</p>
                <p><span className="font-bold">Interesses:</span> {p.interests}</p>
              </div>
            </div>
          </div>
        )}

        {/* ABA: EVOLUÇÕES (SOAP) */}
        {activeTab === "soap" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna do Formulário SOAP */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-stone-800">Nova Evolução Clínica</h3>
                
                {/* Botões de Presença */}
                <div className="flex bg-stone-100 rounded-lg p-1">
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'presente'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${soapForm.attendance === 'presente' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}>
                    <CheckCircle2 size={14} /> Presente
                  </button>
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'falta'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${soapForm.attendance === 'falta' ? 'bg-white shadow-sm text-rose-600' : 'text-stone-500'}`}>
                    <XCircle size={14} /> Faltou
                  </button>
                </div>
              </div>

              {soapForm.attendance === 'presente' ? (
                <form onSubmit={handleSaveSoap} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-[#B75C46] mb-1 block">Subjetivo (S)</label>
                    <Textarea placeholder="Relato do paciente, sensações, queixas do dia..." rows={2} value={soapForm.subjective} onChange={e => setSoapForm({...soapForm, subjective: e.target.value})} className="bg-stone-50 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-blue-700 mb-1 block">Objetivo (O)</label>
                    <Textarea placeholder="Dados observados, exercícios realizados, resultados acústicos..." rows={2} value={soapForm.objective} onChange={e => setSoapForm({...soapForm, objective: e.target.value})} className="bg-stone-50 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-emerald-700 mb-1 block">Avaliação (A)</label>
                    <Textarea placeholder="Sua análise clínica sobre o progresso de hoje..." rows={2} value={soapForm.assessment} onChange={e => setSoapForm({...soapForm, assessment: e.target.value})} className="bg-stone-50 resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-amber-700 mb-1 block">Plano (P)</label>
                    <Textarea placeholder="Conduta para a próxima sessão, orientações para casa..." rows={2} value={soapForm.plan} onChange={e => setSoapForm({...soapForm, plan: e.target.value})} className="bg-stone-50 resize-none" />
                  </div>
                  <div className="pt-2 flex justify-end">
                    <Button type="submit" className="bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold px-8">Salvar Evolução</Button>
                  </div>
                </form>
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-rose-200 rounded-xl bg-rose-50">
                  <XCircle size={40} className="mx-auto text-rose-300 mb-3" />
                  <p className="text-rose-700 font-bold mb-1">Paciente ausente na sessão.</p>
                  <Button variant="outline" onClick={handleSaveSoap} className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100">
                    Registrar Falta no Histórico
                  </Button>
                </div>
              )}
            </div>

            {/* Coluna de Histórico Rápido */}
            <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Últimas Evoluções</h3>
              {records.length === 0 ? (
                <p className="text-sm text-stone-400 italic">Nenhum registro anterior.</p>
              ) : (
                <div className="space-y-4">
                  {records.slice(0, 5).map((r, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => setSelectedRecord(r)}
                      className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-sm cursor-pointer hover:border-[#D46F54] hover:shadow-md transition-all group"
                    >
                      <div className="flex justify-between items-center mb-2 border-b border-stone-100 pb-2">
                        <span className="text-[10px] font-bold text-stone-400 block">{r.session_date}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${r.attendance === 'falta' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {r.attendance || 'Presente'}
                        </span>
                      </div>
                      
                      {/* Resumo do SOAP no Card */}
                      <div className="space-y-1 text-xs text-stone-600 line-clamp-3 group-hover:text-stone-800">
                        {r.attendance === 'falta' ? (
                          <p className="italic text-rose-600">Sessão não realizada.</p>
                        ) : (
                          <>
                            {r.subjective && <p><strong className="text-[#B75C46]">S:</strong> {r.subjective}</p>}
                            {r.objective && <p><strong className="text-blue-700">O:</strong> {r.objective}</p>}
                            {r.assessment && <p><strong className="text-emerald-700">A:</strong> {r.assessment}</p>}
                            {r.plan && <p><strong className="text-amber-700">P:</strong> {r.plan}</p>}
                          </>
                        )}
                      </div>
                      
                      <div className="mt-2 text-[10px] text-[#D46F54] font-bold text-right opacity-0 group-hover:opacity-100 transition-opacity">
                        Ver detalhes completos →
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: NOTAS PRIVADAS 🔒 */}
        {activeTab === "private" && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-rose-50 rounded-t-2xl p-4 border border-b-0 border-rose-200 flex items-start gap-3">
              <Lock className="text-rose-600 mt-0.5" size={20} />
              <div>
                <h3 className="text-rose-800 font-bold">Área Restrita (Notas Privadas)</h3>
                <p className="text-xs text-rose-600 mt-1">Este conteúdo é criptografado e <strong>nunca</strong> é compartilhado com a IA, relatórios de pacientes ou outros membros da equipe administrativa. Use para suspeitas clínicas sensíveis.</p>
              </div>
            </div>
            <div className="bg-white p-6 border border-rose-200 rounded-b-2xl shadow-sm">
              <Textarea 
                rows={10} 
                placeholder="Digite suas anotações confidenciais aqui..." 
                value={privateNote} 
                onChange={(e) => setPrivateNote(e.target.value)}
                className="bg-stone-50 resize-none border-stone-300 focus-visible:ring-rose-500 mb-4" 
              />
              <div className="flex justify-end">
                <Button onClick={handleSavePrivateNote} className="bg-stone-800 hover:bg-black text-white font-bold">
                  Salvar Nota Privada
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ABA: EXAMES E ANEXOS */}
        {activeTab === "exams" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            
            {/* Navegação e Criação de Pastas */}
            <div className="flex items-center justify-between bg-white border border-stone-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-stone-600 font-bold text-sm">
                <button 
                  onClick={() => setCurrentFolder(null)} 
                  className={`hover:text-[#D46F54] transition-colors flex items-center gap-2 ${!currentFolder ? 'text-[#D46F54]' : ''}`}
                >
                  <FolderOpen size={18} /> Todos os Arquivos
                </button>
                {currentFolder && (
                  <>
                    <ChevronRight size={16} className="text-stone-400" />
                    <span className="text-stone-800 bg-stone-100 px-3 py-1 rounded-lg">
                      {folders.find(f => f.id === currentFolder)?.name}
                    </span>
                  </>
                )}
              </div>
              <Button onClick={() => setIsFolderModalOpen(true)} variant="outline" className="border-stone-300 bg-stone-50 hover:bg-stone-100">
                <FolderPlus size={16} className="mr-2 text-[#D46F54]" /> Nova Pasta
              </Button>
            </div>

            {/* ÁREA DE UPLOAD (Manda para a pasta atual) */}
            <div className="bg-white border-2 border-dashed border-stone-300 hover:border-[#D46F54] transition-colors rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <input type="file" multiple onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
              <div className={`transition-transform duration-300 ${isUploading ? 'scale-110' : 'group-hover:-translate-y-1'}`}>
                {isUploading ? <Activity size={40} className="text-[#D46F54] animate-pulse mb-3 mx-auto" /> : <UploadCloud size={40} className="text-stone-300 group-hover:text-[#D46F54] mb-3 mx-auto transition-colors" />}
              </div>
              <h3 className="text-base font-bold text-stone-700">
                {isUploading ? 'Enviando arquivos...' : `Anexar em: ${currentFolder ? folders.find(f => f.id === currentFolder)?.name : 'Raiz Geral'}`}
              </h3>
            </div>

            {/* GRID DE PASTAS E ARQUIVOS */}
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm min-h-[300px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                
                {/* Renderiza as Pastas (Apenas na Raiz) */}
                {!currentFolder && folders.map(folder => (
                  <div 
                    key={folder.id} 
                    onClick={() => setCurrentFolder(folder.id)}
                    className="flex items-center gap-4 p-4 rounded-2xl border border-amber-100 bg-amber-50/30 hover:bg-amber-50 hover:shadow-md hover:border-amber-200 transition-all cursor-pointer group"
                  >
                    <div className="w-12 h-12 shrink-0 bg-white rounded-xl shadow-sm border border-amber-100 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform">
                      <Folder size={24} fill="currentColor" className="opacity-20" />
                      <Folder size={24} className="absolute" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-stone-800 truncate">{folder.name}</p>
                      <p className="text-[11px] font-bold text-stone-400 mt-1 uppercase">{folder.date}</p>
                    </div>
                  </div>
                ))}

                {/* Renderiza os Arquivos (Filtrados pela pasta atual) */}
                {attachments.filter(a => a.folderId === currentFolder).map(file => (
                  <div key={file.id} className="flex items-center gap-3 p-4 rounded-2xl border border-stone-100 bg-stone-50 hover:bg-white hover:shadow-md transition-all group">
                    <div className="w-10 h-10 shrink-0 bg-white rounded-xl shadow-sm border border-stone-100 flex items-center justify-center">
                      {getFileIcon(file.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-stone-800 truncate" title={file.name}>{file.name}</p>
                      <p className="text-[10px] font-bold text-stone-400 mt-0.5 uppercase tracking-wider">{file.size} • {file.date}</p>
                    </div>
                    <button onClick={() => handleDeleteAttachment(file.id)} className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}

              </div>

              {/* Mensagem de Vazio */}
              {!currentFolder && folders.length === 0 && attachments.filter(a => !a.folderId).length === 0 && (
                <div className="text-center py-12 text-stone-400 italic">Nenhuma pasta ou arquivo na raiz.</div>
              )}
              {currentFolder && attachments.filter(a => a.folderId === currentFolder).length === 0 && (
                <div className="text-center py-12 text-stone-400 italic">Esta pasta está vazia.</div>
              )}
            </div>

          </div>
        )}

      </div>
     {/* ========================================== */}
      {/* MODAL 1: LEITURA DO SOAP COMPLETO          */}
      {/* ========================================== */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <DialogTitle className="font-heading text-2xl text-stone-800 flex flex-col md:flex-row md:justify-between md:items-center gap-2">
              Detalhes da Evolução Clínica
              <span className="text-sm font-bold text-stone-500 bg-stone-100 px-3 py-1 rounded-lg w-fit">
                {selectedRecord?.session_date}
              </span>
            </DialogTitle>
          </DialogHeader>
          
          {selectedRecord && (
            <div className="space-y-6 mt-4 text-sm text-stone-700">
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-500 uppercase text-[11px] tracking-wider">Status da Sessão:</span>
                <span className={`px-3 py-1 rounded-md text-xs font-bold uppercase ${selectedRecord.attendance === 'falta' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {selectedRecord.attendance || 'Presente'}
                </span>
              </div>

              {selectedRecord.attendance !== 'falta' ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200">
                    <h4 className="font-bold text-[#B75C46] mb-2 uppercase text-[11px] tracking-widest flex items-center gap-2">
                      Subjetivo (S)
                    </h4>
                    <p className="whitespace-pre-wrap leading-relaxed text-stone-700">{selectedRecord.subjective || <span className="italic text-stone-400">Não preenchido.</span>}</p>
                  </div>
                  
                  <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200">
                    <h4 className="font-bold text-blue-700 mb-2 uppercase text-[11px] tracking-widest flex items-center gap-2">
                      Objetivo (O)
                    </h4>
                    <p className="whitespace-pre-wrap leading-relaxed text-stone-700">{selectedRecord.objective || <span className="italic text-stone-400">Não preenchido.</span>}</p>
                  </div>
                  
                  <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200">
                    <h4 className="font-bold text-emerald-700 mb-2 uppercase text-[11px] tracking-widest flex items-center gap-2">
                      Avaliação (A)
                    </h4>
                    <p className="whitespace-pre-wrap leading-relaxed text-stone-700">{selectedRecord.assessment || <span className="italic text-stone-400">Não preenchido.</span>}</p>
                  </div>
                  
                  <div className="bg-stone-50 p-5 rounded-2xl border border-stone-200">
                    <h4 className="font-bold text-amber-700 mb-2 uppercase text-[11px] tracking-widest flex items-center gap-2">
                      Plano (P)
                    </h4>
                    <p className="whitespace-pre-wrap leading-relaxed text-stone-700">{selectedRecord.plan || <span className="italic text-stone-400">Não preenchido.</span>}</p>
                  </div>
                </div>
              ) : (
                <div className="bg-rose-50 p-8 rounded-2xl border border-rose-200 text-center">
                  <XCircle size={48} className="mx-auto text-rose-300 mb-3" />
                  <h3 className="text-rose-800 font-bold text-lg">Paciente Ausente</h3>
                  <p className="text-rose-600 mt-1">A sessão agendada para esta data não foi realizada.</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL 2: CRIAR NOVA PASTA DE ANEXOS        */}
      {/* ========================================== */}
      <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Criar Nova Pasta</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-stone-500 mb-1 block">Nome da Pasta</label>
              <input 
                type="text" 
                autoFocus
                placeholder="Ex: Exames Audiométricos" 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)}
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm outline-none focus:border-[#D46F54]"
              />
            </div>
            <Button type="submit" className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold">
              Criar Pasta
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}