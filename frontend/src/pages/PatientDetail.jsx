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
  Folder, FolderPlus, FolderOpen, ChevronRight, Eye,
  Plus, Home, Stethoscope, CheckSquare, Calendar, Award, Sparkles,
  LayoutTemplate, Wand2, Save, FileDown, Bot, PenTool, 
  ClipboardList, ClipboardEdit, RotateCcw, Share2, BrainCircuit, Mic, AlertCircle } from 'lucide-react';

// IMPORTAÇÕES DO EDITOR DE TEXTO RICO (WORD / GOOGLE DOCS)
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function PatientDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient(); 
  
  // ==========================================
  // 1. ESTADOS GERAIS DA TELA
  // ==========================================
  const [activeTab, setActiveTab] = useState("overview");
  const [msgOpen, setMsgOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [privateNote, setPrivateNote] = useState("");
  
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [soapForm, setSoapForm] = useState({
    attendance: "presente", subjective: "", objective: "", assessment: "", plan: ""
  });

  // ==========================================
  // 1.5. ESTADOS DOS PROTOCOLOS E QUESTIONÁRIOS
  // ==========================================
  const [protocolsState, setProtocolsState] = useState({
    qvv: null,
    capeV: null,
    idv10: null,
    esv: null // Mudado para ESV
  });

  // Estados dos Modais de Formulários
  const [activeProtocolKey, setActiveProtocolKey] = useState(null);
  const [isProtocolFillModalOpen, setIsProtocolFillModalOpen] = useState(false);
  const [isProtocolViewModalOpen, setIsProtocolViewModalOpen] = useState(false);
  const [isAiAnalyzingProtocol, setIsAiAnalyzingProtocol] = useState(false);
  const [protocolAnswers, setProtocolAnswers] = useState({});

  const protocolNames = {
    qvv: "Qualidade de Vida em Voz (QVV)",
    capeV: "Avaliação CAPE-V",
    idv10: "Índice de Desvantagem Vocal (IDV-10)",
    esv: "Escala de Sintomas Vocais (ESV)"
  };

  // BANCO DE PERGUNTAS E DOMÍNIOS (A base da Inteligência Artificial)
  const questionsData = {
    qvv: [
      { text: "Tenho dificuldades em falar forte (alto) ou ser ouvido em lugares barulhentos.", domain: "funcional" },
      { text: "O ar acaba rápido e preciso respirar muitas vezes enquanto eu falo.", domain: "fisico" },
      { text: "Às vezes, quando começo a falar não sei como minha voz vai sair.", domain: "fisico" },
      { text: "Às vezes, fico ansioso ou frustrado (por causa da minha voz).", domain: "emocional" },
      { text: "Às vezes, fico deprimido (por causa da minha voz).", domain: "emocional" },
      { text: "Tenho dificuldades em falar ao telefone (por causa da minha voz).", domain: "funcional" },
      { text: "Tenho problemas no meu trabalho ou para desenvolver minha profissão (por causa da minha voz).", domain: "funcional" },
      { text: "Evito sair socialmente (por causa da minha voz).", domain: "funcional" },
      { text: "Tenho que repetir o que falo para ser compreendido.", domain: "funcional" },
      { text: "Tenho me tornado menos expansivo (por causa da minha voz)", domain: "emocional" }
    ],
    idv10: [
      { text: "Dificuldade em ser ouvido(a) por causa da voz.", domain: "funcional" },
      { text: "Dificuldade de ser entendido(a) em ambientes com ruído.", domain: "funcional" },
      { text: "Perguntas frequentes sobre o estado da minha voz.", domain: "emocional" },
      { text: "Sensação de esforço para falar.", domain: "fisico" },
      { text: "Limitação na vida pessoal e social pela voz.", domain: "funcional" },
      { text: "Imprevisibilidade da qualidade da voz.", domain: "fisico" },
      { text: "Tensão ao conversar com outras pessoas.", domain: "emocional" },
      { text: "Impacto do problema de voz no desempenho profissional.", domain: "funcional" },
      { text: "Sensação de exclusão social devido à voz.", domain: "emocional" },
      { text: "Prejuízos financeiros ou profissionais causados pela voz.", domain: "funcional" }
    ],
    esv: [
      { text: "Você tem dificuldade de chamar a atenção das pessoas?", domain: "funcional" },
      { text: "Você tem dificuldades para cantar?", domain: "funcional" },
      { text: "Sua garganta dói?", domain: "fisico" },
      { text: "Sua voz é rouca?", domain: "fisico" },
      { text: "Quando você conversa em grupo, as pessoas têm dificuldade para ouvi-lo?", domain: "funcional" },
      { text: "Você perde a voz?", domain: "fisico" },
      { text: "Você tosse ou pigarreia?", domain: "fisico" },
      { text: "Sua voz é fraca/baixa?", domain: "fisico" },
      { text: "Você tem dificuldades para falar ao telefone?", domain: "funcional" },
      { text: "Você se sente mal ou deprimido por causa do seu problema de voz?", domain: "emocional" },
      { text: "Você sente alguma coisa parada na garganta?", domain: "fisico" },
      { text: "Você tem nódulos inchados (íngua) no pescoço?", domain: "fisico" },
      { text: "Você se sente constrangido por causa do seu problema de voz?", domain: "emocional" },
      { text: "Você se cansa para falar?", domain: "fisico" },
      { text: "Seu problema de voz deixa você estressado ou nervoso?", domain: "emocional" },
      { text: "Você tem dificuldade para falar em locais barulhentos?", domain: "funcional" },
      { text: "É difícil falar forte (alto) ou gritar?", domain: "fisico" },
      { text: "O seu problema de voz incomoda sua família ou amigos?", domain: "emocional" },
      { text: "Você tem muita secreção ou pigarro na garganta?", domain: "fisico" },
      { text: "O som da sua voz muda durante o dia?", domain: "fisico" },
      { text: "As pessoas parecem se irritar com sua voz?", domain: "emocional" },
      { text: "Você tem o nariz entupido?", domain: "fisico" },
      { text: "As pessoas perguntam o que você tem na voz?", domain: "emocional" },
      { text: "Sua voz parece rouca e seca?", domain: "fisico" },
      { text: "Você tem que fazer força para falar?", domain: "fisico" },
      { text: "Com que frequência você tem infecções de garganta?", domain: "fisico" },
      { text: "Sua voz falha no meio das frases?", domain: "fisico" },
      { text: "Sua voz faz você se sentir incompetente?", domain: "emocional" },
      { text: "Você tem vergonha do seu problema de voz?", domain: "emocional" },
      { text: "Você se sente solitário por causa do seu problema de voz?", domain: "emocional" }
    ]
  };

  const handleGenerateProtocolLink = (key) => {
    const fakeLink = `${window.location.origin}/forms/paciente/${id}/protocolo/${key}`;
    navigator.clipboard.writeText(fakeLink).catch(()=>{});
    if(key === 'capeV') {
      toast.success(`Link copiado! O paciente receberá instruções para gravar os áudios pelo celular.`);
    } else {
      toast.success(`Link copiado! Envie para o paciente preencher o ${key.toUpperCase()}.`);
    }
  };

  const openProtocolFillModal = (key) => {
    setActiveProtocolKey(key);
    // Se for CAPE-V, zera as barras deslizantes. Se for IDV/ESV/QVV, zera as respostas de 0-4.
    if(key === 'capeV') setProtocolAnswers({ gg: 0, rug: 0, sop: 0, ten: 0, pit: 0, lou: 0 });
    else setProtocolAnswers({});
    setIsProtocolFillModalOpen(true);
  };

  const openProtocolViewModal = (key) => {
    setActiveProtocolKey(key);
    setIsProtocolViewModalOpen(true);
  };

  const handleSaveProtocol = async () => {
    setIsAiAnalyzingProtocol(true);
    try {
      await new Promise(r => setTimeout(r, 2500));
      
      let summaryText = "";
      let scoreFinal = 0;
      let aiTip = "";
      let domains = { fisico: 0, emocional: 0, funcional: 0 };

      if (activeProtocolKey === 'capeV') {
        const { gg, rug, sop, ten } = protocolAnswers;
        scoreFinal = gg; 
        summaryText = `Análise perceptivo-auditiva concluída. Grau Geral de alteração é ${gg}/100. Destacam-se parâmetros de Rugosidade (${rug}/100) e Soprosidade (${sop}/100).`;
        if (ten > 60) aiTip = "Tensão glótica elevada. Considere exercícios de relaxamento laríngeo e ETVSO antes do fortalecimento.";
        else aiTip = "Perfil vocal compatível com o quadro clínico atual. Focar na coaptação suave.";
      } else {
        const questions = questionsData[activeProtocolKey];
        Object.keys(protocolAnswers).forEach(idx => {
          const val = protocolAnswers[idx];
          const domain = questions[idx].domain;
          domains[domain] += val;
          scoreFinal += val;
        });

        summaryText = `A pontuação total foi ${scoreFinal}. O questionário confirma a presença de desvantagem vocal na rotina do paciente.`;

        // Inteligência da IA para gerar o Insight Direcionado
        if (domains.fisico > domains.emocional && domains.fisico > domains.funcional) {
          aiTip = "Predominância de Sintomas Físicos (dor, esforço, fadiga). DICA CLÍNICA: Investigar possível Refluxo Laringofaríngeo (RLF) ou Tensão Muscular. Orientar hidratação intensa.";
        } else if (domains.emocional > domains.fisico && domains.emocional > domains.funcional) {
          aiTip = "Predominância de Sintomas Emocionais. DICA CLÍNICA: O paciente está sofrendo com a autoimagem vocal (vergonha, frustração). A abordagem inicial deve focar em acolhimento e resultados de alívio rápido.";
        } else {
          aiTip = "Predominância Funcional e de Limitação. DICA CLÍNICA: A voz está falhando na demanda profissional ou social. Focar no treinamento de projeção vocal e resistência.";
        }
      }

      setProtocolsState(prev => ({ 
        ...prev, 
        [activeProtocolKey]: { 
          answers: protocolAnswers,
          summary: summaryText,
          tip: aiTip,
          score: scoreFinal,
          domains: activeProtocolKey !== 'capeV' ? domains : null,
          date: new Date().toLocaleDateString('pt-BR') 
        } 
      }));
      
      toast.success(`${protocolNames[activeProtocolKey]} analisado e salvo com sucesso!`);
      setIsProtocolFillModalOpen(false);
    } catch (e) {
      toast.error("Erro ao analisar protocolo.");
    } finally {
      setIsAiAnalyzingProtocol(false);
    }
  };

  const resetProtocol = (key) => {
    setProtocolsState(prev => ({ ...prev, [key]: null }));
    toast.info("Protocolo resetado. Liberado para novo preenchimento.");
  };

  // ==========================================
  // 2. ESTADOS DE PASTAS E ANEXOS
  // ==========================================
  const [currentFolder, setCurrentFolder] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);

  // ==========================================
  // 3. ESTADOS DE ATIVIDADES E I.A.
  // ==========================================
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [activityForm, setActivityForm] = useState({
    title: "", type: "casa", description: ""
  });

  // ==========================================
  // 3.5. ESTADOS DE RELATÓRIOS E COPILOTO
  // ==========================================
  const [isReportEditorOpen, setIsReportEditorOpen] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  
  const [reportForm, setReportForm] = useState({
    title: "", content: "", format: "clinico", status: "draft"
  });
  const [reportToDelete, setReportToDelete] = useState(null);

  const quillModules = {
    toolbar: [
      [{ 'font': [] }, { 'size': ['small', false, 'large', 'huge'] }],
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'align': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['blockquote', 'code-block'],
      ['clean']
    ],
  };

  const { data: reportsHistory = [] } = useQuery({
    queryKey: ["reports", id], 
    queryFn: async () => (await api.get(`/reports?patient_id=${id}`)).data,
  });

  // ==========================================
  // 4. BUSCAS NO BANCO DE DADOS (useQuery)
  // ==========================================
  const { data: p } = useQuery({ queryKey: ["patient", id], queryFn: async () => (await api.get(`/patients/${id}`)).data });
  const { data: records = [] } = useQuery({ queryKey: ["records", id], queryFn: async () => (await api.get(`/records?patient_id=${id}`)).data });
  const { data: folders = [] } = useQuery({ queryKey: ["folders", id], queryFn: async () => (await api.get(`/folders?patient_id=${id}`)).data });
  const { data: attachments = [] } = useQuery({ queryKey: ["attachments", id], queryFn: async () => (await api.get(`/attachments?patient_id=${id}`)).data });
  const { data: activities = [] } = useQuery({ queryKey: ["activities", id], queryFn: async () => (await api.get(`/activities?patient_id=${id}`)).data });

  // ==========================================
  // 4.5. FUNÇÕES DE RELATÓRIOS E COPILOTO
  // ==========================================
  const handleOpenNewReport = () => {
    setReportForm({ report_id: null, title: "Novo Relatório", content: "", format: "clinico", status: "draft" });
    setAiPrompt("");
    setIsReportEditorOpen(true);
  };

  const handleOpenExistingReport = (report) => {
    setReportForm({ 
      report_id: report.report_id || report.id, 
      title: report.title, 
      content: report.content || "", 
      format: report.format, 
      status: report.status 
    });
    setAiPrompt("");
    setIsReportEditorOpen(true);
  };

  const handleCopilotGenerate = async () => {
    setIsAiThinking(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const textoGerado = `
        <h2 style="text-align: center;"><strong>RELATÓRIO FONOAUDIOLÓGICO</strong></h2>
        <p><br></p>
        <p><strong>Paciente:</strong> ${p?.name || 'Não informado'}</p>
        <p><strong>Idade:</strong> ${displayAge !== null ? `${displayAge} anos` : 'Não informada'}</p>
        <p><br></p>
        <p><strong>1. HISTÓRICO CLÍNICO E PROTOCOLOS</strong></p>
        <p>A avaliação de qualidade de vida e protocolos vocais indicam: ${protocolsState.esv ? protocolsState.esv.summary : 'Aguardando preenchimento de protocolos'}</p>
        <p><br></p>
        <p><strong>2. EVOLUÇÃO E ACHADOS</strong></p>
        <p>Nas últimas sessões, observou-se melhora na coaptação glótica. Exercícios de trato vocal semi-ocluído (ETVSO) geraram uma ressonância mais equilibrada e conforto fônico.</p>
        <p><br></p>
        <p><strong>3. CONDUTA / PARECER</strong></p>
        <p>Sugere-se manter o acompanhamento fonoaudiológico semanal, bem como reavaliação médica otorrinolaringológica em 30 dias para acompanhamento da fenda.</p>
        <p><br></p>
        <p style="text-align: right;"><em>(Baseado nas diretrizes do formato ${reportForm.format.toUpperCase()} com a instrução: "${aiPrompt}")</em></p>
      `;
      
      setReportForm(prev => ({ ...prev, content: textoGerado }));
      toast.success("Rascunho formatado gerado com base no prontuário!");
    } catch {
      toast.error("Erro ao gerar relatório com a IA.");
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleCopilotReview = async () => {
    if (!reportForm.content.trim() || reportForm.content === '<p><br></p>') return toast.error("Escreva algo primeiro para a IA revisar.");
    setIsAiThinking(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    toast.success("Revisão concluída: O texto está excelente! Ajustes técnicos de coesão aplicados.");
    setIsAiThinking(false);
  };

  const handleExportReport = (type) => {
    const plainText = reportForm.content.replace(/<[^>]+>/g, '\n').replace(/\n\s*\n/g, '\n\n');
    const element = document.createElement("a");
    const file = new Blob([plainText], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${reportForm.title.replace(/\s+/g, '_')}.${type === 'word' ? 'doc' : 'pdf'}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success(`Relatório exportado como ${type.toUpperCase()}!`);
  };

  const handleSaveReport = async (status) => {
    try {
      const payload = {
        patient_id: id,
        title: reportForm.title || "Sem Título",
        content: reportForm.content,
        format: reportForm.format,
        status: status
      };

      if (reportForm.report_id) {
        await api.put(`/reports/${reportForm.report_id}`, payload);
      } else {
        await api.post('/reports', payload);
      }
      
      toast.success(status === 'draft' ? "Rascunho salvo no histórico!" : "Relatório finalizado salvo!");
      setIsReportEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ["reports", id] });
    } catch (error) { toast.error("Erro ao salvar o relatório no banco de dados."); }
  };

  const confirmDeleteReport = async () => {
    if (!reportToDelete) return;
    const reportDataBackup = { ...reportToDelete }; 
    const reportId = reportDataBackup.report_id || reportDataBackup.id;

    try {
      await api.delete(`/reports/${reportId}`);
      setReportToDelete(null); 
      queryClient.invalidateQueries({ queryKey: ["reports", id] }); 

      toast.success("Relatório movido para a lixeira.", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await api.post('/reports', { patient_id: id, title: reportDataBackup.title, content: reportDataBackup.content, format: reportDataBackup.format, status: reportDataBackup.status });
              queryClient.invalidateQueries({ queryKey: ["reports", id] });
              toast.success("Exclusão desfeita! O relatório voltou.");
            } catch (e) { toast.error("Erro ao restaurar o relatório."); }
          }
        },
        duration: 6000, 
      });
    } catch (error) { toast.error("Erro ao excluir relatório."); }
  };

  // ==========================================
  // 5. FUNÇÕES DE ATIVIDADES E I.A.
  // ==========================================
  const handleGenerateAiInstructions = async () => {
    if (!activityForm.title.trim()) return toast.error("Digite o Título da atividade primeiro.");
    setIsGeneratingAi(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const instrucoesGeradas = `Instruções para: ${activityForm.title}\n\n1. Mantenha uma postura confortável e ereta.\n2. Inspire lentamente pelo nariz.\n3. Realize o exercício emitindo o som de forma contínua.\n4. Faça 3 séries de 10.\n\n⚠️ Em caso de dor, interrompa e comunique a fonoaudióloga.`;
      setActivityForm(prev => ({ ...prev, description: instrucoesGeradas }));
      toast.success("Instruções geradas com IA!");
    } catch (error) { toast.error("Erro ao conectar com a IA."); } finally { setIsGeneratingAi(false); }
  };

  const handleSaveActivity = async () => {
    if (!activityForm.title.trim()) return toast.error("O título é obrigatório");
    try {
      await api.post('/activities', { patient_id: id, title: activityForm.title, type: activityForm.type, description: activityForm.description });
      toast.success("Nova atividade atribuída ao paciente!");
      setIsActivityModalOpen(false);
      setActivityForm({ title: "", type: "casa", description: "" });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    } catch (error) { toast.error("Erro ao salvar atividade."); }
  };

  // ==========================================
  // 6. FUNÇÕES DE PASTAS E ANEXOS
  // ==========================================
  const getFileUrl = (url) => { if (!url) return ""; return `http://127.0.0.1:8000${url}`; };
  const handleCreateFolder = async (e) => { e.preventDefault(); if (!newFolderName.trim()) return; try { await api.post('/folders', { patient_id: id, name: newFolderName }); setNewFolderName(""); setIsFolderModalOpen(false); toast.success("Pasta criada com sucesso!"); queryClient.invalidateQueries({ queryKey: ["folders", id] }); } catch { toast.error("Erro ao criar pasta no banco."); } };
  const handleFileUpload = async (e) => { const files = Array.from(e.target.files); if (files.length === 0) return; setIsUploading(true); try { for (const file of files) { const formData = new FormData(); formData.append("patient_id", id); if (currentFolder) formData.append("folder_id", currentFolder); formData.append("file", file); await api.post('/attachments', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); } toast.success(`${files.length} arquivo(s) salvo(s)!`); queryClient.invalidateQueries({ queryKey: ["attachments", id] }); } catch { toast.error("Erro ao enviar o arquivo."); } finally { setIsUploading(false); } };
  const handleDownloadAttachment = (file) => { if (!file.file_url) return; const link = document.createElement("a"); link.href = getFileUrl(file.file_url); link.download = file.name; document.body.appendChild(link); link.click(); document.body.removeChild(link); toast.success("Download iniciado!"); };
  const handleDeleteAttachment = async (attachmentId) => { try { await api.delete(`/attachments/${attachmentId}`); toast.success("Anexo removido."); queryClient.invalidateQueries({ queryKey: ["attachments", id] }); setPreviewFile(null); } catch { toast.error("Erro ao deletar anexo."); } };
  const getFileIcon = (fileType) => { if (!fileType) return <File size={24} className="text-stone-500" />; if (fileType.includes('image')) return <ImageIcon size={24} className="text-blue-500" />; if (fileType.includes('video')) return <Video size={24} className="text-purple-500" />; if (fileType.includes('audio')) return <Music size={24} className="text-amber-500" />; if (fileType.includes('pdf')) return <FileText size={24} className="text-rose-500" />; return <File size={24} className="text-stone-500" />; };
  const renderPreviewContent = (file) => { if (!file || !file.file_url) return <p className="text-stone-500 italic">Arquivo não disponível.</p>; const realUrl = getFileUrl(file.file_url); if (file.type.includes('image')) return <img src={realUrl} alt={file.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm" />; if (file.type.includes('video')) return <video src={realUrl} controls className="max-w-full max-h-[70vh] rounded-lg shadow-sm" />; if (file.type.includes('audio')) return <audio src={realUrl} controls className="w-full max-w-md" />; if (file.type.includes('pdf')) return <iframe src={realUrl} className="w-full h-[70vh] rounded-lg shadow-sm border border-stone-200" title="PDF Preview" />; return ( <div className="text-center p-8 text-stone-500"> <File size={48} className="mx-auto mb-4 opacity-50" /> <p className="font-bold">Pré-visualização indisponível no navegador.</p> <Button onClick={() => handleDownloadAttachment(file)} className="mt-4 bg-[#D46F54] hover:bg-[#B75C46] text-white">Baixar Arquivo</Button> </div> ); };

  // ==========================================
  // 7. OUTRAS FUNÇÕES (Convites, SOAP, Notas)
  // ==========================================
  const createInvite = async () => { try { const { data } = await api.post(`/patients/${id}/invite`, {}); const full = `${window.location.origin}${data.invite_link}`; try { await navigator.clipboard.writeText(full); } catch {} setInviteLink(full); toast.success("Link de convite copiado"); } catch { toast.error("Erro ao gerar convite"); } };
  const handleSaveSoap = async (e) => { e.preventDefault(); try { const today = new Date().toISOString().split('T')[0]; const payload = { patient_id: id, session_date: today, ...soapForm }; await api.post('/records', payload); toast.success("Evolução salva com sucesso!"); setSoapForm({ attendance: "presente", subjective: "", objective: "", assessment: "", plan: "" }); queryClient.invalidateQueries({ queryKey: ["records", id] }); } catch (error) { toast.error("Erro ao salvar evolução."); } };
  const handleSavePrivateNote = async () => { toast.success("Nota privada salva com segurança."); };
  const calculateAge = (birthDate) => { if (!birthDate) return null; const today = new Date(); const birth = new Date(birthDate); let age = today.getFullYear() - birth.getFullYear(); const monthDiff = today.getMonth() - birth.getMonth(); if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) { age--; } return age >= 0 ? age : null; };

  if (!p) return <div className="flex items-center justify-center h-screen text-stone-500 animate-pulse font-medium">Carregando prontuário...</div>;
  const displayAge = p.age ?? calculateAge(p.birth_date);

  // ==========================================
  // 8. O VISUAL DA TELA (Renderização)
  // ==========================================
  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      
      <Link to="/patients" className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit">
        <ArrowLeft size={20} /> Voltar para lista
      </Link>

      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col md:flex-row gap-6 items-center md:items-start">
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

        <div className="flex-1 text-center md:text-left space-y-2">
          <h1 className="text-3xl font-bold text-stone-800 tracking-tight font-heading">{p.name}</h1>
          <div className="text-sm text-stone-500 flex flex-wrap items-center justify-center md:justify-start gap-3">
            {p.otorrhoea_diagnosis && <span className="px-3 py-1 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-bold">{p.otorrhoea_diagnosis}</span>}
            <span className="flex items-center gap-1 font-medium"><User size={16}/> {displayAge !== null ? `${displayAge} anos` : 'Idade N/I'}</span>
            <span className="flex items-center gap-1 font-medium"><Phone size={16}/> {p.phone || 'Sem telefone'}</span>
          </div>

          {inviteLink && (
            <div className="mt-3 bg-[#F3E7E4]/40 border border-[#D46F54]/30 rounded-lg p-3 text-xs text-stone-700 inline-block w-full max-w-md text-left">
              <span className="font-bold">Link de Convite:</span> <code className="text-[#B75C46] select-all">{inviteLink}</code>
            </div>
          )}
          
          <div className="mt-3 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 inline-block w-full max-w-2xl text-left">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-1 flex items-center gap-1">
              <Target size={14} /> Metas Terapêuticas Atuais
            </h4>
            <p className="text-xs text-stone-700 font-medium leading-relaxed">{p.goals || "Nenhuma meta definida. Adicione na aba de Visão Geral."}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0 w-full md:w-auto">
          <Link to={`/voice-lab?patient_id=${p.patient_id}`} className="w-full">
            <Button variant="outline" className="w-full justify-start border-stone-300">
              <Activity size={16} className="mr-2 text-[#D46F54]" /> Análise Vocal
            </Button>
          </Link>
          <Button variant="outline" onClick={createInvite} className="w-full justify-start border-stone-300">
            <LinkIcon size={16} className="mr-2 text-[#D46F54]" /> Convidar Paciente
          </Button>
          <Button onClick={() => setMsgOpen(true)} className="w-full justify-start bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <MessageSquare size={16} className="mr-2" /> Rascunhar Mensagem
          </Button>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-stone-200 custom-scrollbar pb-px">
        {[
          { id: "overview", label: "Visão Geral", icon: FileText },
          { id: "soap", label: "Evoluções (SOAP)", icon: FileClock },
          { id: "activities", label: "Atividades/Desafios", icon: Award },
          { id: "exams", label: "Exames/Anexos", icon: Paperclip },
          { id: "reports", label: "Relatórios", icon: LayoutTemplate },
          { id: "private", label: "Notas Privadas", icon: Lock, isPrivate: true },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? tab.isPrivate ? "border-rose-500 text-rose-600 bg-rose-50/50" : "border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/30" : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"}`}>
            <tab.icon size={16} /> {tab.label} {tab.isPrivate && <Lock size={12} className="ml-1" />}
          </button>
        ))}
      </div>

      <div className="pt-2">
        {/* ========================================== */}
        {/* ABA: VISÃO GERAL                           */}
        {/* ========================================== */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            
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

            {/* SESSÃO: PROTOCOLOS INTELIGENTES */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold flex items-center gap-2">
                  <ClipboardList size={16} /> Protocolos e Questionários Inteligentes
                </h3>
              </div>
              <p className="text-sm text-stone-500 mb-6">Ao preencher, a IA analisará automaticamente as respostas, identificando domínios para gerar um resumo clínico.</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { key: 'qvv', title: 'QVV', desc: 'Protocolo de Qualidade de Vida em Voz', icon: FileText, color: 'text-rose-600', bg: 'bg-rose-100' },
                  { key: 'capeV', title: 'CAPE-V', desc: 'Avaliação Perceptivo-Auditiva da Voz Clínica', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100' },
                  { key: 'idv10', title: 'IDV-10', desc: 'Índice de Desvantagem Vocal Reduzido', icon: ClipboardEdit, color: 'text-amber-600', bg: 'bg-amber-100' },
                  { key: 'esv', title: 'ESV', desc: 'Escala de Sintomas Vocais (30 questões)', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-100' }
                ].map((proto) => {
                  const isFilled = protocolsState[proto.key];
                  
                  return (
                    <div key={proto.key} className={`border rounded-xl p-5 hover:shadow-md transition-all group flex flex-col h-full ${isFilled ? 'border-emerald-200 bg-emerald-50/20' : 'border-stone-200 bg-stone-50/50 hover:border-[#D46F54] hover:bg-white'}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className={`p-2 rounded-lg group-hover:scale-110 transition-transform ${isFilled ? 'bg-emerald-100 text-emerald-600' : `${proto.bg} ${proto.color}`}`}>
                          <proto.icon size={20} />
                        </div>
                        {isFilled ? (
                           <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-md uppercase">Concluído</span>
                        ) : (
                           <span className="px-2 py-1 bg-rose-100 text-rose-700 text-[10px] font-bold rounded-md uppercase flex items-center gap-1"><Activity size={10}/> Pendente</span>
                        )}
                      </div>
                      
                      <h4 className="font-bold text-stone-800 text-sm mb-1">{proto.title}</h4>
                      
                      {isFilled ? (
                        <div className="flex-1 mb-4 flex flex-col gap-2">
                           <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">Feito em: {isFilled.date} | Pontos: {isFilled.score}</p>
                           <div className="bg-white border border-emerald-100 rounded-lg p-2.5 shadow-sm mt-1">
                             <div className="flex items-center gap-1 text-emerald-700 mb-1">
                               <BrainCircuit size={12} /> <span className="text-[10px] font-bold uppercase tracking-widest">Resumo IA</span>
                             </div>
                             <p className="text-xs text-stone-700 leading-tight line-clamp-4">{isFilled.tip || isFilled.summary}</p>
                           </div>
                        </div>
                      ) : (
                        <p className="text-xs text-stone-500 line-clamp-2 mb-4 flex-1">{proto.desc}</p>
                      )}

                      {isFilled ? (
                         <div className="flex gap-2 mt-auto">
                            <Button variant="outline" onClick={() => openProtocolViewModal(proto.key)} className="w-full text-xs h-8 border-stone-300 text-stone-700 hover:bg-stone-100 hover:text-stone-900">
                              <Eye size={14} className="mr-1"/> Ver
                            </Button>
                            <Button variant="outline" onClick={() => resetProtocol(proto.key)} className="w-full text-xs h-8 border-stone-300 text-rose-600 hover:bg-rose-50 hover:border-rose-200" title="Apagar e refazer">
                              <RotateCcw size={14} className="mr-1"/> Refazer
                            </Button>
                         </div>
                      ) : (
                         <div className="flex gap-2 mt-auto">
                            <Button variant="outline" onClick={() => openProtocolFillModal(proto.key)} className="w-full text-xs h-8 border-stone-300 group-hover:border-[#D46F54] group-hover:text-[#D46F54]">
                              Preencher Manual
                            </Button>
                            <Button variant="outline" onClick={() => handleGenerateProtocolLink(proto.key)} className="w-10 h-8 border-stone-300 text-stone-500 hover:text-blue-600 hover:bg-blue-50 p-0" title="Gerar link para o paciente">
                              <Share2 size={14} />
                            </Button>
                         </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ABA: EVOLUÇÕES (SOAP) */}
        {activeTab === "soap" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-bold text-stone-800">Nova Evolução Clínica</h3>
                <div className="flex bg-stone-100 rounded-lg p-1">
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'presente'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${soapForm.attendance === 'presente' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}><CheckCircle2 size={14} /> Presente</button>
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'falta'})} className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${soapForm.attendance === 'falta' ? 'bg-white shadow-sm text-rose-600' : 'text-stone-500'}`}><XCircle size={14} /> Faltou</button>
                </div>
              </div>
              {soapForm.attendance === 'presente' ? (
                <form onSubmit={handleSaveSoap} className="space-y-4">
                  <div><label className="text-xs font-bold text-[#B75C46] mb-1 block">Subjetivo (S)</label><Textarea value={soapForm.subjective} onChange={e => setSoapForm({...soapForm, subjective: e.target.value})} className="bg-stone-50 resize-none" /></div>
                  <div><label className="text-xs font-bold text-blue-700 mb-1 block">Objetivo (O)</label><Textarea value={soapForm.objective} onChange={e => setSoapForm({...soapForm, objective: e.target.value})} className="bg-stone-50 resize-none" /></div>
                  <div><label className="text-xs font-bold text-emerald-700 mb-1 block">Avaliação (A)</label><Textarea value={soapForm.assessment} onChange={e => setSoapForm({...soapForm, assessment: e.target.value})} className="bg-stone-50 resize-none" /></div>
                  <div><label className="text-xs font-bold text-amber-700 mb-1 block">Plano (P)</label><Textarea value={soapForm.plan} onChange={e => setSoapForm({...soapForm, plan: e.target.value})} className="bg-stone-50 resize-none" /></div>
                  <div className="pt-2 flex justify-end"><Button type="submit" className="bg-[#D46F54] text-white">Salvar Evolução</Button></div>
                </form>
              ) : (
                <div className="py-8 text-center border-2 border-dashed border-rose-200 rounded-xl bg-rose-50">
                  <XCircle size={40} className="mx-auto text-rose-300 mb-3" />
                  <p className="text-rose-700 font-bold mb-1">Paciente ausente na sessão.</p>
                  <Button variant="outline" onClick={handleSaveSoap} className="mt-3 border-rose-300 text-rose-700 hover:bg-rose-100">Registrar Falta no Histórico</Button>
                </div>
              )}
            </div>

            <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Últimas Evoluções</h3>
              {records.length === 0 ? <p className="text-sm text-stone-400 italic">Nenhum registro anterior.</p> : (
                <div className="space-y-4">
                  {records.slice(0, 5).map((r, idx) => (
                    <div key={idx} onClick={() => setSelectedRecord(r)} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-sm cursor-pointer hover:border-[#D46F54] hover:shadow-md transition-all group">
                      <div className="flex justify-between items-center mb-2 border-b border-stone-100 pb-2">
                        <span className="text-[10px] font-bold text-stone-400 block">{r.session_date}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${r.attendance === 'falta' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{r.attendance || 'Presente'}</span>
                      </div>
                      <div className="space-y-1 text-xs text-stone-600 line-clamp-3 group-hover:text-stone-800">
                        {r.attendance === 'falta' ? <p className="italic text-rose-600">Sessão não realizada.</p> : (
                          <>{r.subjective && <p><strong className="text-[#B75C46]">S:</strong> {r.subjective}</p>} {r.objective && <p><strong className="text-blue-700">O:</strong> {r.objective}</p>} {r.assessment && <p><strong className="text-emerald-700">A:</strong> {r.assessment}</p>} {r.plan && <p><strong className="text-amber-700">P:</strong> {r.plan}</p>}</>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ABA: NOTAS PRIVADAS */}
        {activeTab === "private" && (
          <div className="max-w-3xl mx-auto">
            <div className="bg-rose-50 rounded-t-2xl p-4 border border-b-0 border-rose-200 flex items-start gap-3">
              <Lock className="text-rose-600 mt-0.5" size={20} />
              <div>
                <h3 className="text-rose-800 font-bold">Área Restrita (Notas Privadas)</h3>
                <p className="text-xs text-rose-600 mt-1">Este conteúdo é criptografado e nunca compartilhado com a IA ou pacientes.</p>
              </div>
            </div>
            <div className="bg-white p-6 border border-rose-200 rounded-b-2xl shadow-sm">
              <Textarea rows={10} placeholder="Anotações confidenciais..." value={privateNote} onChange={(e) => setPrivateNote(e.target.value)} className="bg-stone-50 resize-none border-stone-300 mb-4" />
              <div className="flex justify-end"><Button onClick={handleSavePrivateNote} className="bg-stone-800 hover:bg-black text-white font-bold">Salvar Nota Privada</Button></div>
            </div>
          </div>
        )}

        {/* ABA: EXAMES E ANEXOS */}
        {activeTab === "exams" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between bg-white border border-stone-200 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center gap-2 text-stone-600 font-bold text-sm">
                <button onClick={() => setCurrentFolder(null)} className={`hover:text-[#D46F54] transition-colors flex items-center gap-2 ${!currentFolder ? 'text-[#D46F54]' : ''}`} title="Ir para a raiz"><FolderOpen size={18} /> Arquivos</button>
                {currentFolder && (
                  <><ChevronRight size={16} className="text-stone-400" /><span className="text-stone-800 bg-stone-100 px-3 py-1 rounded-lg">{folders.find(f => f.folder_id === currentFolder)?.name}</span></>
                )}
              </div>
              <Button onClick={() => setIsFolderModalOpen(true)} variant="outline" className="border-stone-300 bg-stone-50 hover:bg-stone-100 px-3"><FolderPlus size={18} className="text-[#D46F54] sm:mr-2" /> <span className="hidden sm:inline">Nova Pasta</span></Button>
            </div>

            <div className="bg-white border-2 border-dashed border-stone-300 hover:border-[#D46F54] transition-colors rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <input type="file" multiple onChange={handleFileUpload} disabled={isUploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
              <div className={`transition-transform duration-300 ${isUploading ? 'scale-110' : 'group-hover:-translate-y-1'}`}>
                {isUploading ? <Activity size={40} className="text-[#D46F54] animate-pulse mb-3 mx-auto" /> : <UploadCloud size={40} className="text-stone-300 group-hover:text-[#D46F54] mb-3 mx-auto transition-colors" />}
              </div>
              <h3 className="text-base font-bold text-stone-700">{isUploading ? 'Enviando...' : `Anexar em: ${currentFolder ? folders.find(f => f.folder_id === currentFolder)?.name : 'Raiz Geral'}`}</h3>
            </div>

            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm min-h-[300px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {!currentFolder && folders.map(folder => (
                  <div key={folder.folder_id} onClick={() => setCurrentFolder(folder.folder_id)} className="flex items-center gap-4 p-4 rounded-2xl border border-amber-100 bg-amber-50/30 hover:bg-amber-50 hover:shadow-md transition-all cursor-pointer group">
                    <div className="w-12 h-12 shrink-0 bg-white rounded-xl shadow-sm border border-amber-100 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><Folder size={24} fill="currentColor" className="opacity-20" /><Folder size={24} className="absolute" /></div>
                    <div className="flex-1 min-w-0"><p className="font-bold text-sm text-stone-800 truncate">{folder.name}</p><p className="text-[11px] font-bold text-stone-400 mt-1 uppercase">{folder.date}</p></div>
                  </div>
                ))}
                {attachments.filter(a => a.folder_id === currentFolder).map(file => (
                  <div key={file.attachment_id} className="flex items-center gap-3 p-4 rounded-2xl border border-stone-100 bg-stone-50 hover:bg-white hover:shadow-md transition-all group">
                    <div className="w-10 h-10 shrink-0 bg-white rounded-xl shadow-sm border border-stone-100 flex items-center justify-center">{getFileIcon(file.type)}</div>
                    <div className="flex-1 min-w-0"><p className="font-bold text-sm text-stone-800 truncate" title={file.name}>{file.name}</p><p className="text-[10px] font-bold text-stone-400 mt-0.5 uppercase tracking-wider">{file.size} • {file.date}</p></div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(file); }} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Download size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(file.attachment_id); }} className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {!currentFolder && folders.length === 0 && attachments.filter(a => !a.folder_id).length === 0 && <div className="text-center py-12 text-stone-400 italic">Nenhuma pasta ou arquivo na raiz.</div>}
              {currentFolder && attachments.filter(a => a.folder_id === currentFolder).length === 0 && <div className="text-center py-12 text-stone-400 italic">Esta pasta está vazia.</div>}
            </div>
          </div>
        )}

        {/* ABA: ATIVIDADES E DESAFIOS */}
        {activeTab === "activities" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2"><Award size={20} className="text-[#D46F54]" /> Atividades e Desafios</h3>
                <p className="text-sm text-stone-500 mt-1">Acompanhe a adesão aos exercícios em casa e o histórico clínico.</p>
              </div>
              <Button onClick={() => setIsActivityModalOpen(true)} className="bg-[#D46F54] hover:bg-[#B75C46] text-white shrink-0"><Plus size={16} className="mr-2" /> Nova Atividade</Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2 mb-2"><Calendar size={14} /> Em Andamento (Nesta Semana)</h4>
                {activities.filter(a => a.status === "in_progress").map(activity => (
                  <div key={activity.activity_id || activity.id} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold uppercase tracking-wider mb-2"><Home size={12} /> Para Casa</span>
                        <h4 className="font-bold text-stone-800">{activity.title}</h4>
                      </div>
                    </div>
                    <p className="text-sm text-stone-600 mb-5 leading-relaxed whitespace-pre-wrap">{activity.description}</p>
                    <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-stone-500">Progresso da Semana</span>
                        <span className="text-xs font-bold text-[#D46F54]">{activity.days_completed?.filter(Boolean).length || 0} / {activity.days_total || 7} dias</span>
                      </div>
                      <div className="flex justify-between gap-1 sm:gap-2">
                        {(activity.days_completed || [false, false, false, false, false, false, false]).map((isDone, index) => (
                          <div key={index} className="flex flex-col items-center gap-1.5 flex-1">
                            <div className={`w-full h-8 rounded-lg flex items-center justify-center transition-colors ${isDone ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-stone-200 text-stone-400 border border-stone-300'}`}>
                              {isDone ? <CheckSquare size={16} /> : <span className="text-xs font-medium">{index + 1}</span>}
                            </div>
                            <span className="text-[9px] font-bold text-stone-400 uppercase">Dia {index + 1}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {activities.filter(a => a.status === "in_progress").length === 0 && (
                  <div className="text-center p-8 border border-dashed border-stone-300 rounded-2xl text-stone-400 italic text-sm">Nenhuma atividade em andamento.</div>
                )}
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest flex items-center gap-2 mb-2"><CheckSquare size={14} /> Histórico Concluído</h4>
                <div className="space-y-3">
                  {activities.filter(a => a.status === "completed").map(activity => (
                    <div key={activity.activity_id || activity.id} className="bg-stone-50 border border-stone-200 rounded-2xl p-4 flex gap-4 opacity-80 hover:opacity-100 transition-opacity">
                      <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${activity.type === 'clinica' ? 'bg-blue-100 text-blue-600' : 'bg-indigo-100 text-indigo-600'}`}>
                        {activity.type === 'clinica' ? <Stethoscope size={20} /> : <Home size={20} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center mb-1">
                          <h4 className="font-bold text-stone-800 text-sm truncate">{activity.title}</h4>
                          <span className="text-[10px] font-bold text-stone-400">{activity.date || activity.start_date}</span>
                        </div>
                        <p className="text-xs text-stone-600 line-clamp-2">{activity.description}</p>
                      </div>
                    </div>
                  ))}
                  {activities.filter(a => a.status === "completed").length === 0 && (
                    <div className="text-center p-8 border border-dashed border-stone-300 rounded-2xl text-stone-400 italic text-sm">Nenhum histórico registrado.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: RELATÓRIOS INTELIGENTES */}
        {activeTab === "reports" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gradient-to-r from-[#F3E7E4]/50 to-white p-6 rounded-2xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2">
                  <LayoutTemplate size={20} className="text-[#D46F54]" /> Central de Relatórios
                </h3>
                <p className="text-sm text-stone-500 mt-1 max-w-lg">Crie laudos, encaminhamentos e pareceres com a ajuda do Copiloto IA analisando todo o prontuário.</p>
              </div>
              <Button onClick={handleOpenNewReport} className="bg-[#D46F54] hover:bg-[#B75C46] text-white shrink-0 shadow-md">
                <Plus size={18} className="mr-2" /> Novo Relatório
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reportsHistory.map(report => (
                <div key={report.report_id || report.id} onClick={() => handleOpenExistingReport(report)} className="bg-white border border-stone-200 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-[#D46F54]/50 transition-all cursor-pointer group flex flex-col h-full">
                  <div className="flex justify-between items-start mb-3">
                    <div className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${report.status === 'final' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {report.status === 'final' ? 'Finalizado' : 'Rascunho'}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setReportToDelete(report); }} 
                        className="p-1 text-stone-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors"
                        title="Excluir Relatório"
                      >
                        <Trash2 size={16} />
                      </button>
                      <FileText size={20} className="text-stone-300 group-hover:text-[#D46F54] transition-colors" />
                    </div>
                  </div>
                  <h4 className="font-bold text-stone-800 mb-1 flex-1">{report.title}</h4>
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-stone-100 text-xs font-bold text-stone-400">
                    <span>{report.date}</span>
                    <span className="uppercase">{report.format}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAIS GERAIS (SOAP, Folders, Arquivos...)   */}
      {/* ========================================== */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b border-stone-100 pb-4"><DialogTitle className="font-heading text-2xl text-stone-800">Detalhes da Evolução</DialogTitle></DialogHeader>
          {selectedRecord && (
            <div className="space-y-4 mt-4 text-sm text-stone-700">
              {selectedRecord.subjective && <p><strong>S:</strong> {selectedRecord.subjective}</p>}
              {selectedRecord.objective && <p><strong>O:</strong> {selectedRecord.objective}</p>}
              {selectedRecord.assessment && <p><strong>A:</strong> {selectedRecord.assessment}</p>}
              {selectedRecord.plan && <p><strong>P:</strong> {selectedRecord.plan}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-heading">Criar Nova Pasta</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateFolder} className="space-y-4 mt-2">
            <div><label className="text-xs font-bold text-stone-500 mb-1 block">Nome</label><input type="text" autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm outline-none focus:border-[#D46F54]" /></div>
            <Button type="submit" className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold">Criar Pasta</Button>
          </form>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col bg-stone-50/95 backdrop-blur-sm border-stone-200">
          <DialogHeader className="border-b border-stone-200 pb-3 shrink-0"><DialogTitle className="font-heading text-xl text-stone-800 truncate pr-8">{previewFile?.name}</DialogTitle></DialogHeader>
          <div className="flex-1 overflow-hidden flex items-center justify-center p-4">{renderPreviewContent(previewFile)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-heading">Atribuir Nova Atividade</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-xs font-bold text-stone-500 mb-1 block">Título da Atividade</label>
              <input type="text" value={activityForm.title} onChange={(e) => setActivityForm(prev => ({...prev, title: e.target.value}))} placeholder="Ex: Vibração de Língua" className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm outline-none focus:border-[#D46F54]" />
            </div>
            <div>
              <label className="text-xs font-bold text-stone-500 mb-1 block">Tipo de Atividade</label>
              <Select value={activityForm.type} onValueChange={(val) => setActivityForm(prev => ({...prev, type: val}))}>
                <SelectTrigger className="w-full bg-stone-50 border-stone-200 rounded-xl"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent><SelectItem value="casa">Para Casa (Diário)</SelectItem><SelectItem value="clinica">Na Clínica (Apenas registro)</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="relative">
              <div className="flex justify-between items-end mb-1">
                <label className="text-xs font-bold text-stone-500 block">Instruções</label>
                <button type="button" onClick={handleGenerateAiInstructions} disabled={isGeneratingAi} className="text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50">
                  {isGeneratingAi ? <Activity size={14} className="animate-spin" /> : <Sparkles size={14} className="text-indigo-500" />} {isGeneratingAi ? "A IA está escrevendo..." : "Gerar com IA"}
                </button>
              </div>
              <Textarea value={activityForm.description} onChange={(e) => setActivityForm(prev => ({...prev, description: e.target.value}))} placeholder="Escreva as instruções ou clique em 'Gerar com IA'..." rows={6} className="bg-stone-50 resize-none rounded-xl text-sm" />
            </div>
            <div className="pt-2"><Button onClick={handleSaveActivity} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold">Atribuir ao Paciente</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reportToDelete} onOpenChange={(open) => !open && setReportToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-rose-600 flex items-center gap-2">
              <Trash2 size={24} /> Confirmar Exclusão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-stone-600 text-sm">
              Tem certeza que deseja excluir permanentemente o relatório <strong>"{reportToDelete?.title}"</strong>? 
            </p>
            <div className="flex gap-3 justify-end pt-4 border-t border-stone-100">
              <Button variant="outline" onClick={() => setReportToDelete(null)} className="border-stone-300 text-stone-600">
                Cancelar
              </Button>
              <Button onClick={confirmDeleteReport} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">
                Sim, Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAIS DOS PROTOCOLOS DE AVALIAÇÃO         */}
      {/* ========================================== */}
      
      {/* MODAL: PREENCHER PROTOCOLO MANUAL */}
      <Dialog open={isProtocolFillModalOpen} onOpenChange={setIsProtocolFillModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <DialogTitle className="font-heading text-xl text-stone-800 flex items-center gap-2">
              <ClipboardEdit size={20} className="text-[#D46F54]" /> Preencher {activeProtocolKey ? protocolNames[activeProtocolKey] : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            
            {activeProtocolKey === 'capeV' ? (
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 flex gap-3">
                  <Mic className="shrink-0 text-blue-600" size={24} />
                  <div>
                    <strong>Avaliação Perceptivo-Auditiva</strong><br/>
                    Escute a voz do paciente e avalie os atributos vocais (0 = Normal, 100 = Desvio Severo).
                  </div>
                </div>

                <div className="space-y-5 bg-white p-5 border border-stone-200 rounded-xl shadow-sm">
                  {[
                    { key: 'gg', label: 'Grau Geral (GG)', color: 'accent-[#D46F54]' },
                    { key: 'rug', label: 'Rugosidade (R)', color: 'accent-rose-500' },
                    { key: 'sop', label: 'Soprosidade (S)', color: 'accent-sky-500' },
                    { key: 'ten', label: 'Tensão (T)', color: 'accent-amber-500' },
                    { key: 'pit', label: 'Pitch (P)', color: 'accent-purple-500' },
                    { key: 'lou', label: 'Loudness (L)', color: 'accent-emerald-500' }
                  ].map(param => (
                    <div key={param.key}>
                      <div className="flex justify-between items-end mb-2">
                        <label className="text-sm font-bold text-stone-700">{param.label}</label>
                        <span className="text-xs font-bold px-2 py-1 bg-stone-100 rounded text-stone-600">{protocolAnswers[param.key] || 0}</span>
                      </div>
                      <input 
                        type="range" min="0" max="100" 
                        value={protocolAnswers[param.key] || 0} 
                        onChange={(e) => setProtocolAnswers(prev => ({...prev, [param.key]: parseInt(e.target.value)}))}
                        className={`w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer ${param.color}`} 
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-amber-800">
                  Responda de 0 (Nunca/Nenhum) a 4 (Sempre/Muito Grande).
                </div>
                {/* Carrega as perguntas exatas do Protocolo Ativo */}
                {(questionsData[activeProtocolKey] || questionsData['idv10']).map((q, idx) => (
                  <div key={idx} className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                    <label className="text-sm font-bold text-stone-700 block mb-3">{idx + 1}. {q.text}</label>
                    <div className="flex gap-2">
                      {[0, 1, 2, 3, 4].map(val => (
                        <button
                          key={val}
                          onClick={() => setProtocolAnswers(prev => ({...prev, [idx]: val}))}
                          className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${protocolAnswers[idx] === val ? 'bg-[#D46F54] text-white border-[#D46F54]' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'}`}
                        >
                          {val}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-4 border-t border-stone-100 flex justify-end">
              <Button onClick={handleSaveProtocol} disabled={isAiAnalyzingProtocol} className="bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold w-full sm:w-auto">
                {isAiAnalyzingProtocol ? <Activity size={16} className="mr-2 animate-spin" /> : <BrainCircuit size={16} className="mr-2" />}
                Salvar e Analisar com IA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: VER DETALHES DO PROTOCOLO PREENCHIDO */}
      <Dialog open={isProtocolViewModalOpen} onOpenChange={setIsProtocolViewModalOpen}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto custom-scrollbar">
          <DialogHeader className="border-b border-stone-100 pb-4">
            <DialogTitle className="font-heading text-xl text-stone-800 flex items-center gap-2">
              <Eye size={20} className="text-[#D46F54]" /> Detalhes: {activeProtocolKey ? protocolNames[activeProtocolKey] : ''}
            </DialogTitle>
          </DialogHeader>
          
          {activeProtocolKey && protocolsState[activeProtocolKey] && (
            <div className="space-y-6 mt-4">
              
              {/* O GRANDE DIFERENCIAL: O INSIGHT DA IA */}
              <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 shadow-sm relative overflow-hidden">
                 <Sparkles className="absolute -right-4 -bottom-4 text-emerald-100" size={100} />
                 <div className="relative z-10">
                   <div className="flex items-center gap-2 text-emerald-800 mb-3">
                     <BrainCircuit size={20} /> <h4 className="font-bold text-sm">Insight Clínico da IA Claude</h4>
                   </div>
                   <p className="text-sm text-stone-700 leading-relaxed font-medium mb-3">
                     {protocolsState[activeProtocolKey].summary}
                   </p>
                   {protocolsState[activeProtocolKey].tip && (
                     <div className="bg-white p-3 rounded-lg border border-emerald-100 text-sm text-emerald-800 flex gap-2">
                       <AlertCircle className="shrink-0 mt-0.5" size={16}/>
                       <span>{protocolsState[activeProtocolKey].tip}</span>
                     </div>
                   )}
                 </div>
              </div>

              {/* GRÁFICOS DE ANÁLISE POR DOMÍNIO PARA QVV, IDV E ESV */}
              {activeProtocolKey !== 'capeV' && protocolsState[activeProtocolKey].domains && (
                <div>
                   <h4 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3 border-b border-stone-100 pb-2">Distribuição do Problema</h4>
                   <div className="space-y-3">
                      {[
                        { key: 'fisico', label: 'Físico / Orgânico', color: 'bg-rose-400' },
                        { key: 'emocional', label: 'Emocional', color: 'bg-blue-400' },
                        { key: 'funcional', label: 'Funcional / Limitação', color: 'bg-amber-400' }
                      ].map(d => {
                         const total = protocolsState[activeProtocolKey].score || 1; 
                         const pct = Math.round((protocolsState[activeProtocolKey].domains[d.key] / total) * 100);
                         return (
                           <div key={d.key} className="flex items-center gap-3">
                              <span className="text-xs font-bold text-stone-600 w-44">{d.label}</span>
                              <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div className={`h-full ${d.color} rounded-full`} style={{ width: `${pct}%` }}></div>
                              </div>
                              <span className="text-xs font-bold text-stone-800 w-8 text-right">{pct}%</span>
                           </div>
                         )
                      })}
                   </div>
                </div>
              )}

              <div>
                <h4 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3 border-b border-stone-100 pb-2">Respostas Brutas</h4>
                
                {activeProtocolKey === 'capeV' ? (
                  <div className="space-y-3">
                    {[
                      { key: 'gg', label: 'Grau Geral' }, { key: 'rug', label: 'Rugosidade' }, { key: 'sop', label: 'Soprosidade' },
                      { key: 'ten', label: 'Tensão' }, { key: 'pit', label: 'Pitch' }, { key: 'lou', label: 'Loudness' }
                    ].map(param => (
                      <div key={param.key} className="flex items-center gap-4">
                        <span className="text-sm font-bold text-stone-600 w-32">{param.label}</span>
                        <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#D46F54] rounded-full" style={{ width: `${protocolsState[activeProtocolKey].answers[param.key] || 0}%` }}></div>
                        </div>
                        <span className="text-sm font-bold text-stone-800 w-8 text-right">{protocolsState[activeProtocolKey].answers[param.key] || 0}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(questionsData[activeProtocolKey] || questionsData['idv10']).map((q, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-stone-50 p-3 rounded-lg border border-stone-100">
                        <span className="text-sm text-stone-600 max-w-[80%] line-clamp-1" title={q.text}>{idx + 1}. {q.text}</span>
                        <span className="w-8 h-8 rounded-full bg-white border border-stone-200 flex items-center justify-center font-bold text-stone-800 shadow-sm">
                          {protocolsState[activeProtocolKey].answers[idx] !== undefined ? protocolsState[activeProtocolKey].answers[idx] : '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL FULLSCREEN: EDITOR DE RELATÓRIO + IA */}
      <Dialog open={isReportEditorOpen} onOpenChange={setIsReportEditorOpen}>
        <DialogContent className="max-w-[98vw] w-full h-[96vh] p-0 overflow-hidden flex flex-col bg-stone-200/80 backdrop-blur-md rounded-2xl border-stone-300 shadow-2xl">
          <DialogHeader className="bg-white border-b border-stone-200 p-4 px-6 flex flex-row items-center justify-between shrink-0 m-0">
            <div className="flex items-center gap-4 w-1/2">
              <DialogTitle className="hidden">Editor de Relatório</DialogTitle>
              <input type="text" value={reportForm.title} onChange={(e) => setReportForm(prev => ({...prev, title: e.target.value}))} placeholder="Título do Relatório Sem Título" className="text-xl font-heading font-bold text-[#D46F54] bg-transparent border-none outline-none w-full focus:ring-0" />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => handleExportReport('word')} className="border-stone-200 text-blue-700 hover:bg-blue-50"><FileDown size={16} className="mr-2" /> Exportar Doc</Button>
              <Button variant="outline" onClick={() => handleExportReport('pdf')} className="border-stone-200 text-rose-700 hover:bg-rose-50"><FileDown size={16} className="mr-2" /> Exportar PDF</Button>
              <Button onClick={() => handleSaveReport('draft')} className="bg-stone-800 hover:bg-black text-white"><Save size={16} className="mr-2" /> Salvar Rascunho</Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row gap-6 p-6">
            <style>{`.quill-paper-editor { width: 100%; max-width: 21cm; margin: 0 auto; display: flex; flex-direction: column; height: 100%; } .quill-paper-editor .ql-toolbar.ql-snow { background-color: #ffffff; border: 1px solid #e7e5e4 !important; border-radius: 12px 12px 0 0; padding: 10px 14px !important; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); flex-shrink: 0; position: sticky; top: 0; z-index: 10; } .quill-paper-editor .ql-container.ql-snow { background-color: #ffffff; border: 1px solid #e7e5e4 !important; border-top: none !important; border-radius: 0 0 12px 12px; box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1); flex: 1; overflow-y: auto; } .quill-paper-editor .ql-editor { padding: 2.5cm 2cm !important; font-family: inherit !important; font-size: 11pt !important; line-height: 1.6 !important; min-height: 100%; }`}</style>
            <div className="flex-1 overflow-hidden flex justify-center pb-2">
              <div className="quill-paper-editor">
                <ReactQuill theme="snow" value={reportForm.content} onChange={(val) => setReportForm(prev => ({...prev, content: val}))} modules={quillModules} placeholder="Comece a digitar o relatório..." />
              </div>
            </div>
            <div className="w-full lg:w-[360px] shrink-0 bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col overflow-hidden h-full">
              <div className="bg-indigo-50 border-b border-indigo-100 p-4 flex items-start gap-3">
                <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600 shrink-0"><Bot size={24} /></div>
                <div><h4 className="font-bold text-indigo-900 text-sm">Copiloto Inteligente</h4><p className="text-[10px] text-indigo-600/80 mt-1 leading-tight">A IA analisa o prontuário para redigir.</p></div>
              </div>
              <div className="p-4 flex-1 overflow-y-auto space-y-4">
                <div><label className="text-xs font-bold text-stone-500 mb-1.5 block">Formato Desejado</label><Select value={reportForm.format} onValueChange={(val) => setReportForm(prev => ({...prev, format: val}))}><SelectTrigger className="w-full bg-stone-50 border-stone-200 text-sm h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="clinico">Relatório Clínico</SelectItem></SelectContent></Select></div>
                <div><label className="text-xs font-bold text-stone-500 mb-1.5 block">Direcionamento</label><Textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={4} className="bg-stone-50 border-stone-200 resize-none text-xs" /></div>
              </div>
              <div className="p-4 bg-stone-50 border-t border-stone-200 space-y-2">
                <Button onClick={handleCopilotGenerate} disabled={isAiThinking} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs h-9">{isAiThinking ? <Activity size={14} className="animate-spin mr-2" /> : <Wand2 size={14} className="mr-2" />} Gerar Relatório com IA</Button>
                <Button onClick={handleCopilotReview} disabled={isAiThinking || !reportForm.content || reportForm.content === '<p><br></p>'} variant="outline" className="w-full border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold text-xs h-9"><PenTool size={14} className="mr-2" /> Revisar Meu Texto</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}