import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { 
  HelpCircle, TrendingUp, Clock, Wallet, Plus, 
  CheckCircle2, ArrowUpRight, ArrowDownRight, 
  Landmark, FileDigit, HeartPulse, Building2, FileSpreadsheet, BarChart, 
  ShieldCheck, AlertCircle, Receipt, ClipboardList, Send, User, RefreshCw
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

export default function FinancialCenter() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [openExpense, setOpenExpense] = useState(false);
  const [openTiss, setOpenTiss] = useState(false);
  const [openNfse, setOpenNfse] = useState(false); 
  
  const [saqueAmount, setSaqueAmount] = useState("");
  const [saqueDestination, setSaqueDestination] = useState("");
  
  const [expenseForm, setExpenseForm] = useState({ description: "", amount: "", due_date: new Date().toISOString().split('T')[0] });
  const [tissForm, setTissForm] = useState({ convenio: "Unimed", amount: "", mes_referencia: "" });
  const [nfseForm, setNfseForm] = useState({ patient_id: "none", cpf: "", service: "Sessão de Fonoaudiologia", amount: "" });

  const { data: patients = [] } = useQuery({ queryKey: ["patients"], queryFn: async () => (await api.get("/patients")).data });
  const { data: dashboardData } = useQuery({ queryKey: ["finance_dashboard"], queryFn: async () => (await api.get("/finance/dashboard")).data });
  const { data: covenants = [] } = useQuery({ queryKey: ["covenants"], queryFn: async () => (await api.get("/finance/covenants")).data });
  const { data: nfseList = [] } = useQuery({ queryKey: ["nfse"], queryFn: async () => (await api.get("/finance/nfse")).data });
  
  const { data: balanceData } = useQuery({ queryKey: ['finance_balance'], queryFn: async () => (await api.get('/finance/balance')).data });
  const { data: withdrawalsHistory = [] } = useQuery({ queryKey: ['withdrawals_history'], queryFn: async () => (await api.get('/finance/bank/statement')).data.historico || [] });
  const { data: vaultConfig } = useQuery({ queryKey: ['vault_config'], queryFn: async () => (await api.get('/finance/vault')).data });
  const { data: packages = [] } = useQuery({ queryKey: ["packages"], queryFn: async () => (await api.get("/packages")).data });

  // Helper para atualizar todas as queries financeiras simultaneamente
  const refreshAllFinance = () => {
    qc.invalidateQueries({ queryKey: ["packages"] });
    qc.invalidateQueries({ queryKey: ["finance_dashboard"] });
    qc.invalidateQueries({ queryKey: ["finance_balance"] });
    qc.invalidateQueries({ queryKey: ["withdrawals_history"] });
  };

  const markAsPaidManual = useMutation({
    mutationFn: async (pkgId) => (await api.put(`/packages/${pkgId}/pay`)).data,
    onSuccess: () => {
      toast.success("Baixa manual realizada! O sistema já contabilizou este valor como Receita.");
      refreshAllFinance();
    }
  });

  const syncPixPayments = useMutation({
    mutationFn: async () => (await api.post("/finance/pix/sync")).data,
    onSuccess: (data) => {
      if (data.updated > 0) {
        toast.success(data.msg);
      } else {
        toast.info("Nenhuma nova confirmação de Pix encontrada no banco ainda.");
      }
      refreshAllFinance();
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Erro ao sincronizar com o banco Asaas.");
    }
  });

  const createExpense = useMutation({
    mutationFn: async () => (await api.post("/finance/expenses", { ...expenseForm, amount: Number(expenseForm.amount) })).data,
    onSuccess: () => {
      toast.success("Despesa registrada no painel!");
      setExpenseForm({ description: "", amount: "", due_date: new Date().toISOString().split('T')[0] });
      refreshAllFinance();
      setOpenExpense(false);
    },
  });

  const generateTiss = useMutation({
    mutationFn: async () => (await api.post("/finance/covenants/tiss", { ...tissForm, amount: Number(tissForm.amount) })).data,
    onSuccess: () => { 
      toast.success("Lote TISS registrado com sucesso!"); 
      qc.invalidateQueries({ queryKey: ["covenants"] }); 
      setOpenTiss(false);
      setTissForm({ convenio: "Unimed", amount: "", mes_referencia: "" });
    }
  });

  const emitNFSe = useMutation({
    mutationFn: async () => {
      const patientName = nfseForm.patient_id !== "none" 
        ? patients.find(p => p.patient_id === nfseForm.patient_id)?.name || "Paciente Avulso" 
        : "Paciente Avulso";
      
      const payload = {
        patient_name: patientName,
        cpf: nfseForm.cpf,
        service: nfseForm.service,
        amount: Number(nfseForm.amount)
      };
      return (await api.post("/finance/nfse/emit", payload)).data;
    },
    onSuccess: () => { 
      toast.success("Nota Fiscal emitida e enviada para a prefeitura com sucesso!"); 
      qc.invalidateQueries({ queryKey: ["nfse"] }); 
      setOpenNfse(false);
      setNfseForm({ patient_id: "none", cpf: "", service: "Sessão de Fonoaudiologia", amount: "" });
    }
  });

  const requestWithdrawal = useMutation({
    mutationFn: async () => (await api.post("/finance/bank/withdraw", { amount: Number(saqueAmount.toString().replace(',', '.')), destination: saqueDestination })).data,
    onSuccess: () => { 
      toast.success("Saque realizado! O valor foi transferido para sua chave PIX."); 
      refreshAllFinance();
      setSaqueAmount(""); 
      setSaqueDestination(""); 
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || 'Erro ao solicitar saque.');
    }
  });

  const handleWithdraw = (e) => {
    e.preventDefault();
    const amount = parseFloat(saqueAmount.toString().replace(',', '.'));
    
    if (isNaN(amount) || amount <= 0) return toast.error('Insira um valor válido.');
    if (amount > (balanceData?.available_balance || 0)) return toast.error('Saldo insuficiente para este saque.');
    if (vaultConfig?.status !== 'configured') return toast.error('Configure o seu Cofre (em Configurações) primeiro.');

    requestWithdrawal.mutate();
  };

  const handleDownloadXML = (c) => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<mensagemTISS xmlns="http://www.ans.gov.br/padroes/tiss/schemas">
  <cabecalho>
    <identificacaoTransacao>
      <tipoTransacao>ENVIO_LOTE_GUIAS</tipoTransacao>
      <dataRegistroTransacao>${new Date().toISOString().split('T')[0]}</dataRegistroTransacao>
    </identificacaoTransacao>
    <origem><registroANS>123456</registroANS></origem>
    <destino><cnpjOperadora>12345678000190</cnpjOperadora></destino>
  </cabecalho>
  <prestadorParaOperadora>
    <loteGuias>
      <numeroLote>${c.lote_id}</numeroLote>
      <valorTotal>${c.amount}</valorTotal>
    </loteGuias>
  </prestadorParaOperadora>
