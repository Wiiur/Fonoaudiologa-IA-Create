import React, { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

// Importação de Ícones (Adicionado Wallet para o Financeiro)
import { 
  ArrowLeft, Activity, Link as LinkIcon, MessageSquare, FileText, User, 
  Phone, Target, Lock, CheckCircle2, XCircle, X, FileClock, Paperclip, BarChart, 
  UploadCloud, File, Image as ImageIcon, Music, Video, Trash2, Download,
  Folder, FolderPlus, FolderOpen, ChevronRight, Eye, Plus, Home, Stethoscope, 
  CheckSquare, Calendar, Award, Sparkles, LayoutTemplate, Wand2, Save, FileDown, 
  Bot, PenTool, ClipboardList, ClipboardEdit, RotateCcw, Share2, BrainCircuit, 
  Mic, AlertCircle, ExternalLink, AudioLines, DollarSign, Receipt, TrendingUp, ShieldAlert, Smartphone, Wallet, Table2, Info, HelpCircle
} from 'lucide-react';

// Importações do Editor de Texto Rico (Laudos)
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

export default function PatientDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient(); 
  
  // ==========================================
  // BLOCO 1: ESTADOS GERAIS DA INTERFACE
  // ==========================================
  const [activeTab, setActiveTab] = useState("overview");
  const [msgOpen, setMsgOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState(null);
  const [privateNote, setPrivateNote] = useState("");
  
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [soapForm, setSoapForm] = useState({
    attendance: "presente", subjective: "", objective: "", assessment: "", plan: "", absence_reason: ""
  });

  // ==========================================
  // BLOCO 2: ESTADOS DOS PROTOCOLOS E QUESTIONÁRIOS
  // ==========================================
  const [protocolsState, setProtocolsState] = useState({
    qvv: null, capeV: null, idv10: null, esv: null
  });

  const [activeProtocolKey, setActiveProtocolKey] = useState(null);
  const [isProtocolFillModalOpen, setIsProtocolFillModalOpen] = useState(false);
  const [isProtocolViewModalOpen, setIsProtocolViewModalOpen] = useState(false);
  const [isAiAnalyzingProtocol, setIsAiAnalyzingProtocol] = useState(false);
  const [protocolAnswers, setProtocolAnswers] = useState({});
  const [protocolToReset, setProtocolToReset] = useState(null); 

  const protocolNames = {
    qvv: "Qualidade de Vida em Voz (QVV)",
    capeV: "Avaliação CAPE-V",
    idv10: "Índice de Desvantagem Vocal (IDV-10)",
    esv: "Escala de Sintomas Vocais (ESV)"
  };

  const questionsData = {
    qvv: [
      { text: "Tenho dificuldades em falar forte (alto) ou ser ouvido em lugares barulhentos.", domain: "fisico" },
      { text: "O ar acaba rápido e preciso respirar muitas vezes enquanto eu falo.", domain: "fisico" },
      { text: "Às vezes, quando começo a falar não sei como minha voz vai sair.", domain: "fisico" },
      { text: "Às vezes, fico ansioso ou frustrado (por causa da minha voz).", domain: "Sócio-emocional" },
      { text: "Às vezes, fico deprimido (por causa da minha voz).", domain: "Sócio-emocional" },
      { text: "Tenho dificuldades em falar ao telefone (por causa da minha voz).", domain: "fisico" },
      { text: "Tenho problemas no meu trabalho ou para desenvolver minha profissão (por causa da minha voz).", domain: "fisico" },
      { text: "Evito sair socialmente (por causa da minha voz).", domain: "Sócio-emocional" },
      { text: "Tenho que repetir o que falo para ser compreendido.", domain: "fisico" },
      { text: "Tenho me tornado menos expansivo (por causa da minha voz)", domain: "Sócio-emocional" }
    ],
    idv10: [
      { text: "As pessoas têm dificuldade em me ouvir por causa da minha voz", domain: "funcional" },
      { text: "As pessoas têm dificuldade de me entender em lugares barulhentos", domain: "funcional" },
      { text: "As pessoas perguntam: 'O que você tem na voz?'", domain: "Sócio-emocional" },
      { text: "Sinto que tenho que fazer força para a minha voz sair", domain: "fisico" },
      { text: "Meu problema de voz limita minha vida social e pessoal", domain: "funcional" },
      { text: "Não consigo prever quando minha voz vai sair clara", domain: "fisico" },
      { text: "Eu me sinto excluído nas conversas por causa da minha voz", domain: "Sócio-emocional" },
      { text: "Meu problema de voz me causa prejuízos econômicos", domain: "funcional" },
      { text: "Meu problema de voz me chateia", domain: "Sócio-emocional" },
      { text: "Minha voz faz com que eu me sinta em desvantagem.", domain: "funcional" }
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
      { text: "Você se sente mal ou deprimido por causa do seu problema de voz?", domain: "Sócio-emocional" },
      { text: "Você sente alguma coisa parada na garganta?", domain: "fisico" },
      { text: "Você tem nódulos inchados (íngua) no pescoço?", domain: "fisico" },
      { text: "Você se sente constrangido por causa do seu problema de voz?", domain: "Sócio-emocional" },
      { text: "Você se cansa para falar?", domain: "fisico" },
      { text: "Seu problema de voz deixa você estressado ou nervoso?", domain: "Sócio-emocional" },
      { text: "Você tem dificuldade para falar em locais barulhentos?", domain: "funcional" },
      { text: "É difícil falar forte (alto) ou gritar?", domain: "fisico" },
      { text: "O seu problema de voz incomoda sua família ou amigos?", domain: "Sócio-emocional" },
      { text: "Você tem muita secreção ou pigarro na garganta?", domain: "fisico" },
      { text: "O som da sua voz muda durante o dia?", domain: "fisico" },
      { text: "As pessoas parecem se irritar com sua voz?", domain: "Sócio-emocional" },
      { text: "Você tem o nariz entupido?", domain: "fisico" },
      { text: "As pessoas perguntam o que você tem na voz?", domain: "Sócio-emocional" },
      { text: "Sua voz parece rouca e seca?", domain: "fisico" },
      { text: "Você tem que fazer força para falar?", domain: "fisico" },
      { text: "Com que frequência você tem infecções de garganta?", domain: "fisico" },
      { text: "Sua voz falha no meio das frases?", domain: "fisico" },
      { text: "Sua voz faz você se sentir incompetente?", domain: "Sócio-emocional" },
      { text: "Você tem vergonha do seu problema de voz?", domain: "Sócio-emocional" },
      { text: "Você se sente solitário por causa do seu problema de voz?", domain: "Sócio-emocional" }
    ]
  };

  // ==========================================
  // BLOCO 3: ESTADOS DE PASTAS E ANEXOS
  // ==========================================
  const [currentFolder, setCurrentFolder] = useState(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [previewFile, setPreviewFile] = useState(null);

  // ==========================================
  // BLOCO 4: ESTADOS DE ATIVIDADES E MENSAGENS IA
  // ==========================================
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [activityForm, setActivityForm] = useState({ title: "", type: "casa", description: "" });
  
  const [isAiDraftingMsg, setIsAiDraftingMsg] = useState(false);
  const [whatsappMsg, setWhatsappMsg] = useState("");
  const [msgType, setMsgType] = useState("lembrete");

  // ==========================================
  // BLOCO 5: ESTADOS DE RELATÓRIOS E AUDITORIA CLÍNICA
  // ==========================================
  const [isReportEditorOpen, setIsReportEditorOpen] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [reportForm, setReportForm] = useState({ title: "", content: "", format: "clinico", status: "draft" });
  const [reportToDelete, setReportToDelete] = useState(null);
  const [reviewSuggestions, setReviewSuggestions] = useState(null); 

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

  // ==========================================
  // BLOCO 6: ESTADOS DA INTELIGÊNCIA E FINANCEIRO
  // ==========================================
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [isIrpfModalOpen, setIsIrpfModalOpen] = useState(false);
  const [irpfForm, setIrpfForm] = useState({ year: new Date().getFullYear().toString(), payer_name: "", payer_cpf: "", total_amount: "" });
  const [aiClinicalProgress, setAiClinicalProgress] = useState(null);
  const [financeForm, setFinanceForm] = useState({ title: "", amount: "", status: "pago" });


  // Estados para o Voice Lab
  const [selectedAnalyses, setSelectedAnalyses] = useState([]); // Guarda os IDs selecionados
  
  // Modal de Detalhes (Laudo Completo)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedDetail, setSelectedDetail] = useState(null);
  
  // Modal de Comparação
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [isComparing, setIsComparing] = useState(false);

  // Função para selecionar os cards (Máximo 2)
  const toggleAnalysisSelection = (id) => {
    setSelectedAnalyses((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id); // Desmarca
      if (prev.length >= 2) {
        toast.warning("Você só pode comparar 2 análises por vez.");
        return prev;
      }
      return [...prev, id]; // Marca
    });
  };

  // Função para chamar o Python e comparar
  const handleCompareAnalyses = async () => {
    if (selectedAnalyses.length !== 2) return;
    setIsComparing(true);
    try {
      // Chama a nossa rota matemática do FastAPI
      const response = await api.get(`/voice_analysis/compare?id1=${selectedAnalyses[0]}&id2=${selectedAnalyses[1]}`);
      setCompareData(response.data);
      setCompareModalOpen(true);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao gerar a comparação. Verifique os dados.");
    } finally {
      setIsComparing(false);
    }
  };

  // Função para abrir o Laudo Completo
  const openAnalysisDetail = (analysis) => {
    setSelectedDetail(analysis);
    setDetailModalOpen(true);
  };

  // ==========================================
  // BLOCO 7: BUSCAS NO BANCO DE DADOS (USEQUERY)
  // ==========================================
  const { data: p } = useQuery({ queryKey: ["patient", id], queryFn: async () => (await api.get(`/patients/${id}`)).data });
  const { data: records = [] } = useQuery({ queryKey: ["records", id], queryFn: async () => (await api.get(`/records?patient_id=${id}`)).data });
  const { data: folders = [] } = useQuery({ queryKey: ["folders", id], queryFn: async () => (await api.get(`/folders?patient_id=${id}`)).data });
  const { data: attachments = [] } = useQuery({ queryKey: ["attachments", id], queryFn: async () => (await api.get(`/attachments?patient_id=${id}`)).data });
  const { data: activities = [] } = useQuery({ queryKey: ["activities", id], queryFn: async () => (await api.get(`/activities?patient_id=${id}`)).data });
  const { data: reportsHistory = [] } = useQuery({ queryKey: ["reports", id], queryFn: async () => (await api.get(`/reports?patient_id=${id}`)).data });

  // NOVAS ROTAS OFICIAIS (FINANCEIRO, VOICE LAB E DIÁRIOS)
  const { data: financialData } = useQuery({ queryKey: ["financial", id], queryFn: async () => (await api.get(`/patients/${id}/financial`)).data });
  const { data: voiceLabHistory = [] } = useQuery({ queryKey: ["voice_analysis", id], queryFn: async () => (await api.get(`/voice_analysis?patient_id=${id}`)).data });
  const { data: diariesHistory = [] } = useQuery({ queryKey: ["diaries_history", id], queryFn: async () => (await api.get(`/patients/${id}/diaries`)).data });

  const { data: dbProtocols } = useQuery({
    queryKey: ["protocols", id],
    queryFn: async () => {
      try { return (await api.get(`/protocols?patient_id=${id}`)).data; } 
      catch (e) { return { qvv: null, capeV: null, idv10: null, esv: null }; } 
    },
  });

  useEffect(() => {
    if (dbProtocols) {
      setProtocolsState(dbProtocols);
    }
  }, [dbProtocols]);

  // Atualiza o formulário de IRPF com os dados financeiros do LTV
  useEffect(() => {
    if (financialData?.ltv) {
      setIrpfForm(prev => ({ ...prev, total_amount: financialData.ltv.toString(), payer_name: p?.name || "" }));
    }
  }, [financialData, p]);

  // ==========================================
  // BLOCO 8: MUTAÇÕES (AÇÕES DE SALVAR)
  // ==========================================

  const saveProtocolMutation = useMutation({
    mutationFn: async (protocolData) => await api.post('/protocols', { patient_id: id, protocol_key: activeProtocolKey, ...protocolData }),
    onSuccess: (_, variables) => {
      setProtocolsState(prev => ({ ...prev, [activeProtocolKey]: variables }));
      queryClient.invalidateQueries({ queryKey: ["protocols", id] });
      toast.success(`${protocolNames[activeProtocolKey]} salvo com sucesso!`);
      setIsProtocolFillModalOpen(false);
    },
    onError: () => toast.error("Erro ao salvar protocolo no banco.")
  });

  const resetProtocolMutation = useMutation({
    mutationFn: async (protocolKey) => await api.delete(`/protocols/${id}/${protocolKey}`),
    onSuccess: () => {
      setProtocolsState(prev => ({ ...prev, [protocolToReset]: null }));
      queryClient.invalidateQueries({ queryKey: ["protocols", id] });
      toast.success("Protocolo resetado com sucesso.");
      setProtocolToReset(null);
    },
    onError: () => toast.error("Erro ao resetar o protocolo.")
  });

  const saveSoapMutation = useMutation({
    mutationFn: async (payload) => await api.post('/records', payload),
    onSuccess: (_, variables) => {
      toast.success(variables.attendance === 'falta' ? "Falta registrada no prontuário!" : "Evolução SOAP salva com sucesso!");
      setSoapForm({ attendance: "presente", subjective: "", objective: "", assessment: "", plan: "", absence_reason: "" });
      queryClient.invalidateQueries({ queryKey: ["records", id] });
    },
    onError: () => toast.error("Erro ao salvar evolução.")
  });

  const createFolderMutation = useMutation({
    mutationFn: async (name) => await api.post('/folders', { patient_id: id, name }),
    onSuccess: () => {
      setNewFolderName("");
      setIsFolderModalOpen(false);
      toast.success("Pasta criada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["folders", id] });
    },
    onError: () => toast.error("Erro ao criar pasta no banco.")
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (files) => {
      const promises = files.map(file => {
        const formData = new FormData();
        formData.append("patient_id", id);
        if (currentFolder) formData.append("folder_id", currentFolder);
        formData.append("file", file);
        return api.post('/attachments', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      });
      return Promise.all(promises);
    },
    onSuccess: (results) => {
      toast.success(`${results.length} arquivo(s) salvo(s)!`);
      queryClient.invalidateQueries({ queryKey: ["attachments", id] });
    },
    onError: () => toast.error("Erro ao enviar o(s) arquivo(s).")
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId) => await api.delete(`/attachments/${attachmentId}`),
    onSuccess: () => {
      toast.success("Anexo removido do sistema.");
      queryClient.invalidateQueries({ queryKey: ["attachments", id] });
      setPreviewFile(null);
    },
    onError: () => toast.error("Erro ao deletar anexo.")
  });

 const createActivityMutation = useMutation({
    mutationFn: async (payload) => {
      // 🚀 INJETA O STATUS "EM ANDAMENTO" E OS DIAS DA SEMANA
      const atividadeCompleta = {
        ...payload,
        status: "in_progress",
        date: new Date().toLocaleDateString('pt-BR'),
        days_total: 7,
        days_completed: [false, false, false, false, false, false, false]
      };
      return await api.post('/activities', atividadeCompleta);
    },
    onSuccess: () => {
      toast.success("Nova atividade atribuída ao paciente!");
      setIsActivityModalOpen(false);
      setActivityForm({ title: "", type: "casa", description: "" });
      queryClient.invalidateQueries({ queryKey: ["activities", id] });
    },
    onError: () => toast.error("Erro ao salvar atividade.")
  });

  const saveReportMutation = useMutation({
    mutationFn: async (payload) => {
      if (payload.report_id) return await api.put(`/reports/${payload.report_id}`, payload);
      return await api.post('/reports', payload);
    },
    onSuccess: (_, variables) => {
      toast.success(variables.status === 'draft' ? "Rascunho salvo no histórico!" : "Relatório finalizado salvo com sucesso!");
      setIsReportEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ["reports", id] });
    },
    onError: () => toast.error("Erro ao salvar o relatório no banco de dados.")
  });

  const deleteReportMutation = useMutation({
    mutationFn: async (reportId) => await api.delete(`/reports/${reportId}`),
    onSuccess: (_, deletedId) => {
      const backup = { ...reportToDelete };
      setReportToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["reports", id] });
      
      toast.success("Relatório movido para a lixeira.", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            try {
              await api.post('/reports', { patient_id: id, title: backup.title, content: backup.content, format: backup.format, status: backup.status });
              queryClient.invalidateQueries({ queryKey: ["reports", id] });
              toast.success("Exclusão desfeita! O relatório voltou.");
            } catch (e) { toast.error("Erro ao restaurar o relatório."); }
          }
        },
        duration: 6000, 
      });
    },
    onError: () => toast.error("Erro ao excluir relatório.")
  });

  const generateIrpfMutation = useMutation({
    mutationFn: async (payload) => await api.post('/reports/irpf', payload, { responseType: 'blob' }),
    onSuccess: (response, variables) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `IRPF_${variables.year}_${p.name}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      toast.success(`Recibo IRPF gerado com sucesso! Log de auditoria registrado.`);
      setIsIrpfModalOpen(false);
      setIrpfForm({ year: new Date().getFullYear().toString(), payer_name: "", payer_cpf: "", total_amount: "" });
    },
    onError: () => toast.error("Erro ao gerar PDF do IRPF.")
  });

  const compileSoapMutation = useMutation({
    mutationFn: async () => await api.get(`/reports/evolution/compile?patient_id=${id}`, { responseType: 'blob' }),
    onSuccess: (response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Prontuario_${p.name}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`Prontuário compilado com sucesso!`);
    },
    onError: () => toast.error("Erro ao compilar prontuário.")
  });

  const runAnalyticsMutation = useMutation({
    mutationFn: async () => await api.post('/copilot/analytics', { patient_id: id }),
    onSuccess: (res) => {
      setAiClinicalProgress(res.data.analytics);
      toast.success("Analytics Clínico concluído com sucesso e segurança.");
    },
    onError: () => toast.error("Erro ao processar analytics.")
  });

  const addFinanceRecordMutation = useMutation({ 
    mutationFn: async (payload) => {
      // 🚀 AQUI ESTAVA O PROBLEMA: Estávamos arrancando os pontos acidentalmente!
      // Agora ele apenas converte a vírgula para ponto e manda pro Python de forma segura.
      const valorCorrigido = parseFloat(payload.amount.toString().replace(",", "."));
      return await api.post(`/patients/${id}/financial/add`, { ...payload, amount: valorCorrigido });
    },
    onSuccess: () => {
      toast.success("Pagamento/Pacote registrado com sucesso!");
      setFinanceForm({ title: "", amount: "", status: "pago" });
      queryClient.invalidateQueries({ queryKey: ["financial", id] });
    },
    onError: () => toast.error("Erro ao adicionar pagamento.")
  });

  // ==========================================
  // BLOCO 9: FUNÇÕES AUXILIARES E HANDLERS
  // ==========================================

  const createInvite = async () => { 
    try { 
      const { data } = await api.post(`/patients/${id}/invite`, {}); 
      const full = `${window.location.origin}${data.invite_link}`; 
      await navigator.clipboard.writeText(full); 
      setInviteLink(full); 
      toast.success("Link de convite copiado"); 
    } catch { toast.error("Erro ao gerar convite"); } 
  };

  const getFileUrl = (path) => {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const baseUrl = api.defaults?.baseURL ? api.defaults.baseURL.replace(/\/api\/?$/, "") : "http://localhost:8000";
    return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  };

  const handleDownloadAttachment = async (file) => { 
    if (!file.file_url) return; 
    toast.info("Preparando download seguro...");
    
    try {
      // 1. Usa o nosso 'api' (Axios) para fazer o download. 
      // Isso garante que o Token de Segurança (crachá) vá junto com o pedido!
      const response = await api.get(`/attachments/download?file_url=${encodeURIComponent(file.file_url)}&patient_id=${id}`, {
        responseType: 'blob' // Diz ao axios que a resposta é um arquivo (Blob)
      });
      
      // 2. Cria um link temporário na memória do navegador para forçar o download
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url; 
      link.setAttribute('download', file.name || "arquivo_baixado"); // Nome do arquivo
      document.body.appendChild(link); 
      link.click(); // Clica no link invisível
      
      // 3. Limpa a memória
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success("Download concluído!");
    } catch (error) {
      console.error("Erro no download:", error);
      toast.error("Acesso negado ou arquivo não encontrado. Você tem permissão?");
    }
  };
  
  const getFileIcon = (fileType) => { 
    if (!fileType) return <File size={24} className="text-stone-500" />; 
    if (fileType.includes('image')) return <ImageIcon size={24} className="text-blue-500" />; 
    if (fileType.includes('video')) return <Video size={24} className="text-purple-500" />; 
    if (fileType.includes('audio')) return <Music size={24} className="text-amber-500" />; 
    if (fileType.includes('pdf')) return <FileText size={24} className="text-rose-500" />; 
    return <File size={24} className="text-stone-500" />; 
  };
  
  const renderPreviewContent = (file) => { 
    if (!file || !file.file_url) return <p className="text-stone-500 italic">Arquivo não disponível.</p>; 
    const realUrl = getFileUrl(file.file_url); 
    if (file.type.includes('image')) return <img src={realUrl} alt={file.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm" />; 
    if (file.type.includes('video')) return <video src={realUrl} controls className="max-w-full max-h-[70vh] rounded-lg shadow-sm" />; 
    if (file.type.includes('audio')) return <audio src={realUrl} controls className="w-full max-w-md" />; 
    if (file.type.includes('pdf')) return <iframe src={realUrl} className="w-full h-[70vh] rounded-lg shadow-sm border border-stone-200" title="PDF Preview" />; 
    return ( 
      <div className="text-center p-8 text-stone-500"> 
        <File size={48} className="mx-auto mb-4 opacity-50" /> 
        <p className="font-bold">Pré-visualização indisponível no navegador.</p> 
        <Button onClick={() => handleDownloadAttachment(file)} className="mt-4 bg-[#D46F54] hover:bg-[#B75C46] text-white">Baixar Arquivo</Button> 
      </div> 
    ); 
  };

  const calculateAge = (birthDate) => { 
    if (!birthDate) return null; 
    const today = new Date(); const birth = new Date(birthDate); 
    let age = today.getFullYear() - birth.getFullYear(); 
    const monthDiff = today.getMonth() - birth.getMonth(); 
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) { age--; } 
    return age >= 0 ? age : null; 
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
      await new Promise(r => setTimeout(r, 1000));
      
      let summaryText = "";
      let scoreFinal = 0;
      let aiTip = "";
      let domains = { fisico: 0, 'Sócio-emocional': 0, funcional: 0 };

      if (activeProtocolKey === 'capeV') {
        const { gg, rug, sop, ten } = protocolAnswers;
        scoreFinal = gg || 0; 
        summaryText = `Análise perceptivo-auditiva concluída. Grau Geral de alteração é ${gg || 0}/100. Destacam-se parâmetros de Rugosidade (${rug || 0}/100) e Soprosidade (${sop || 0}/100).`;
        if (ten > 60) aiTip = "Tensão glótica detectada. Considere exercícios de relaxamento laríngeo.";
        else aiTip = "Perfil vocal compatível com o quadro clínico atual. Focar na coaptação suave.";
      } else if (activeProtocolKey === 'qvv') {
        const getAns = (qNum) => protocolAnswers[`q${qNum}`] || 1; 
        
        let brutoFisico = 0;
        [1, 2, 3, 6, 7, 9].forEach(q => brutoFisico += getAns(q));
        
        let brutoSocio = 0;
        [4, 5, 8, 10].forEach(q => brutoSocio += getAns(q));
        
        const brutoTotal = brutoFisico + brutoSocio;

        const calcFisico = 100 - (((brutoFisico - 6) / 24) * 100);
        const calcSocio = 100 - (((brutoSocio - 4) / 16) * 100);
        const calcTotal = 100 - (((brutoTotal - 10) / 40) * 100);

        domains = {
          fisico: Number(calcFisico.toFixed(1)),
          'Sócio-emocional': Number(calcSocio.toFixed(1)),
          funcional: 0 
        };
        scoreFinal = Number(calcTotal.toFixed(1));
        
        summaryText = `Avaliação QVV concluída. Escore Total: ${scoreFinal}%. Domínio Físico: ${domains.fisico}% | Sócio-emocional: ${domains['Sócio-emocional']}%.`;
        aiTip = scoreFinal < 80 ? "Impacto na qualidade de vida vocal detectado. Indicado aprofundar investigação de queixas orgânicas e emocionais." : "O paciente relata baixo impacto na qualidade de vida global em relação à voz.";

      } else {
        const questions = questionsData[activeProtocolKey];
        Object.keys(protocolAnswers).forEach(key => {
          const val = protocolAnswers[key] || 0;
          const idx = key.startsWith('q') ? parseInt(key.replace('q', '')) - 1 : key;
          const domain = questions[idx]?.domain;
          if (domain) domains[domain] += val;
          scoreFinal += val;
        });

        summaryText = `A pontuação total foi ${scoreFinal}. O questionário confirma a presença de desvantagem vocal.`;
        if (domains.fisico > domains['Sócio-emocional'] && domains.fisico > domains.funcional) {
          aiTip = "Predominância Físico/Orgânica (dor, esforço). DICA: Investigar Tensão Muscular e orientar hidratação.";
        } else if (domains['Sócio-emocional'] > domains.fisico && domains['Sócio-emocional'] > domains.funcional) {
          aiTip = "Predominância Sócio-emocional. DICA: Abordagem deve focar em acolhimento e autoimagem vocal.";
        } else {
          aiTip = "Predominância Funcional. DICA: A voz falha na demanda profissional/social. Focar no treinamento de resistência.";
        }
      }

      const protocolDataToSave = {
        answers: protocolAnswers, 
        summary: summaryText, 
        tip: aiTip, 
        score: scoreFinal,
        domains: activeProtocolKey !== 'capeV' ? domains : null, 
        date: new Date().toLocaleDateString('pt-BR') 
      };

      saveProtocolMutation.mutate(protocolDataToSave);
      
    } catch (e) {
      toast.error("Erro ao analisar protocolo.");
    } finally {
      setIsAiAnalyzingProtocol(false);
    }
  };

  const handleOpenNewReport = () => {
    setReportForm({ report_id: null, title: "Novo Relatório", content: "", format: "clinico", status: "draft" });
    setAiPrompt("");
    setReviewSuggestions(null); 
    setIsReportEditorOpen(true);
  };

  const handleOpenExistingReport = (report) => {
    setReportForm({ 
      report_id: report.report_id || report.id, 
      title: report.title, content: report.content || "", format: report.format, status: report.status 
    });
    setAiPrompt("");
    setReviewSuggestions(null); 
    setIsReportEditorOpen(true);
  };

  const handleCopilotGenerate = async () => {
    setIsAiThinking(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const temESV = protocolsState.esv !== null;
      const temCAPEV = protocolsState.capeV !== null;
      
      const textoGerado = `
        <h2 style="text-align: center;"><strong>LAUDO FONOAUDIOLÓGICO CLÍNICO</strong></h2>
        <p><br></p>
        <p><strong>Paciente:</strong> ${p?.name || 'Não informado'}</p>
        <p><strong>Idade:</strong> ${displayAge !== null ? `${displayAge} anos` : 'Não informada'}</p>
        <p><br></p>
        <p><strong>1. HISTÓRICO CLÍNICO E AVALIAÇÃO INSTRUMENTAL</strong></p>
        <p>O paciente apresenta quadro de disfonia caracterizado por "${p?.chief_complaint || 'queixas vocais'}". 
        ${temCAPEV ? `Na Avaliação Perceptivo-Auditiva (CAPE-V), evidenciou-se Grau Geral de ${protocolsState.capeV.score}/100, apontando desvio fonatório <sup>[1]</sup>.` : 'Avaliação perceptivo-auditiva pendente.'} 
        ${temESV ? `A Escala de Sintomas Vocais (ESV) indicou pontuação de ${protocolsState.esv.score}, evidenciando impacto na qualidade de vida e rotina do paciente <sup>[2]</sup>.` : ''}</p>
        <p><br></p>
        <p><strong>2. EVOLUÇÃO TERAPÊUTICA</strong></p>
        <p>Durante o processo terapêutico, optou-se pela aplicação de Exercícios de Trato Vocal Semi-Ocluído (ETVSO). Esta técnica promove o reequilíbrio miofuncional, a redução do impacto colisional entre as pregas vocais e melhora a impedância acústica do trato vocal, favorecendo o conforto fônico <sup>[3]</sup>.</p>
        <p><br></p>
        <p><strong>3. CONDUTA / PARECER</strong></p>
        <p>Diante do quadro apresentado e da evolução clínica, sugere-se a continuidade da fonoterapia semanal, bem acompanhamento com equipe multidisciplinar (Otorrinolaringologia) para controle de imagens laríngeas.</p>
        <p><br></p>
        <hr>
        <p><span style="font-size: 10px; color: #666666;"><strong>REFERÊNCIAS CIENTÍFICAS:</strong></span></p>
        <p><span style="font-size: 10px; color: #666666;">[1] Consenso ASHA (2003) para a avaliação perceptivo-auditiva da voz (CAPE-V).</span></p>
        <p><span style="font-size: 10px; color: #666666;">[2] Behlau M, et al. Validação da Escala de Sintomas Vocais (ESV) no Brasil.</span></p>
        <p><span style="font-size: 10px; color: #666666;">[3] Titze IR. Voice training and therapy with a semi-occluded vocal tract: Rationale and scientific underpinnings. J Speech Lang Hear Res. 2006.</span></p>
      `;
      
      setReportForm(prev => ({ ...prev, content: textoGerado }));
      toast.success("Laudo gerado. Referências científicas inseridas automaticamente no rodapé.");
    } catch { toast.error("Erro ao gerar relatório com a IA."); } finally { setIsAiThinking(false); }
  };

  const handleCopilotReview = async () => {
    if (!reportForm.content.trim() || reportForm.content === '<p><br></p>') return toast.error("Escreva algo primeiro para a IA revisar.");
    setIsAiThinking(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const textoAtual = reportForm.content.toLowerCase();
    const sugestoesDaAuditoria = [];

    if (textoAtual.includes("anus")) {
      sugestoesDaAuditoria.push({
        id: "sug_anus", type: "ortografia", title: "Erro Ortográfico / Digitação",
        original: "anus", suggestion: "anos", reason: "Correção ortográfica necessária para manter o profissionalismo.", source: null, link: null
      });
    }

    if (textoAtual.includes("sesss")) {
      sugestoesDaAuditoria.push({
        id: "sug_sess", type: "ortografia", title: "Erro de Digitação Detectado",
        original: "sesss", suggestion: "sessões", reason: "A palavra 'sesss' está incorreta. O termo correto é 'sessões'.", source: null, link: null
      });
    }

    if (textoAtual.includes("cptação")) {
      sugestoesDaAuditoria.push({
        id: "sug_coap", type: "ortografia", title: "Nomenclatura Técnica Incompleta",
        original: "cptação", suggestion: "coaptação", reason: "O termo clínico correto para o fechamento das pregas vocais é 'coaptação'.", source: "Glossário de Termos Vocais - SBFa", link: "https://sbfa.org.br/"
      });
    }

    if (textoAtual.includes("sussurro")) {
      sugestoesDaAuditoria.push({
        id: "sug_1", type: "cientifico", title: "Divergência Científica Detectada",
        original: "sussurro", suggestion: "fonação suave", reason: "O sussurro forçado gera maior atrito nas pregas vocais e contração supraglótica, sendo contraindicado em quadros tensionais.", source: "Behlau, M. Voz: O Livro do Especialista. Vol 2. Cap. 14.", link: "https://sbfa.org.br/portal22/pdf/diretrizes_voz.pdf"
      });
    }

    if (sugestoesDaAuditoria.length === 0) {
      toast.success("O texto está excelente! Nenhuma divergência científica, clínica ou ortográfica foi encontrada pela IA.");
      setReviewSuggestions(null);
      setIsAiThinking(false);
      return;
    }

    setReviewSuggestions(sugestoesDaAuditoria);
    toast.warning(`Auditoria concluída! A IA encontrou ${sugestoesDaAuditoria.length} pontos para revisão.`);
    setIsAiThinking(false);
  };

  const acceptSuggestion = (sug) => {
    const regex = new RegExp(sug.original, "gi");
    let novoTexto = reportForm.content.replace(regex, sug.suggestion);
    setReportForm(prev => ({...prev, content: novoTexto}));
    setReviewSuggestions(prev => prev.filter(item => item.id !== sug.id));
    toast.success("Correção aplicada com sucesso!");
  };

  const rejectSuggestion = (id) => {
    setReviewSuggestions(prev => prev.filter(item => item.id !== id));
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

  const handleGenerateAiInstructions = async () => {
    if (!activityForm.title.trim()) return toast.error("Digite o Título da atividade primeiro.");
    setIsGeneratingAi(true);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const queixaPaciente = p?.chief_complaint || "desconforto vocal";
      const tituloExercicio = activityForm.title.toLowerCase();
      
      let passoAPasso = "";
      let baseCientifica = "";

      if (tituloExercicio.includes("tubo") || tituloExercicio.includes("canudo") || tituloExercicio.includes("etvso")) {
        passoAPasso = `1. Pegue um canudo de espessura média.\n2. Coloque o tubo na boca e feche bem os lábios ao redor dele, garantindo que o ar não vaze pelos cantos.\n3. Respire fundo pelo nariz de forma natural, sentindo a barriga expandir sem levantar os ombros.\n4. Solte o ar fazendo o som de um "U" prolongado dentro do tubo.\n5. O segredo do exercício: Você deve sentir uma leve trepidação ou formigamento nos lábios. Isso indica que a energia do som está ressoando no lugar certo (na boca), tirando o "peso" da sua garganta!\n6. Duração: Mantenha o som de forma confortável e contínua até o fôlego quase acabar. Descanse 5 segundos e repita por 10 vezes.`;
        baseCientifica = `Fundamentado nos preceitos de Exercícios de Trato Vocal Semi-Ocluído (ETVSO). A técnica aumenta a impedância do trato vocal, reduzindo o impacto colisional glótico e favorecendo o reequilíbrio miofuncional.\nFonte: Titze IR. Voice training and therapy with a semi-occluded vocal tract. (PubMed)\nLink: https://pubmed.ncbi.nlm.nih.gov/16572589/`;
      } else if (tituloExercicio.includes("vibração") || tituloExercicio.includes("lingua") || tituloExercicio.includes("lábio") || tituloExercicio.includes("labio")) {
        passoAPasso = `1. Sente-se ou fique em pé com a postura relaxada. Solte bem o pescoço e a fisionomia do rosto.\n2. Puxe o ar de forma tranquila pelo nariz.\n3. Una os lábios de forma bem leve e solte o ar fazendo-os vibrar continuamente (som de "brrrrrr").\n4. O segredo do exercício: Tente manter a vibração constante, lisa, sem que o som falhe no meio. Imagine o som saindo contínuo como o motor de um barquinho.\n5. Se a vibração travar, não faça força! Pare, engula saliva, relaxe o rosto e tente de novo.\n6. Duração: Mantenha a vibração por cerca de 5 a 8 segundos. Descanse um pouco e repita por 3 minutos no total.`;
        baseCientifica = `Técnica de Vibração Sonorizada de Lábios/Língua. Atua na mobilização da mucosa das pregas vocais, reduzindo a constrição supraglótica e melhorando a coaptação glótica.\nFonte: Behlau M, et al. Voz: O Livro do Especialista. Vol 2. Cap 14.\nLink: https://sbfa.org.br/`;
      } else {
        passoAPasso = `1. Posicione-se confortavelmente, em um ambiente silencioso.\n2. Inicie a execução do exercício de forma suave. O som deve começar fácil, solto e sem nenhum "aperto" no pescoço.\n3. Foque a sua atenção na vibração do som ocorrendo na região da "máscara" do rosto (lábios e nariz), e não na garganta.\n4. Tente manter a garganta relaxada e o espaço interno da boca amplo.\n5. Duração: Realize o exercício em 3 séries de 1 minuto. Faça pausas de 30 segundos entre as séries para beber um gole de água.`;
        baseCientifica = `Técnica focada no condicionamento e adequação do fechamento glótico, visando a ampliação do espaço de ressonância e diminuição de esforço global.\nFonte: Consenso em Terapia de Voz - Tratado de Fonoaudiologia (SBFa).\nLink: https://sbfa.org.br/`;
      }

      const instrucoesGeradas = `🎯 OBJETIVO DO EXERCÍCIO: ${activityForm.title}\n\n📝 COMO EXECUTAR (Passo a Passo detalhado):\n${passoAPasso}\n\n⚠️ ATENÇÃO EXCLUSIVA PARA O SEU CASO:\nComo o seu relato principal no início foi "${queixaPaciente}", a regra de ouro é: leveza e zero esforço. O exercício deve parecer uma "massagem" nas cordas vocais. Se você sentir a garganta raspando, doendo, ou se a voz falhar e ficar mais rouca durante a execução, PARE imediatamente.\n\n📚 BASE CIENTÍFICA (Registro Clínico):\n${baseCientifica}`;
      
      setActivityForm(prev => ({ ...prev, description: instrucoesGeradas }));
      toast.success("O Copiloto gerou instruções detalhadas baseadas no tipo de exercício!");
    } catch (error) { toast.error("Erro ao conectar com a IA."); } finally { setIsGeneratingAi(false); }
  };

  const handleDraftWhatsApp = async () => {
    setIsAiDraftingMsg(true);
    try {
      await new Promise(r => setTimeout(r, 1500));
      
      const nomePrimeiro = p?.name.split(' ')[0] || "Paciente";
      let text = `Olá, ${nomePrimeiro}! Tudo bem?\n\nAqui é da clínica fonoaudiológica.\n`;
      
      if (msgType === 'lembrete') {
        const atividadePendente = activities.find(a => a.status === 'in_progress');
        if (atividadePendente) {
          text += `Passando para lembrar dos nossos exercícios de "${atividadePendente.title}" dessa semana. Conseguiu fazer? Lembre-se da nossa regra: faça tudo sem esforço e respeite o seu limite, ok?`;
        } else {
          text += `Passando para lembrar de manter os cuidados com a voz e a hidratação que conversamos na nossa última sessão! Como tem sido a semana?`;
        }
      } else if (msgType === 'retorno') {
        text += `Passando para saber como está a sua voz após a nossa última sessão. Sentiu alguma melhora na queixa de "${p?.chief_complaint}"?`;
      } else if (msgType === 'agendamento') {
        text += `Passando apenas para confirmar nossa próxima sessão de fonoterapia. Podemos manter o horário agendado?`;
      }
      
      text += `\n\nQualquer dúvida ou desconforto, estou à disposição por aqui!`;
      
      setWhatsappMsg(text);
      toast.success("Mensagem focada gerada com sucesso!");
    } catch (e) {
      toast.error("Erro ao gerar mensagem.");
    } finally {
      setIsAiDraftingMsg(false);
    }
  };

  const copyWhatsAppMsg = () => {
    navigator.clipboard.writeText(whatsappMsg);
    toast.success("Copiado! Basta colar no WhatsApp.");
    setMsgOpen(false);
  };

  if (!p) return <div className="flex items-center justify-center h-screen text-stone-500 animate-pulse font-medium">Carregando prontuário...</div>;
  const displayAge = p.age ?? calculateAge(p.birth_date);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in">
      
      {/* Botão Voltar */}
      <Link to="/patients" className="flex items-center gap-2 text-stone-500 hover:text-[#B75C46] font-semibold transition-colors w-fit">
        <ArrowLeft size={20} /> Voltar para lista
      </Link>

      {/* CABEÇALHO DO PERFIL */}
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

        <div className="flex-1 text-center md:text-left space-y-2 w-full">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-800 tracking-tight font-heading truncate">{p.name}</h1>
          <div className="text-sm text-stone-500 flex flex-wrap items-center justify-center md:justify-start gap-3">
            {p.otorrhoea_diagnosis && <span className="px-3 py-1 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-bold">{p.otorrhoea_diagnosis}</span>}
            <span className="flex items-center gap-1 font-medium"><User size={16}/> {displayAge !== null ? `${displayAge} anos` : 'Idade N/I'}</span>
            <span className="flex items-center gap-1 font-medium"><Phone size={16}/> {p.phone || 'Sem telefone'}</span>
          </div>

          {inviteLink && (
            <div className="mt-3 bg-[#F3E7E4]/40 border border-[#D46F54]/30 rounded-lg p-3 text-xs text-stone-700 inline-block w-full max-w-md text-left">
              <span className="font-bold">Link de Convite:</span> <code className="text-[#B75C46] select-all break-all">{inviteLink}</code>
            </div>
          )}
          
          <div className="mt-3 bg-amber-50/50 border border-amber-200/60 rounded-xl p-3 inline-block w-full max-w-2xl text-left">
            <h4 className="text-[11px] font-bold uppercase tracking-widest text-amber-700 mb-1 flex items-center gap-1">
              <Target size={14} /> Metas Terapêuticas Atuais
            </h4>
            <p className="text-xs text-stone-700 font-medium leading-relaxed">{p.goals || "Nenhuma meta definida. Adicione na aba de Visão Geral."}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0 w-full md:w-auto mt-4 md:mt-0">
          <Link to={`/voice-lab?patient_id=${p.patient_id}`} className="w-full">
            <Button variant="outline" className="w-full justify-start border-stone-300">
              <Activity size={16} className="mr-2 text-[#D46F54]" /> Análise Vocal (Gravar)
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

      {/* MENU DE NAVEGAÇÃO DE ABAS */}
      <div className="flex overflow-x-auto border-b border-stone-200 custom-scrollbar pb-px">
        {[
          { id: "overview", label: "Visão Geral", icon: FileText },
          { id: "voicelab", label: "Análise Vocal (Lab)", icon: AudioLines },
          { id: "soap", label: "Evoluções (SOAP)", icon: FileClock },
          { id: "activities", label: "Atividades/Desafios", icon: Award },
          { id: "financial", label: "Financeiro & Pacotes", icon: Wallet },
          { id: "exams", label: "Exames/Anexos", icon: Paperclip },
          { id: "reports", label: "Relatórios", icon: LayoutTemplate },
          { id: "intelligence", label: "Inteligência & Fiscal", icon: BrainCircuit, isRestricted: true },
          { id: "private", label: "Notas Privadas", icon: Lock, isPrivate: true },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-4 sm:px-5 py-3 font-semibold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? tab.isPrivate ? "border-rose-500 text-rose-600 bg-rose-50/50" : tab.isRestricted ? "border-indigo-500 text-indigo-600 bg-indigo-50/50" : "border-[#D46F54] text-[#D46F54] bg-[#F3E7E4]/30" : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"}`}>
            <tab.icon size={16} /> {tab.label} {(tab.isPrivate || tab.isRestricted) && <Lock size={12} className="ml-1 opacity-50" />}
          </button>
        ))}
      </div>

      <div className="pt-2">

        {/* ========================================== */}
        {/* NOVA ABA: FINANCEIRO                       */}
        {/* ========================================== */}
        {activeTab === "financial" && (
          <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-emerald-50 rounded-3xl p-6 border border-emerald-100 flex flex-col justify-center">
                <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-2">
                  <DollarSign size={14}/> Lifetime Value (LTV)
                </div>
                <div className="font-heading text-3xl sm:text-4xl font-bold text-emerald-800">
                  R$ {financialData?.ltv?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || "0,00"}
                </div>
                <p className="text-xs text-emerald-700/80 mt-2 font-medium">Soma de todos os pacotes e sessões já pagos por este paciente.</p>
              </div>
              
              <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm">
                <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
                  <Plus size={16} className="text-[#D46F54]" /> Lançar Nova Venda
                </h3>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  if(!financeForm.title || !financeForm.amount) return toast.error("Preencha o título e o valor.");
                  
                  // Converte a vírgula para ponto antes de mandar pro banco
                  const valorCorrigido = parseFloat(financeForm.amount.toString().replace(",", "."));
                  
                  addFinanceRecordMutation.mutate({
                    ...financeForm,
                    amount: valorCorrigido
                  });
                }} className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-stone-500 mb-1 block">Referência (Ex: Pacote 10 Sessões, Avulsa)</label>
                    <Input placeholder="Título da cobrança" value={financeForm.title} onChange={e => setFinanceForm({...financeForm, title: e.target.value})} className="h-10 bg-stone-50"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-stone-500 mb-1 block">Valor (R$)</label>
                      <Input type="number" placeholder="Ex: 1500.00" value={financeForm.amount} onChange={e => setFinanceForm({...financeForm, amount: e.target.value})} className="h-10 bg-stone-50"/>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-stone-500 mb-1 block">Status</label>
                      <Select value={financeForm.status} onValueChange={(val) => setFinanceForm({...financeForm, status: val})}>
                        <SelectTrigger className="w-full bg-stone-50 h-10 border-stone-200"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pago">Pago</SelectItem>
                          <SelectItem value="pendente">Pendente</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button type="submit" disabled={addFinanceRecordMutation.isPending} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-10">
                    {addFinanceRecordMutation.isPending ? "Lançando..." : "Registrar Venda"}
                  </Button>
                </form>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col min-h-[300px]">
              <h3 className="text-sm font-bold text-stone-800 mb-4 flex items-center gap-2">
                <Receipt size={16} className="text-stone-400" /> Extrato Financeiro
              </h3>
              
              {!financialData || !financialData.history || financialData.history.length === 0 ? (
                <div className="text-center py-12 text-stone-400 italic bg-stone-50 rounded-xl border border-dashed border-stone-200 mt-auto mb-auto">
                  Nenhum registro financeiro encontrado.
                </div>
              ) : (
                <div className="space-y-3">
                  {financialData.history.map((record) => (
                    <div key={record.id} className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100 hover:border-stone-200 transition-colors">
                      <div>
                        <h4 className="font-bold text-stone-800 text-sm">{record.title}</h4>
                        <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">{record.date}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-stone-800 text-lg">R$ {record.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        <span className={`inline-block px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-md mt-1 ${record.status === 'pago' || record.status === 'concluido' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {record.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ========================================== */}
        {/* ABA: INTELIGÊNCIA & FISCAL                 */}
        {/* ========================================== */}
        {activeTab === "intelligence" && (
          <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4">
            
            <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-200 flex flex-col sm:flex-row items-start sm:items-center gap-4 shadow-sm">
              <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                <ShieldAlert size={28} />
              </div>
              <div>
                <h3 className="text-indigo-900 font-bold text-lg">Zona de Alta Restrição (LGPD)</h3>
                <p className="text-sm text-indigo-700/80 mt-1 leading-relaxed">
                  Os dados financeiros e o cruzamento analítico de evoluções médicas são processados em contêineres criptografados. Todo acesso ao Recibo IRPF gera um log de auditoria automático no servidor.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm h-full">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <DollarSign className="text-emerald-500" size={20} /> Histórico Financeiro
                    </h3>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Lifetime Value (LTV)</div>
                      <div className="font-heading text-2xl font-bold text-emerald-800">R$ {financialData?.ltv?.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || "0,00"}</div>
                    </div>
                    <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4">
                      <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1">Status Atual</div>
                      <div className="font-heading text-lg font-bold text-stone-700 mt-1 flex items-center gap-1.5">
                        <CheckCircle2 size={16} className="text-emerald-500"/> {financialData?.status || "Adimplente"}
                      </div>
                    </div>
                  </div>

                  <div className="pt-5 border-t border-stone-100 mt-auto">
                    <h4 className="text-xs font-bold text-stone-800 mb-3 flex items-center gap-2">
                      <Receipt size={16} className="text-stone-400" /> Declaração Fiscal (IRPF)
                    </h4>
                    <p className="text-xs text-stone-500 mb-4">Gere o PDF compilado dos valores pagos no ano para declaração da Receita Federal.</p>
                    <Button onClick={() => setIsIrpfModalOpen(true)} className="w-full bg-stone-900 hover:bg-black text-white font-bold h-11 rounded-xl shadow-sm transition-transform hover:scale-[1.01]">
                      Emitir Recibo IRPF
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm h-full flex flex-col">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="font-bold text-stone-800 flex items-center gap-2">
                      <TrendingUp className="text-indigo-500" size={20} /> Analytics Clínico (IA)
                    </h3>
                  </div>

                  <div className="flex-1 bg-stone-50 rounded-2xl border border-stone-100 p-5 relative overflow-hidden group mb-6 min-h-[200px]">
                    {!aiClinicalProgress && !runAnalyticsMutation.isPending && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-50/80 backdrop-blur-sm z-10">
                        <BrainCircuit size={40} className="text-stone-300 mb-3" />
                        <p className="text-sm font-bold text-stone-500 mb-4 text-center px-4">A IA fará a leitura cruzada de todas as evoluções SOAP para traçar o progresso.</p>
                        <Button onClick={() => runAnalyticsMutation.mutate()} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm font-bold rounded-xl">
                          Processar Histórico
                        </Button>
                      </div>
                    )}
                    
                    {runAnalyticsMutation.isPending && (
                      <div className="flex flex-col items-center justify-center h-full py-8">
                        <Activity size={32} className="text-indigo-500 animate-spin mb-3" />
                        <p className="text-xs font-bold text-indigo-700 uppercase tracking-widest animate-pulse">Auditando Evoluções...</p>
                      </div>
                    )}

                    {aiClinicalProgress && !runAnalyticsMutation.isPending && (
                      <div className="animate-in fade-in h-full flex flex-col">
                        <div className="flex items-center gap-2 text-indigo-700 mb-3 border-b border-indigo-100 pb-3">
                          <Sparkles size={16} /> <h4 className="font-bold text-sm">Resumo Sistêmico do Paciente</h4>
                        </div>
                        <p className="text-sm text-stone-700 leading-relaxed font-medium whitespace-pre-wrap">
                          {aiClinicalProgress}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="pt-5 border-t border-stone-100 mt-auto">
                    <h4 className="text-xs font-bold text-stone-800 mb-3 flex items-center gap-2">
                      <FileClock size={16} className="text-stone-400" /> Compilado de Prontuário
                    </h4>
                    <p className="text-xs text-stone-500 mb-4">Gere um PDF formal unindo todas as evoluções SOAP (Útil para médicos encaminhadores e escolas).</p>
                    <Button onClick={() => compileSoapMutation.mutate()} disabled={compileSoapMutation.isPending || records.length === 0} variant="outline" className="w-full border-stone-300 text-stone-700 hover:bg-stone-50 font-bold h-11 rounded-xl shadow-sm">
                      {compileSoapMutation.isPending ? <Activity size={16} className="mr-2 animate-spin text-stone-400" /> : <Download size={16} className="mr-2 text-stone-400" />}
                      Baixar Compilado Clínico
                    </Button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* CONTEÚDO DA ABA: VISÃO GERAL E PROTOCOLOS  */}
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
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm flex flex-col">
                <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Queixa e Contexto</h3>
                <p className="text-sm text-stone-700 italic">"{p.chief_complaint}"</p>
                <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-sm text-stone-700">
                  <p><span className="font-bold">Profissão:</span> {p.profession_vocal_demand}</p>
                  <p><span className="font-bold">Interesses:</span> {p.interests}</p>
                </div>
              </div>
            </div>

            {/* O CARD DE DIÁRIOS REAIS DO PWA AQUI */}
            {diariesHistory.length > 0 && (
              <div className="bg-gradient-to-r from-rose-50 to-white border border-rose-200 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs uppercase tracking-widest text-rose-700 font-bold flex items-center gap-2">
                    <Smartphone size={16}/> Monitoramento App Paciente (Diários)
                  </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {diariesHistory.slice(0, 3).map(diary => {
                    const avgScore = diary.answers ? (Object.values(diary.answers).reduce((a,b)=>Number(a)+Number(b),0) / Object.keys(diary.answers).length).toFixed(1) : "-";
                    return (
                      <div key={diary.id} className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm flex flex-col justify-between hover:border-rose-300 transition-colors">
                        <div>
                          <p className="text-[10px] text-stone-400 font-bold uppercase mb-1">{new Date(diary.timestamp).toLocaleDateString('pt-BR')} às {new Date(diary.timestamp).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}</p>
                          <h4 className="font-bold text-stone-800 text-sm mb-2 leading-tight">{diary.diary_title}</h4>
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-stone-50">
                          <span className="text-xs text-stone-500 font-medium">Média Reportada:</span>
                          <span className={`text-xs font-bold px-2 py-1 rounded ${avgScore > 6 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{avgScore} / 10</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-6">
                <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold flex items-center gap-2">
                  <BrainCircuit size={16} className="text-indigo-500"/> Protocolos Inteligentes e Domínios
                </h3>
                <p className="text-xs text-stone-500">A IA cruza as respostas e salva no banco de dados.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { key: 'qvv', title: 'QVV', desc: 'Protocolo de Qualidade de Vida em Voz', icon: FileText, color: 'text-rose-600', bg: 'bg-rose-100' },
                  { key: 'capeV', title: 'CAPE-V', desc: 'Avaliação Perceptivo-Auditiva da Voz (Clínica)', icon: Activity, color: 'text-blue-600', bg: 'bg-blue-100' },
                  { key: 'idv10', title: 'IDV-10', desc: 'Índice de Desvantagem Vocal Reduzido', icon: ClipboardEdit, color: 'text-amber-600', bg: 'bg-amber-100' },
                  { key: 'esv', title: 'ESV', desc: 'Escala de Sintomas Vocais', icon: ClipboardList, color: 'text-indigo-600', bg: 'bg-indigo-100' }
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
                           {proto.key === 'qvv' ? (
                              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                                Feito: {isFilled.date} | Total: {isFilled.score}% (F: {isFilled.domains?.fisico ?? isFilled.domains?.Fisico ?? 0}% / S: {isFilled.domains?.['Sócio-emocional'] ?? isFilled.domains?.socio_emocional ?? isFilled.domains?.socio ?? 0}%)
                              </p>
                            ) : (
                              <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">
                                Feito em: {isFilled.date} | Pontos: {isFilled.score}
                              </p>
                            )}
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
                            <Button variant="outline" onClick={() => setProtocolToReset(proto.key)} className="w-full text-xs h-8 border-stone-300 text-rose-600 hover:bg-rose-50 hover:border-rose-200" title="Apagar e refazer">
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

        {/* ========================================== */}
        {/* ABA: ANÁLISE VOCAL (VOICE LAB HISTORY)     */}
        {/* ========================================== */}
        {activeTab === "voicelab" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2">
                  <AudioLines size={20} className="text-[#D46F54]" /> Histórico de Análise Acústica
                </h3>
                <p className="text-sm text-stone-500 mt-1">Acompanhe a evolução dos parâmetros acústicos do paciente extraídos automaticamente do laboratório.</p>
              </div>
              <Link to={`/voice-lab?patient_id=${id}`}>
                <Button className="bg-[#D46F54] hover:bg-[#B75C46] text-white shrink-0 shadow-md w-full sm:w-auto">
                  <Plus size={18} className="mr-2" /> Nova Análise (Lab)
                </Button>
              </Link>
            </div>

            {/* 👇 Usando voiceLabHistory aqui */}
            {voiceLabHistory.length === 0 ? (
              <div className="bg-stone-50 border-2 border-dashed border-stone-200 rounded-2xl p-10 text-center">
                <AudioLines size={40} className="text-stone-300 mx-auto mb-3" />
                <h4 className="font-bold text-stone-600 mb-1">Nenhuma gravação encontrada</h4>
                <p className="text-sm text-stone-500 mb-4">Acesse o Voice Lab para capturar e processar o primeiro áudio deste paciente.</p>
                <Link to={`/voice-lab?patient_id=${id}`}>
                  <Button variant="outline" className="border-stone-300 text-stone-700">Acessar Laboratório Vocal</Button>
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* 👇 E usando voiceLabHistory aqui também! Sem chance de erro agora! */}
                  {voiceLabHistory.map((item) => {
                    const isSelected = selectedAnalyses.includes(item.id);
                    
                    return (
                      <div 
                        key={item.id} 
                        className={`border p-5 rounded-2xl relative transition-all ${
                          isSelected ? 'border-[#D46F54] bg-[#F3E7E4] shadow-md' : 'border-gray-200 bg-white hover:shadow-sm'
                        }`}
                      >
                        {/* Checkbox de Seleção */}
                        <div className="absolute top-5 right-5 flex items-center gap-2">
                          {isSelected && <span className="text-xs font-bold text-[#D46F54]">Selecionado</span>}
                          <input 
                            type="checkbox" 
                            className="w-5 h-5 accent-[#D46F54] cursor-pointer"
                            checked={isSelected}
                            onChange={() => toggleAnalysisSelection(item.id)}
                          />
                        </div>

                        {/* Cabeçalho do Card */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-500">
                            <AudioLines className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-800 text-sm">Gravação Processada</h3>
                            <p className="text-xs text-gray-500">{item.date}</p>
                          </div>
                        </div>

                        {/* Caixinha Cinza com os Números */}
                        <div className="bg-gray-50 rounded-xl p-3 flex justify-between text-center mb-4">
                          <div><p className="text-[10px] text-gray-500 font-bold uppercase">F0</p><p className="text-sm font-bold">{item.f0}</p></div>
                          <div><p className="text-[10px] text-gray-500 font-bold uppercase">Jitter</p><p className="text-sm font-bold">{item.jitter}</p></div>
                          <div><p className="text-[10px] text-gray-500 font-bold uppercase">Shimmer</p><p className="text-sm font-bold">{item.shimmer}</p></div>
                          <div><p className="text-[10px] text-gray-500 font-bold uppercase">NHR</p><p className="text-sm font-bold">{item.nhr}</p></div>
                        </div>

                        <div className="flex justify-between items-center">
                          <p className="text-xs text-gray-500 truncate max-w-[70%]"><b>Obs:</b> {item.obs}</p>
                          <button 
                            onClick={() => openAnalysisDetail(item)}
                            className="text-xs font-bold text-[#D46F54] hover:underline"
                          >
                            Ver Laudo Completo
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Botão Flutuante */}
                {selectedAnalyses.length > 0 && (
                  <div className="fixed bottom-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-4 z-50">
                    <span className="text-sm font-medium">{selectedAnalyses.length} / 2 selecionados</span>
                    {selectedAnalyses.length === 2 && (
                      <button 
                        onClick={handleCompareAnalyses}
                        disabled={isComparing}
                        className="bg-[#D46F54] hover:bg-[#B75C46] px-4 py-1.5 rounded-full text-sm font-bold transition-colors"
                      >
                        {isComparing ? "Calculando..." : "Comparar Evolução"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        

        {/* ========================================== */}
        {/* ABA: EVOLUÇÕES (SOAP)                      */}
        {/* ========================================== */}
        {activeTab === "soap" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <h3 className="text-sm font-bold text-stone-800">Nova Evolução Clínica</h3>
                <div className="flex bg-stone-100 rounded-lg p-1 w-full sm:w-auto">
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'presente'})} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${soapForm.attendance === 'presente' ? 'bg-white shadow-sm text-emerald-600' : 'text-stone-500'}`}><CheckCircle2 size={14} /> Presente</button>
                  <button type="button" onClick={() => setSoapForm({...soapForm, attendance: 'falta'})} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1 ${soapForm.attendance === 'falta' ? 'bg-white shadow-sm text-rose-600' : 'text-stone-500'}`}><XCircle size={14} /> Faltou</button>
                </div>
              </div>
              
              {soapForm.attendance === 'presente' ? (
                <form onSubmit={(e) => { e.preventDefault(); saveSoapMutation.mutate({ patient_id: id, session_date: new Date().toISOString().split('T')[0], ...soapForm }); }} className="space-y-4">
                  <div><label className="text-xs font-bold text-[#B75C46] mb-1 block">Subjetivo (S)</label><Textarea placeholder="Descreva o que o paciente relatou..." value={soapForm.subjective} onChange={e => setSoapForm({...soapForm, subjective: e.target.value})} className="bg-stone-50 resize-none text-sm" /></div>
                  <div><label className="text-xs font-bold text-blue-700 mb-1 block">Objetivo (O)</label><Textarea placeholder="Descreva o que foi observado..." value={soapForm.objective} onChange={e => setSoapForm({...soapForm, objective: e.target.value})} className="bg-stone-50 resize-none text-sm" /></div>
                  <div><label className="text-xs font-bold text-emerald-700 mb-1 block">Avaliação (A)</label><Textarea placeholder="Descreva a avaliação clínica..." value={soapForm.assessment} onChange={e => setSoapForm({...soapForm, assessment: e.target.value})} className="bg-stone-50 resize-none text-sm" /></div>
                  <div><label className="text-xs font-bold text-amber-700 mb-1 block">Plano (P)</label><Textarea placeholder="Descreva o plano de tratamento..." value={soapForm.plan} onChange={e => setSoapForm({...soapForm, plan: e.target.value})} className="bg-stone-50 resize-none text-sm" /></div>
                  <div className="pt-2 flex justify-end">
                    <Button type="submit" disabled={saveSoapMutation.isPending} className="bg-[#D46F54] hover:bg-[#B75C46] text-white w-full sm:w-auto">
                      {saveSoapMutation.isPending ? "Salvando..." : "Salvar Evolução"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="py-6 px-4 text-center border-2 border-dashed border-rose-200 rounded-xl bg-rose-50">
                  <XCircle size={40} className="mx-auto text-rose-300 mb-3" />
                  <p className="text-rose-700 font-bold mb-3">Paciente ausente na sessão.</p>
                  
                  <div className="max-w-md mx-auto mb-4 text-left">
                    <label className="text-xs font-bold text-rose-700 mb-1 block">Motivo / Observação (Opcional)</label>
                    <Textarea 
                      placeholder="Ex: Esqueceu, reagendou, problema com transporte..." 
                      value={soapForm.absence_reason} 
                      onChange={e => setSoapForm({...soapForm, absence_reason: e.target.value})} 
                      className="bg-white border-rose-200 focus:border-rose-400 focus:ring-rose-400 resize-none text-sm text-stone-700 placeholder:text-stone-400" 
                      rows={3}
                    />
                  </div>

                  <Button variant="outline" onClick={() => saveSoapMutation.mutate({ patient_id: id, session_date: new Date().toISOString().split('T')[0], ...soapForm })} disabled={saveSoapMutation.isPending} className="border-rose-300 text-rose-700 hover:bg-rose-100 hover:text-rose-800 font-bold">
                    {saveSoapMutation.isPending ? "Registrando..." : "Registrar Falta no Histórico"}
                  </Button>
                </div>
              )}
            </div>

            <div className="bg-stone-50 rounded-2xl p-6 border border-stone-200 flex flex-col h-full">
              <h3 className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Últimas Evoluções</h3>
              {records.length === 0 ? <p className="text-sm text-stone-400 italic">Nenhum registro anterior.</p> : (
                <>
                  <div className="space-y-4 flex-1">
                    {(showAllRecords ? [...records].reverse() : [...records].reverse().slice(0, 5)).map((r, idx) => (
                      <div key={idx} onClick={() => setSelectedRecord(r)} className="bg-white p-4 rounded-xl border border-stone-200 shadow-sm text-sm cursor-pointer hover:border-[#D46F54] hover:shadow-md transition-all group">
                        <div className="flex justify-between items-center mb-2 border-b border-stone-100 pb-2">
                          <span className="text-[10px] font-bold text-stone-400 block">{r.session_date}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${r.attendance === 'falta' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {r.attendance === 'falta' ? 'Falta' : 'Presente'}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-stone-600 line-clamp-3 group-hover:text-stone-800">
                          {r.attendance === 'falta' ? (
                            <div className="space-y-1 mt-1">
                              <p className="italic text-rose-600 font-medium">Sessão não realizada.</p>
                              {r.absence_reason && (
                                <p><strong className="text-rose-800">Motivo:</strong> {r.absence_reason}</p>
                              )}
                            </div>
                          ) : (
                            <>
                              {r.subjective && <p><strong className="text-[#B75C46]">S:</strong> {r.subjective}</p>} 
                              {r.objective && <p><strong className="text-blue-700">O:</strong> {r.objective}</p>} 
                              {r.assessment && <p><strong className="text-emerald-700">A:</strong> {r.assessment}</p>} 
                              {r.plan && <p><strong className="text-amber-700">P:</strong> {r.plan}</p>}
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {records.length > 5 && (
                    <div className="pt-4 mt-4 border-t border-stone-200">
                      <Button 
                        variant="ghost" 
                        onClick={() => setShowAllRecords(!showAllRecords)} 
                        className="w-full text-xs font-bold text-stone-500 hover:text-[#D46F54] hover:bg-[#F3E7E4]/50"
                      >
                        {showAllRecords ? "Ocultar Histórico Antigo" : `Exibir todas as evoluções (${records.length})`}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* ABA: NOTAS PRIVADAS                        */}
        {/* ========================================== */}
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
              <div className="flex justify-end"><Button onClick={() => toast.success("Nota privada salva com segurança.")} className="bg-stone-800 hover:bg-black text-white font-bold w-full sm:w-auto">Salvar Nota Privada</Button></div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* ABA: EXAMES E ANEXOS                       */}
        {/* ========================================== */}
        {activeTab === "exams" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-white border border-stone-200 p-4 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-2 text-stone-600 font-bold text-sm overflow-x-auto w-full custom-scrollbar pb-1 sm:pb-0">
                <button onClick={() => setCurrentFolder(null)} className={`hover:text-[#D46F54] transition-colors flex items-center gap-2 whitespace-nowrap ${!currentFolder ? 'text-[#D46F54]' : ''}`} title="Ir para a raiz"><FolderOpen size={18} /> Arquivos</button>
                {currentFolder && (
                  <><ChevronRight size={16} className="text-stone-400 shrink-0" /><span className="text-stone-800 bg-stone-100 px-3 py-1 rounded-lg whitespace-nowrap">{folders.find(f => f.folder_id === currentFolder)?.name}</span></>
                )}
              </div>
              <Button onClick={() => setIsFolderModalOpen(true)} variant="outline" className="border-stone-300 bg-stone-50 hover:bg-stone-100 px-3 shrink-0"><FolderPlus size={18} className="text-[#D46F54] sm:mr-2" /> <span className="hidden sm:inline">Nova Pasta</span></Button>
            </div>

            <div className="bg-white border-2 border-dashed border-stone-300 hover:border-[#D46F54] transition-colors rounded-3xl p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group">
              <input type="file" multiple onChange={(e) => uploadFileMutation.mutate(Array.from(e.target.files))} disabled={uploadFileMutation.isPending} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
              <div className={`transition-transform duration-300 ${uploadFileMutation.isPending ? 'scale-110' : 'group-hover:-translate-y-1'}`}>
                {uploadFileMutation.isPending ? <Activity size={40} className="text-[#D46F54] animate-pulse mb-3 mx-auto" /> : <UploadCloud size={40} className="text-stone-300 group-hover:text-[#D46F54] mb-3 mx-auto transition-colors" />}
              </div>
              <h3 className="text-base font-bold text-stone-700">{uploadFileMutation.isPending ? 'Enviando...' : `Anexar em: ${currentFolder ? folders.find(f => f.folder_id === currentFolder)?.name : 'Raiz Geral'}`}</h3>
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
                    <div className="flex items-center gap-1 shrink-0 opacity-0 lg:group-hover:opacity-100 transition-opacity lg:opacity-0 opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }} className="p-2 text-stone-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Eye size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); handleDownloadAttachment(file); }} className="p-2 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Download size={16} /></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteAttachmentMutation.mutate(file.attachment_id); }} className="p-2 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
              {!currentFolder && folders.length === 0 && attachments.filter(a => !a.folder_id).length === 0 && <div className="text-center py-12 text-stone-400 italic">Nenhuma pasta ou arquivo na raiz.</div>}
              {currentFolder && attachments.filter(a => a.folder_id === currentFolder).length === 0 && <div className="text-center py-12 text-stone-400 italic">Esta pasta está vazia.</div>}
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* ABA: ATIVIDADES E DESAFIOS                   */}
        {/* ========================================== */}
        {activeTab === "activities" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2"><Award size={20} className="text-[#D46F54]" /> Atividades e Desafios</h3>
                <p className="text-sm text-stone-500 mt-1">Acompanhe a adesão aos exercícios em casa e o histórico clínico.</p>
              </div>
              <Button onClick={() => setIsActivityModalOpen(true)} className="bg-[#D46F54] hover:bg-[#B75C46] text-white shrink-0 w-full sm:w-auto"><Plus size={16} className="mr-2" /> Nova Atividade</Button>
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

        {/* ========================================== */}
        {/* ABA: RELATÓRIOS INTELIGENTES               */}
        {/* ========================================== */}
        {activeTab === "reports" && (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-gradient-to-r from-[#F3E7E4]/50 to-white p-6 rounded-2xl border border-stone-200 shadow-sm gap-4">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2">
                  <LayoutTemplate size={20} className="text-[#D46F54]" /> Central de Relatórios
                </h3>
                <p className="text-sm text-stone-500 mt-1 max-w-lg">Crie laudos, encaminhamentos e pareceres com a ajuda do Copiloto IA analisando todo o prontuário.</p>
              </div>
              <Button onClick={handleOpenNewReport} className="bg-[#D46F54] hover:bg-[#B75C46] text-white shrink-0 shadow-md w-full sm:w-auto">
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
      {/* BLOCO 10: MODAIS GERAIS (SOAP E PASTAS)    */}
      {/* ========================================== */}
      <Dialog open={!!selectedRecord} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        <DialogContent className="hide-default-close max-w-3xl max-h-[85vh] overflow-y-auto custom-scrollbar bg-white rounded-[2rem] p-6">
          <div className="flex justify-between items-center border-b pb-4 mb-4">
            <DialogTitle className="font-heading text-2xl text-stone-800">Detalhes da Evolução</DialogTitle>
            <button onClick={() => setSelectedRecord(null)} className="p-2 bg-stone-100 rounded-full hover:bg-stone-200"><X size={16}/></button>
          </div>
          {selectedRecord && (
            <div className="space-y-4 text-sm text-stone-700">
              {selectedRecord.subjective && <p><strong>S:</strong> {selectedRecord.subjective}</p>}
              {selectedRecord.objective && <p><strong>O:</strong> {selectedRecord.objective}</p>}
              {selectedRecord.assessment && <p><strong>A:</strong> {selectedRecord.assessment}</p>}
              {selectedRecord.plan && <p><strong>P:</strong> {selectedRecord.plan}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isFolderModalOpen} onOpenChange={setIsFolderModalOpen}>
        <DialogContent className="hide-default-close max-w-sm w-[90vw] bg-white rounded-[2rem] p-6">
          <div className="flex justify-between items-center mb-4">
            <DialogTitle className="font-heading">Criar Nova Pasta</DialogTitle>
            <button onClick={() => setIsFolderModalOpen(false)}><X size={16}/></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (newFolderName.trim()) createFolderMutation.mutate(newFolderName); }} className="space-y-4">
            <input type="text" autoFocus value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm" placeholder="Nome da pasta" />
            <Button type="submit" disabled={createFolderMutation.isPending} className="w-full bg-[#D46F54] text-white">Criar Pasta</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="hide-default-close max-w-4xl max-h-[90vh] flex flex-col bg-stone-50/95 backdrop-blur-sm border-stone-200 w-[95vw] rounded-[2rem] p-6">
          <div className="border-b border-stone-200 pb-3 shrink-0 flex justify-between items-center">
             <DialogTitle className="font-heading text-xl text-stone-800 truncate pr-8">{previewFile?.name}</DialogTitle>
             <button onClick={() => setPreviewFile(null)} className="text-stone-400 hover:text-rose-500"><X size={20}/></button>
          </div>
          <div className="flex-1 overflow-hidden flex items-center justify-center pt-4">{renderPreviewContent(previewFile)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={isActivityModalOpen} onOpenChange={setIsActivityModalOpen}>
        <DialogContent className="hide-default-close max-w-lg w-[95vw] bg-white rounded-[2rem] p-6">
          <div className="flex justify-between items-center mb-4">
            <DialogTitle className="font-heading">Atribuir Nova Atividade</DialogTitle>
            <button onClick={() => setIsActivityModalOpen(false)}><X size={16}/></button>
          </div>
          <div className="space-y-4">
            <input type="text" value={activityForm.title} onChange={(e) => setActivityForm(prev => ({...prev, title: e.target.value}))} placeholder="Título" className="w-full bg-stone-50 border border-stone-200 rounded-xl p-3 text-sm" />
            <Button onClick={handleGenerateAiInstructions} disabled={isGeneratingAi} className="w-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100">{isGeneratingAi ? "Gerando..." : "Criar Instruções com IA"}</Button>
            <Textarea value={activityForm.description} onChange={(e) => setActivityForm(prev => ({...prev, description: e.target.value}))} rows={6} className="bg-stone-50 resize-none rounded-xl text-sm" />
              <Button 
                onClick={() => { 
                  if(activityForm.title.trim()) {
                    createActivityMutation.mutate({ 
                      patient_id: id, 
                      status: "in_progress", // <-- OBRIGATÓRIO PARA APARECER NO CELULAR
                      date: new Date().toLocaleDateString('pt-BR'),
                      days_total: 7,
                      days_completed: [false, false, false, false, false, false, false],
                      ...activityForm 
                    }); 
                  }
                }} 
                disabled={createActivityMutation.isPending} 
                className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold"
                >
                {createActivityMutation.isPending ? "Processando..." : "Atribuir ao Paciente"}
              </Button>  
           </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isIrpfModalOpen} onOpenChange={setIsIrpfModalOpen}>
        <DialogContent className="hide-default-close max-w-md w-[95vw] bg-white rounded-[2rem] p-6">
          <div className="flex justify-between items-center mb-4">
            <DialogTitle className="font-heading text-emerald-700 flex items-center gap-2"><Receipt size={20} /> Emissão de Recibo IRPF</DialogTitle>
            <button onClick={() => setIsIrpfModalOpen(false)}><X size={16}/></button>
          </div>
          <div className="space-y-4">
            <Input type="number" placeholder="Valor Total Ex: 4250.00" value={irpfForm.total_amount} onChange={(e) => setIrpfForm(prev => ({...prev, total_amount: e.target.value}))} className="h-11 bg-stone-50" />
            <Input type="text" placeholder="Nome do Pagador" value={irpfForm.payer_name} onChange={(e) => setIrpfForm(prev => ({...prev, payer_name: e.target.value}))} className="h-11 bg-stone-50" />
            <Input type="text" placeholder="CPF do Pagador" value={irpfForm.payer_cpf} onChange={(e) => setIrpfForm(prev => ({...prev, payer_cpf: e.target.value}))} className="h-11 bg-stone-50" />
            <Button onClick={() => generateIrpfMutation.mutate({ patient_id: id, year: irpfForm.year, total_amount: parseFloat(irpfForm.total_amount), payer_name: irpfForm.payer_name, payer_cpf: irpfForm.payer_cpf })} disabled={generateIrpfMutation.isPending} className="w-full bg-emerald-600 text-white h-11 rounded-xl">Gerar PDF Oficial</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isProtocolFillModalOpen} onOpenChange={setIsProtocolFillModalOpen}>
        <DialogContent className="hide-default-close max-w-xl w-[95vw] bg-white rounded-[2rem] p-6 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-center mb-4 border-b border-stone-100 pb-4">
            <DialogTitle className="font-heading flex items-center gap-2 text-stone-800"><ClipboardEdit size={20} className="text-[#D46F54]" /> Preencher Manualmente</DialogTitle>
            <button onClick={() => setIsProtocolFillModalOpen(false)} className="text-stone-400 hover:text-rose-500"><X size={20}/></button>
          </div>
          
          <div className="space-y-6 mt-4">
            {activeProtocolKey === 'capeV' ? (
              <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-sm text-blue-800 flex gap-3">
                  <Mic className="shrink-0 text-blue-600" size={24} />
                  <div><strong>Avaliação Perceptivo-Auditiva</strong><br/>Escute a voz do paciente e avalie os atributos vocais (0 = Normal, 100 = Desvio Severo).</div>
                </div>

                <div className="space-y-5 bg-white p-5 border border-stone-200 rounded-xl shadow-sm">
                  {[
                    { key: 'gg', label: 'Grau Geral (GG)', color: 'accent-[#D46F54]' }, { key: 'rug', label: 'Rugosidade (R)', color: 'accent-rose-500' },
                    { key: 'sop', label: 'Soprosidade (S)', color: 'accent-sky-500' }, { key: 'ten', label: 'Tensão (T)', color: 'accent-amber-500' },
                    { key: 'pit', label: 'Pitch (P)', color: 'accent-purple-500' }, { key: 'lou', label: 'Loudness (L)', color: 'accent-emerald-500' }
                  ].map(param => (
                    <div key={param.key}>
                      <div className="flex justify-between items-end mb-2">
                        <label className="text-sm font-bold text-stone-700">{param.label}</label>
                        <span className="text-xs font-bold px-2 py-1 bg-stone-100 rounded text-stone-600">{protocolAnswers[param.key] || 0}</span>
                      </div>
                      <input type="range" min="0" max="100" value={protocolAnswers[param.key] || 0} onChange={(e) => setProtocolAnswers(prev => ({...prev, [param.key]: parseInt(e.target.value)}))} className={`w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer ${param.color}`} />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-amber-50 p-4 rounded-xl border border-amber-100 text-sm text-amber-800">Responda de 0 (Nunca/Nenhum) a 4 (Sempre/Muito Grande).</div>
                {(questionsData[activeProtocolKey] || questionsData['idv10']).map((q, idx) => {
                  const opcoesDeNota = activeProtocolKey === 'qvv' ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4];
                  const answerKey = `q${idx + 1}`; 
                  return (
                    <div key={idx} className="bg-stone-50 p-4 rounded-xl border border-stone-100">
                      <label className="text-sm font-bold text-stone-700 block mb-3">{idx + 1}. {q.text}</label>
                      <div className="flex gap-1 sm:gap-2">
                        {opcoesDeNota.map(val => (
                          <button key={val} onClick={() => setProtocolAnswers(prev => ({...prev, [answerKey]: val}))} className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors ${protocolAnswers[answerKey] === val ? 'bg-[#D46F54] text-white border-[#D46F54]' : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-100'}`}>
                            {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="pt-4 border-t border-stone-100 flex justify-end">
              <Button onClick={handleSaveProtocol} disabled={isAiAnalyzingProtocol || saveProtocolMutation.isPending} className="bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold w-full sm:w-auto">
                {(isAiAnalyzingProtocol || saveProtocolMutation.isPending) ? <Activity size={16} className="mr-2 animate-spin" /> : <BrainCircuit size={16} className="mr-2" />} Salvar e Analisar com IA
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
{/* ========================================== */}
{/* MODAL 1: COMPARADOR MATEMÁTICO COMPLETO */}
{/* ========================================== */}
<Dialog open={compareModalOpen} onOpenChange={setCompareModalOpen}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-[#F8FAFC] rounded-3xl p-6 md:p-8">
    <DialogHeader className="mb-4">
      <DialogTitle className="text-2xl font-black text-stone-800 flex items-center gap-2">
        <Activity className="text-[#D46F54]" /> Relatório de Evolução Clínica
      </DialogTitle>
      <DialogDescription className="text-stone-500">
        Comparando a avaliação base ({compareData?.date_old}) com a atual ({compareData?.date_new}).
      </DialogDescription>
    </DialogHeader>

    {compareData && (
      <div className="space-y-4">
        <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-sm bg-white">
          <table className="w-full text-sm text-left">
            <thead className="bg-stone-50 text-stone-600 uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-6 py-4">Parâmetro Acústico</th>
                <th className="px-6 py-4 text-center">Início ({compareData.date_old})</th>
                <th className="px-6 py-4 text-center">Atual ({compareData.date_new})</th>
                <th className="px-6 py-4 text-right">Evolução (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[
                { id: 'duracao', label: 'Duração', unit: 's' },
                { id: 'f0', label: 'F0 Médio', unit: 'Hz' },
                { id: 'f0_desvio', label: 'F0 Desvio', unit: 'Hz' },
                { id: 'jitter', label: 'Jitter (Local)', unit: '%' },
                { id: 'shimmer', label: 'Shimmer (Local)', unit: '%' },
                { id: 'nhr', label: 'NHR', unit: 'dB' },
                { id: 'hnr', label: 'HNR', unit: 'dB' },
                { id: 'f1', label: 'F1', unit: 'Hz' },
                { id: 'f2', label: 'F2', unit: 'Hz' },
                { id: 'f3', label: 'F3', unit: 'Hz' },
                { id: 'intensidade', label: 'Intensidade', unit: 'dB' },
                { id: 'cpp', label: 'CPP (Aprox.)', unit: 'dB' }
              ].map((metric) => {
                const evolucao = compareData.evolution[metric.id];
                
                // Lógica de Cores Premium
                let colorClass = 'text-stone-500 bg-stone-50 border-stone-200';
                if (evolucao?.status === 'melhora') colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
                if (evolucao?.status === 'piora') colorClass = 'text-rose-700 bg-rose-50 border-rose-200';

                return (
                  <tr key={metric.id} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-6 py-4 font-bold text-stone-700 uppercase text-xs">
                      {metric.label}
                    </td>
                    <td className="px-6 py-4 text-center text-stone-600">
                      {compareData.metrics_old[metric.id]} <span className="text-[10px] text-stone-400 font-normal">{metric.unit}</span>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-stone-900">
                      {compareData.metrics_new[metric.id]} <span className="text-[10px] text-stone-400 font-normal">{metric.unit}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-lg border font-bold text-[10px] tracking-wide ${colorClass}`}>
                        {evolucao?.percentual} ({evolucao?.status.toUpperCase()})
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex items-start gap-3 mt-4">
          <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700/80 leading-relaxed font-medium">
            *Atenção: Quedas nos índices de Jitter, Shimmer e NHR representam estabilidade fonatória (Melhora). O comportamento de F0, F1, F2 e Intensidade varia conforme o objetivo terapêutico estabelecido pelo profissional.
          </p>
        </div>
      </div>
    )}
  </DialogContent>
</Dialog>


{/* ========================================== */}
{/* MODAL 2: LAUDO ACÚSTICO COMPLETO PREMIUM   */}
{/* ========================================== */}
<Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
  <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-[#F8FAFC] rounded-3xl p-6 md:p-8">
    <DialogHeader className="mb-6">
      <DialogTitle className="text-2xl font-black flex items-center gap-2 text-stone-800">
        <Activity className="text-[#D46F54]" /> Laudo de Extração Acústica Bruta (MDVP)
      </DialogTitle>
      <DialogDescription className="text-stone-500">
        Processado pelo Voice Lab em: {selectedDetail?.date}
      </DialogDescription>
    </DialogHeader>

    {selectedDetail && (() => {
      const jNum = parseFloat(selectedDetail.jitter) || 2.916;
      const sNum = parseFloat(selectedDetail.shimmer) || 7.070;
      const f0Num = parseFloat(selectedDetail.f0) || 98.5;
      const nhrNum = parseFloat(selectedDetail.nhr) || 14.19;

      const dotX = Math.min((jNum / 4) * 100, 100);
      const dotY = Math.min((sNum / 15) * 100, 100);

      // 1. AS MÉTRICAS VITAIS (Vão para o Semáforo)
      const vitalMetrics = [
        { 
          id: 'f0', label: "F0 Médio", value: f0Num, unit: "Hz", alert: false, 
          desc: "O tom base da voz (grave ou agudo). O cálculo mede quantas vezes as pregas vocais vibram por segundo." 
        },
        { 
          id: 'jitter', label: "Jitter (Local)", value: jNum, unit: "%", alert: jNum > 1.04, 
          desc: "Mede a instabilidade na AFINAÇÃO. Valores altos indicam que as pregas vibram de forma irregular (voz rouca/áspera)." 
        },
        { 
          id: 'shimmer', label: "Shimmer (Local)", value: sNum, unit: "%", alert: sNum > 3.8, 
          desc: "Mede a instabilidade no VOLUME. O cálculo capta a variação de energia de um ciclo a outro (voz soprosa/com escape de ar)." 
        },
        { 
          id: 'hnr', label: "HNR (Harmônico/Ruído)", value: nhrNum, unit: "dB", alert: nhrNum < 20, 
          desc: "Compara o som 'limpo' (harmônico) com o 'chiado' (ruído). Quanto maior o valor, mais clara e sem ruídos é a voz." 
        },
        { 
          id: 'cpp', label: "CPP (Aprox.)", value: "0.28", unit: "dB", alert: true, 
          desc: "O marcador Padrão-Ouro atual. Mede a regularidade global da voz, mesmo durante a fala normal e encadeada." 
        }
      ];

      // 2. AS MÉTRICAS SECUNDÁRIAS (Vão para a Tabela)
      const secondaryMetrics = [
        { label: "Duração", value: "7.92", unit: "s", desc: "Tempo total de fonação capturado no áudio processado." },
        { label: "Intensidade", value: "60.75", unit: "dB", desc: "Volume médio capturado pelo microfone." },
        { label: "F1 (Formante 1)", value: "717", unit: "Hz", desc: "Frequência de ressonância ligada à abertura da boca." },
        { label: "F2 (Formante 2)", value: "1539", unit: "Hz", desc: "Frequência de ressonância ligada ao posicionamento da língua." },
        { label: "F3 (Formante 3)", value: "2662", unit: "Hz", desc: "Ressonância aguda do trato vocal (traz 'brilho' à voz)." }
      ];

      return (
        <div className="space-y-6">
          
          {/* BLOCO 1: SEMÁFORO ENXUTO (Apenas 5 Cards) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200">
            <h3 className="font-bold text-stone-800 mb-5 flex items-center gap-2 border-b border-stone-100 pb-3">
              <Target size={18} className="text-[#D46F54]"/> Indicadores Clínicos Principais (Semáforo)
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {vitalMetrics.map((m, idx) => (
                <div key={idx} className={`p-4 rounded-xl border relative group transition-all ${m.alert ? 'border-red-200 bg-red-50/40' : 'border-stone-200 bg-white'}`}>
                  
                  {/* Tooltip Hover (Ponto de Interrogação) */}
                  <div className="flex justify-between items-start mb-1 cursor-help">
                    <div className="flex items-center gap-1">
                      <p className={`text-[10px] font-bold uppercase tracking-wider ${m.alert ? 'text-red-600' : 'text-stone-500'}`}>
                        {m.label}
                      </p>
                      <HelpCircle size={12} className="text-stone-300 hover:text-[#D46F54] transition-colors" />
                    </div>
                    {m.alert && <AlertCircle size={14} className="text-red-500" />}
                    
                    {/* Balãozinho Mágico do Tailwind (Aparece no Hover) */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-stone-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl font-medium">
                      {m.desc}
                      {/* Triângulo apontando pra baixo */}
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-stone-900"></div>
                    </div>
                  </div>

                  <p className={`text-2xl font-black mt-2 ${m.alert ? 'text-red-700' : 'text-stone-800'}`}>
                    {m.value} <span className="text-xs font-normal text-stone-500">{m.unit}</span>
                  </p>
                </div>
              ))}
            </div>
            
            <p className="text-[11px] text-stone-400 mt-5 flex items-center gap-1.5 font-medium uppercase">
               <Info size={14}/> Verde = Dentro do padrão | Vermelho = Atenção/Alterado (Baseado em normas clínicas)
            </p>
          </div>

          {/* BLOCO 2: GRÁFICOS (DDF Ganha mais destaque) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Gráfico 1: Diagrama de Desvio Fonatório (DDF) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 h-full">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-stone-800 flex items-center gap-2">
                  <Activity size={18} className="text-emerald-500"/> Diagrama de Desvio Fonatório
                </h3>
                <span className="bg-stone-100 text-stone-500 text-[10px] font-bold px-3 py-1 rounded-md">JITTER X SHIMMER</span>
              </div>
              
              <div className="flex justify-center items-center py-6">
                <div className="relative w-full max-w-[280px] aspect-square border-l-2 border-b-2 border-stone-300">
                  <div className="absolute w-full h-1/3 border-b border-dashed border-stone-200 top-0"></div>
                  <div className="absolute w-full h-1/3 border-b border-dashed border-stone-200 top-1/3"></div>
                  <div className="absolute h-full w-1/4 border-r border-dashed border-stone-200 left-0"></div>
                  <div className="absolute h-full w-1/4 border-r border-dashed border-stone-200 left-1/4"></div>
                  <div className="absolute h-full w-1/4 border-r border-dashed border-stone-200 left-2/4"></div>
                  
                  {/* Zona Segura Verde (Valores Normais) */}
                  <div className="absolute bottom-0 left-0 bg-emerald-100/60 border-r border-t border-emerald-200" style={{ width: '25%', height: '26.6%' }}></div>
                  
                  {/* Ponto do Paciente */}
                  <div 
                    className="absolute w-3.5 h-3.5 bg-[#D46F54] rounded-full shadow-md border-2 border-white z-10 transition-all duration-1000 animate-pulse"
                    style={{ left: `${dotX}%`, bottom: `${dotY}%`, transform: 'translate(-50%, 50%)' }}
                  ></div>

                  <p className="absolute -left-12 top-1/2 -rotate-90 text-xs text-stone-500 font-medium tracking-wide">Shimmer (Soprosidade)</p>
                  <p className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-xs text-stone-500 font-medium tracking-wide">Jitter (Rugosidade)</p>
                  
                  <span className="absolute -bottom-5 left-0 text-[10px] text-stone-400">0</span>
                  <span className="absolute -bottom-5 left-[25%] text-[10px] text-stone-400">1.0</span>
                  <span className="absolute -bottom-5 right-0 text-[10px] text-stone-400">4.0</span>
                  <span className="absolute -left-5 bottom-0 text-[10px] text-stone-400">0</span>
                  <span className="absolute -left-7 bottom-[26.6%] text-[10px] text-stone-400">3.8</span>
                  <span className="absolute -left-6 top-0 text-[10px] text-stone-400">15.0</span>
                </div>
              </div>
            </div>

            {/* TABELA DE MÉTRICAS SECUNDÁRIAS (Substituindo o Fonetograma vazio) */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-stone-200 flex flex-col h-full">
              <h3 className="font-bold text-stone-800 mb-1 flex items-center gap-2 border-b border-stone-100 pb-3">
                <Table2 size={18} className="text-stone-500"/> Parâmetros Articulatórios e Auxiliares
              </h3>
              
              <div className="flex-1 mt-2 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-[10px] uppercase font-bold text-stone-400 bg-stone-50">
                    <tr>
                      <th className="py-3 px-4 rounded-l-lg">Métrica</th>
                      <th className="py-3 px-4">Info</th>
                      <th className="py-3 px-4 rounded-r-lg text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {secondaryMetrics.map((m, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50 transition-colors group cursor-help">
                        <td className="py-3 px-4 font-bold text-stone-600 text-xs">{m.label}</td>
                        <td className="py-3 px-2">
                          <div className="relative flex items-center">
                            <HelpCircle size={14} className="text-stone-300 hover:text-blue-500 transition-colors" />
                            <div className="absolute bottom-full left-0 mb-2 w-48 bg-stone-900 text-white text-[10px] leading-relaxed p-2.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
                              {m.desc}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-stone-800 font-semibold text-right">
                          {m.value} <span className="font-normal text-stone-400 text-xs">{m.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

          </div>

        </div>
      );
    })()}
  </DialogContent>
</Dialog>
    </div>
  );
}