</mensagemTISS>`;

    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LOTE_TISS_${c.convenio}_${c.mes_referencia.replace('/', '-')}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Arquivo XML (TISS) baixado com sucesso!");
  };

  const handleDownloadRepasse = async () => {
    toast.info("Gerando PDF com o padrão visual da clínica...");
    try {
      const response = await api.get('/finance/covenants/repasse/pdf', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Folha_Repasse_${new Date().toISOString().split('T')[0]}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("PDF de Fechamento baixado com sucesso!");
    } catch {
      toast.error("Erro ao gerar o PDF de Repasse. Verifique a conexão com o servidor.");
    }
  };

  const handleDownloadDMED = async () => {
    toast.info("Varrendo pagamentos e montando arquivo DMED...");
    try {
      const response = await api.get('/finance/dmed/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `DMED_Receita_Federal_${new Date().getFullYear()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Lote fiscal exportado com sucesso! Envie o arquivo gerado para o seu contador.");
    } catch {
      toast.error("Erro ao processar dados da Receita.");
    }
  };

  const formatCurrency = (val) => (val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const monthlyData = dashboardData?.monthly_data || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const maxRevenue = Math.max(...monthlyData, 1); 
  const monthLabels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  return (
    <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-4 bg-white p-6 rounded-3xl border border-stone-200 shadow-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1 flex items-center gap-2">
            <Landmark size={14} className="text-[#D46F54]"/> Central Financeira Integrada
          </div>
          <h1 className="font-heading text-3xl font-bold text-stone-800">
            Gestão & Faturamento
            <InfoTooltip title="O que é esta tela?" text="Este é o painel de controle financeiro da sua clínica. Aqui o sistema cruza os orçamentos que você envia para os pacientes com o dinheiro que cai na sua conta digital (Psicobank), gerando gráficos automáticos e balanços de recebimento." />
          </h1>
        </div>
      </div>

      <div className="flex overflow-x-auto border-b border-stone-200 custom-scrollbar mb-8">
        {[
          { id: "dashboard", label: "Visão Geral & Gráficos", icon: TrendingUp },
          { id: "control", label: "Controle de Mensalidades", icon: ClipboardList },
          { id: "covenants", label: "Convênios & Repasses", icon: HeartPulse },
          { id: "fiscal", label: "Fiscal & NFSe", icon: FileDigit },
          { id: "bank", label: "Psicobank (Conta)", icon: Wallet },
        ].map((tab) => (
          <button 
            key={tab.id} onClick={() => setActiveTab(tab.id)} 
            className={`flex items-center gap-2 px-5 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? "border-[#D46F54] text-[#D46F54] bg-white rounded-t-xl shadow-sm" : "border-transparent text-stone-500 hover:text-stone-700 hover:bg-stone-50"}`}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      {/* ABA 1: DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            
            <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-6 shadow-sm">
              <div className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-1 flex items-center">
                Receitas (Entradas) 
                <InfoTooltip title="O que são Receitas?" text="Dinheiro que já caiu na conta." />
              </div>
              <div className="font-heading text-4xl font-bold text-emerald-800 mt-3">{formatCurrency(balanceData?.total_earned)}</div>
              <div className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1"><ArrowUpRight size={12}/> Dinheiro no caixa</div>
            </div>

            <div className="bg-rose-50 border border-rose-100 rounded-3xl p-6 shadow-sm relative group">
              <div className="flex justify-between items-start">
                <div className="text-xs font-bold text-rose-700 uppercase tracking-widest mb-1 flex items-center">
                  Despesas (A Pagar) 
                </div>
                <Dialog open={openExpense} onOpenChange={setOpenExpense}>
                  <DialogTrigger asChild>
                    <button className="text-rose-700 bg-rose-200/50 hover:bg-rose-200 px-2 py-1 rounded text-xs font-bold flex items-center gap-1 transition-colors"><Plus size={12}/> Nova</button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm bg-stone-50 rounded-2xl p-6 border-stone-200">
                    <DialogHeader><DialogTitle className="font-heading text-rose-700">Registrar Despesa</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div><Label className="text-xs font-bold text-stone-600 mb-1 block">Descrição (Ex: Aluguel)</Label><Input value={expenseForm.description} onChange={(e) => setExpenseForm({...expenseForm, description: e.target.value})} className="bg-white"/></div>
                      <div><Label className="text-xs font-bold text-stone-600 mb-1 block">Valor a pagar (R$)</Label><Input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({...expenseForm, amount: e.target.value})} className="bg-white"/></div>
                      <div><Label className="text-xs font-bold text-stone-600 mb-1 block">Vencimento</Label><Input type="date" value={expenseForm.due_date} onChange={(e) => setExpenseForm({...expenseForm, due_date: e.target.value})} className="bg-white"/></div>
                      <Button onClick={() => createExpense.mutate()} disabled={createExpense.isPending || !expenseForm.description} className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold h-11 rounded-xl shadow-md">Salvar no Painel</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              <div className="font-heading text-4xl font-bold text-rose-800 mt-3">{formatCurrency(balanceData?.total_expenses)}</div>
              <div className="text-xs text-rose-600 font-medium mt-2 flex items-center gap-1"><ArrowDownRight size={12}/> Vencimentos registrados</div>
            </div>

            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
              <div className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-1 flex items-center">
                A Receber (Pendentes)
                <InfoTooltip title="O que é Dinheiro A Receber?" text="Dinheiro que é seu, mas ainda está 'na rua'. Cobranças geradas pelo paciente e não pagas." />
              </div>
              <div className="font-heading text-4xl font-bold text-stone-800 mt-3">{formatCurrency(balanceData?.total_pending)}</div>
              <div className="text-xs text-stone-400 font-medium mt-2 flex items-center gap-1"><Clock size={12}/> Faturas pendentes</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm h-72 flex flex-col overflow-hidden">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2"><BarChart size={18} className="text-[#D46F54]"/> Faturamento Anual (12 Meses)</h3>
              <div className="flex-1 flex items-end gap-1.5 sm:gap-2.5 justify-between pt-4 border-b border-stone-100 pb-2">
                {monthlyData.map((val, i) => {
                  const heightPct = (val / maxRevenue) * 100;
                  return (
                    <div key={i} className="w-full bg-emerald-100 rounded-t-md relative group hover:bg-emerald-300 transition-colors" style={{ height: `${heightPct}%`, minHeight: '6px' }}>
                      <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-bold text-stone-600 bg-white border border-stone-200 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-sm">
                        R$ {Number(val).toFixed(0)}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex justify-between mt-2 text-[9px] sm:text-[10px] font-bold text-stone-400 uppercase">
                {monthLabels.map(m => <span key={m}>{m}</span>)}
              </div>
            </div>
            
            <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col h-72">
              <h3 className="font-bold text-stone-800 mb-4 flex items-center gap-2 shrink-0"><FileSpreadsheet size={18} className="text-[#D46F54]"/> Contas a Receber vs Pagar</h3>
              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {!dashboardData?.transactions || dashboardData.transactions.length === 0 ? (
                  <div className="text-center text-sm text-stone-400 italic py-8">Nenhuma movimentação pendente.</div>
                ) : (
                  dashboardData.transactions.map((t, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 border border-stone-100 rounded-xl bg-stone-50 hover:bg-stone-100 transition-colors">
                      <div className="overflow-hidden pr-3">
                        <p className="font-bold text-sm text-stone-700 truncate">{t.title}</p>
                        <p className={`text-[9px] uppercase font-bold mt-0.5 ${t.type === 'expense' ? 'text-rose-500' : 'text-stone-400'}`}>
                          {t.type === 'expense' ? `Vence: ${t.date.split('-').reverse().join('/')}` : `Gerado: ${t.date.split('-').reverse().join('/')}`}
                        </p>
                      </div>
                      <span className={`font-bold shrink-0 ${t.type === 'expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {t.type === 'expense' ? '- ' : '+ '}{formatCurrency(t.amount)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ABA: CONTROLE DE MENSALIDADES E INADIMPLÊNCIA */}
      {activeTab === "control" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h2 className="font-bold text-lg text-stone-800 flex items-center gap-2">
                <ClipboardList className="text-[#D46F54]" /> Monitor de Inadimplência & Pagamentos
              </h2>
              <p className="text-sm text-stone-500 mt-1">Acompanhe quem já pagou, quem está atrasado e sincronize pagamentos Pix em tempo real.</p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center gap-4 text-sm font-bold">
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500"></span> Pagos</div>
                <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500"></span> Pendentes</div>
              </div>

              <Button 
                onClick={() => syncPixPayments.mutate()} 
                disabled={syncPixPayments.isPending}
                variant="outline"
                className="border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 font-bold rounded-xl h-10 px-4"
              >
                <RefreshCw size={15} className={`mr-2 ${syncPixPayments.isPending ? "animate-spin" : ""}`} />
                {syncPixPayments.isPending ? "Consultando Banco..." : "Sincronizar Pix (Asaas)"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {packages.length === 0 && <div className="col-span-full py-12 text-center text-stone-400 italic">Nenhuma cobrança gerada ainda. Vá no perfil de um paciente para cobrar.</div>}
            
            {packages.map((p) => {
              const isPaid = p.status === "paid";
              const patientName = patients.find(pat => pat.patient_id === p.patient_id)?.name || p.patient_name || "Paciente Avulso";
              const patientPhone = patients.find(pat => pat.patient_id === p.patient_id)?.phone?.replace(/\D/g, '') || "";

              const handleSendReminder = () => {
                const msg = `Olá, ${patientName.split(" ")[0]}! Passando para lembrar sobre o pagamento do plano: *${p.name}* (R$ ${Number(p.amount).toFixed(2)}).\n\nQualquer dúvida, estamos à disposição!`;
                if (patientPhone) window.open(`https://wa.me/55${patientPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                else { navigator.clipboard.writeText(msg); toast.warning("Sem telefone. Mensagem copiada!"); }
              };

              return (
                <div key={p.package_id} className={`bg-white border rounded-3xl p-6 flex flex-col h-full shadow-sm transition-all hover:shadow-md ${isPaid ? 'border-emerald-200' : 'border-amber-200'}`}>
                  <div className="flex items-start justify-between mb-4 border-b border-stone-100 pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-stone-100 text-stone-600 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-widest">{p.payment_type || 'Plano'}</span>
                      </div>
                      <h3 className="font-bold text-stone-800 text-base leading-tight truncate">{p.name}</h3>
                      <div className="mt-2 flex items-center gap-2 text-[11px] font-bold text-stone-500">
                        <User size={12} className="text-[#D46F54]" /> {patientName}
                      </div>
                    </div>
                    <div className={`shrink-0 px-3 py-1 rounded-full text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 border ${isPaid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                      {isPaid ? <><CheckCircle2 size={12}/> Quitado</> : <><Clock size={12}/> Pendente</>}
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-heading text-3xl font-bold text-stone-800">{formatCurrency(Number(p.amount))}</div>
                    {isPaid && p.payment_method === 'manual' && (
                      <p className="text-[10px] text-stone-400 font-bold uppercase mt-2 border border-stone-100 bg-stone-50 px-2 py-1 rounded w-fit">Baixa Manual Efetuada</p>
                    )}
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-stone-100 space-y-2">
                    {!isPaid ? (
                      <div className="flex flex-col gap-2">
                        <Button 
                          onClick={() => {
                            if(window.confirm("Tem certeza que o paciente já pagou este valor (ex: em dinheiro/maquininha na clínica)?")) {
                              markAsPaidManual.mutate(p.package_id);
                            }
                          }}
                          disabled={markAsPaidManual.isPending}
                          className="w-full h-10 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-transform hover:scale-[1.02]"
                        >
                          <CheckCircle2 className="mr-2" size={14} /> Dar Baixa Manual (Marcar Pago)
                        </Button>
                        <Button variant="outline" onClick={handleSendReminder} className="w-full h-9 text-[11px] uppercase tracking-wider font-bold border-amber-200 text-amber-700 hover:bg-amber-50 rounded-xl">
                          <Send size={14} className="mr-1.5"/> Enviar Lembrete Whats
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" className="w-full h-10 text-xs font-bold rounded-xl border-stone-200 text-stone-400 cursor-not-allowed">
                        <Receipt className="mr-2" size={14} /> Pagamento já finalizado
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ABA 2: CONVÊNIOS E REPASSES */}
      {activeTab === "covenants" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 shadow-sm flex gap-4 items-center">
            <HeartPulse size={32} className="text-indigo-500 shrink-0"/>
            <div>
              <h2 className="font-bold text-lg text-indigo-900">Gestão de Convênios <InfoTooltip title="Lotes TISS / TUSS" text="Se a sua clínica atende plano de saúde, use esta aba para gerar os relatórios em formato XML (TISS) para mandar para a operadora." /></h2>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col h-full">
              <div className="flex justify-between items-center mb-4 border-b border-stone-100 pb-3">
                <h3 className="font-bold text-stone-800">Lotes de Convênio (A Receber)</h3>
                <Dialog open={openTiss} onOpenChange={setOpenTiss}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="h-8 text-xs font-bold border-indigo-200 text-indigo-600 hover:bg-indigo-50"><Plus size={12} className="mr-1"/> Novo Lote</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-sm bg-stone-50 rounded-2xl p-6 border-stone-200">
                    <DialogHeader><DialogTitle className="font-heading text-indigo-700">Gerar Lote de Faturamento TISS</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-2">
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Operadora de Saúde</Label>
                        <Select value={tissForm.convenio} onValueChange={(v) => setTissForm({...tissForm, convenio: v})}>
                          <SelectTrigger className="bg-white"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Unimed">Unimed</SelectItem>
                            <SelectItem value="Bradesco Saúde">Bradesco Saúde</SelectItem>
                            <SelectItem value="SulAmérica">SulAmérica</SelectItem>
                            <SelectItem value="Amil">Amil</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Mês de Referência (MM/YYYY)</Label>
                        <Input value={tissForm.mes_referencia} onChange={(e) => setTissForm({...tissForm, mes_referencia: e.target.value})} placeholder="Ex: 10/2026" className="bg-white"/>
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Valor Total das Guias (R$)</Label>
                        <Input type="number" step="0.01" value={tissForm.amount} onChange={(e) => setTissForm({...tissForm, amount: e.target.value})} placeholder="Ex: 2450.00" className="bg-white"/>
                      </div>
                      <Button onClick={() => generateTiss.mutate()} disabled={generateTiss.isPending || !tissForm.amount || !tissForm.mes_referencia} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-11 rounded-xl shadow-md mt-2">
                        Salvar Lote no Painel
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              
              <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar">
                {covenants.length === 0 ? <p className="text-sm text-stone-500 italic text-center py-8">Nenhum lote TISS gerado.</p> : covenants.map(c => (
                  <div key={c.lote_id} className="p-3 border border-stone-100 rounded-xl bg-stone-50 flex justify-between items-center hover:border-indigo-200 transition-colors">
                    <div>
                      <p className="font-bold text-sm text-stone-700">Lote {c.convenio}</p>
                      <p className="text-[10px] font-bold text-stone-400 mt-0.5">Ref: {c.mes_referencia}</p>
                      <p className="text-[9px] font-bold text-amber-500 uppercase mt-1 bg-amber-100 w-fit px-1.5 rounded">{c.status}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-stone-800 block">{formatCurrency(c.amount)}</span>
                      <button onClick={() => handleDownloadXML(c)} className="text-[9px] text-indigo-600 font-bold uppercase mt-1 hover:underline">Baixar XML</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
              <h3 className="font-bold text-stone-800 mb-4 border-b border-stone-100 pb-3 flex items-center gap-2">Repasses e Comissões <InfoTooltip title="Cálculo Automático" text="No final do mês, o sistema soma todo o dinheiro que os pacientes pagaram e divide automaticamente a parte da Clínica e do Fonoaudiólogo." /></h3>
              <div className="p-4 border border-indigo-100 bg-indigo-50/30 rounded-xl mb-4">
                <div className="text-xs font-bold text-stone-500 uppercase mb-1">Regra Padrão da Clínica</div>
                <div className="font-bold text-indigo-800">Clínica: 30% | Profissional: 70%</div>
              </div>
              <Button onClick={handleDownloadRepasse} className="w-full bg-stone-900 hover:bg-black text-white h-10 rounded-xl font-bold">Fechar Folha de Repasse (PDF)</Button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: FISCAL E NFSE */}
      {activeTab === "fiscal" && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2"><Receipt className="text-[#D46F54]"/> Emissão de Notas (NFSe)</h3>
                  
                  <Dialog open={openNfse} onOpenChange={setOpenNfse}>
                    <DialogTrigger asChild>
                      <Button className="bg-[#D46F54] hover:bg-[#B75C46] text-white h-9 font-bold rounded-xl text-xs"><Plus size={14} className="mr-1"/> Nova NFSe</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-sm bg-stone-50 rounded-2xl p-6 border-stone-200">
                      <DialogHeader><DialogTitle className="font-heading text-[#D46F54]">Emitir NFSe Avulsa</DialogTitle></DialogHeader>
                      <div className="space-y-4 mt-2">
                        <div>
                          <Label className="text-xs font-bold text-stone-600 mb-1 block">Vincular Paciente</Label>
                          <Select value={nfseForm.patient_id} onValueChange={(v) => setNfseForm({...nfseForm, patient_id: v})}>
                            <SelectTrigger className="bg-white h-11"><SelectValue placeholder="Cliente Avulso" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Cliente Avulso (Sem cadastro)</SelectItem>
                              {patients.map((p) => <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label className="text-xs font-bold text-stone-600 mb-1 block">CPF do Tomador</Label><Input value={nfseForm.cpf} onChange={(e) => setNfseForm({...nfseForm, cpf: e.target.value})} placeholder="000.000.000-00" className="bg-white h-11 font-mono"/></div>
                        <div><Label className="text-xs font-bold text-stone-600 mb-1 block">Descrição do Serviço</Label><Input value={nfseForm.service} onChange={(e) => setNfseForm({...nfseForm, service: e.target.value})} className="bg-white h-11"/></div>
                        <div><Label className="text-xs font-bold text-stone-600 mb-1 block">Valor da Nota (R$)</Label><Input type="number" step="0.01" value={nfseForm.amount} onChange={(e) => setNfseForm({...nfseForm, amount: e.target.value})} className="bg-white h-11"/></div>
                        <Button onClick={() => emitNFSe.mutate()} disabled={emitNFSe.isPending || !nfseForm.amount || !nfseForm.cpf} className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold h-11 rounded-xl shadow-md mt-2">
                          Emitir NFSe Oficial
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="space-y-3 mb-6 mt-4">
                  {nfseList.length === 0 ? <p className="text-sm text-stone-500 italic">Nenhuma NFSe emitida no sistema.</p> : nfseList.map(n => (
                    <div key={n.nfse_id} className="p-3 border border-emerald-100 bg-emerald-50/50 rounded-xl flex justify-between items-center">
                      <div>
                        <p className="font-bold text-sm text-stone-700">Nota 00{n.numero_nota}</p>
                        <p className="text-[10px] text-emerald-600 font-bold uppercase">{n.prefeitura}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-stone-800 text-sm block">{formatCurrency(n.amount)}</span>
                        <span className="text-[9px] text-stone-400 font-bold uppercase mt-1 flex items-center justify-end gap-1"><CheckCircle2 size={10} className="text-emerald-500"/> Sucesso</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm flex flex-col">
              <div>
                <h3 className="font-bold text-stone-800 text-lg flex items-center gap-2 mb-2"><Building2 className="text-emerald-600"/> Integração Carnê-Leão</h3>
                <p className="text-sm text-stone-500 mb-6">Sincronize os dados (CPF e Valores) gerando a planilha de exportação para a Receita Federal.</p>
              </div>
              <Button onClick={handleDownloadDMED} variant="outline" className="w-full border-emerald-200 text-emerald-700 hover:bg-emerald-50 h-11 font-bold rounded-xl mt-auto transition-colors">
                Baixar Lote Anual (Exportação DMED)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ABA 4: PSICOBANK / CONTA DIGITAL */}
      {activeTab === "bank" && (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 mt-4">
          
          {vaultConfig?.status !== 'configured' && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
              <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-800">Conta de Recebimento não configurada</h4>
                <p className="text-sm text-amber-700 mt-1">Para realizar saques, vá em <strong>Administração {">"} Configurações & Equipe {">"} Cofre</strong> e cadastre seu Banco ou Chave PIX.</p>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-8 shadow-2xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none"></div>
            <div className="flex justify-between items-start mb-12 relative z-10">
              <div className="text-sm font-bold text-stone-400 uppercase tracking-widest flex items-center gap-2">
                <Wallet size={16}/> Conta Digital (Psicobank)
              </div>
            </div>
            <div className="relative z-10">
              <p className="text-sm text-stone-400 font-medium mb-1">Saldo Disponível para Saque</p>
              <h2 className="text-5xl font-heading font-bold">{formatCurrency(balanceData?.available_balance || 0)}</h2>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm mb-6">
            <h3 className="font-bold text-stone-800 mb-4 border-b border-stone-100 pb-3 flex items-center gap-2">
              <ArrowUpRight className="text-emerald-600" size={18} /> Efetuar Transferência (Pix)
            </h3>
            
            <form onSubmit={handleWithdraw}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Valor do Saque (R$)</Label>
                  <Input type="number" step="0.01" placeholder="Ex: 150.00" value={saqueAmount} onChange={e => setSaqueAmount(e.target.value)} className="h-12 bg-stone-50 border-stone-200 text-lg" />
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Chave Pix de Destino</Label>
                  <Input type="text" placeholder="CPF, E-mail, Celular ou Aleatória" value={saqueDestination} onChange={e => setSaqueDestination(e.target.value)} className="h-12 bg-stone-50 border-stone-200" />
                </div>
              </div>
              
              <Button 
                type="submit"
                disabled={!saqueAmount || !saqueDestination || requestWithdrawal.isPending || Number(saqueAmount) > (balanceData?.available_balance || 0) || vaultConfig?.status !== 'configured'} 
                className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-sm"
              >
                {requestWithdrawal.isPending ? "Processando..." : "Confirmar Transferência"}
              </Button>
              
              {Number(saqueAmount) > (balanceData?.available_balance || 0) && (
                 <p className="text-xs text-rose-500 font-bold mt-2 text-center">Saldo insuficiente para este saque.</p>
              )}
            </form>
          </div>

          <div className="bg-white border border-stone-200 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-stone-800 mb-4 border-b border-stone-100 pb-3 flex items-center gap-2">
              <Clock size={18} className="text-stone-400" /> Histórico de Saques e TED
            </h3>
            <div className="space-y-4">
              {withdrawalsHistory.length === 0 ? <p className="text-sm text-stone-500 italic">Nenhum saque solicitado.</p> : withdrawalsHistory.map((s, index) => (
                <div key={index} className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-100 hover:border-stone-200 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                      <ArrowUpRight size={20}/>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-stone-800">Transferência PIX</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-wider">{new Date(s.requested_at || s.created_at).toLocaleDateString('pt-BR')}</p>
                        {s.status === 'PROCESSING' && <span className="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">Em Processamento</span>}
                        {(s.status === 'PAID' || s.status === 'COMPLETED') && <span className="bg-emerald-100 text-emerald-700 text-[9px] px-2 py-0.5 rounded font-bold uppercase tracking-widest">Concluído</span>}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-rose-600 text-lg">- {formatCurrency(s.amount)}</p>
                    <p className="text-[10px] text-stone-400 font-bold uppercase mt-1">Chave: {s.destination || "***"}</p>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-6 flex items-center gap-2 text-xs text-stone-400 bg-stone-50 p-3 rounded-lg border border-stone-100">
              <ShieldCheck size={16} className="text-emerald-500" />
              As transações são protegidas e auditadas pelo sistema bancário. Saques via PIX geralmente compensam em segundos.
            </div>
          </div>
        </div>
      )}

    </div>
  );
}