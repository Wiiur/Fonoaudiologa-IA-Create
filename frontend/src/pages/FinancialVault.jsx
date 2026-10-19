import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Lock, ShieldCheck, CheckCircle2, AlertTriangle, Building2, Smartphone,
  CreditCard, Info, Calculator, Sparkles, Trash2, Plus, ArrowRight, BadgePercent
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

// Taxa padrão por Pix pago (você pode ajustar conforme sua margem sobre o Asaas)
const PIX_FEE_FIXED = 1.99;

const BANCOS_POPULARES = [
  { code: "341", name: "Itaú Unibanco" },
  { code: "033", name: "Santander" },
  { code: "237", name: "Bradesco" },
  { code: "001", name: "Banco do Brasil" },
  { code: "104", name: "Caixa Econômica" },
  { code: "260", name: "Nubank" },
  { code: "077", name: "Banco Inter" },
  { code: "336", name: "C6 Bank" },
  { code: "290", name: "PagBank" },
];

export default function FinancialVault() {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);
  const [simValue, setSimValue] = useState("150");
  const [showCardForm, setShowCardForm] = useState(false);

  // Formulário White-Label de Abertura/Configuração de Recebimentos
  const [formData, setFormData] = useState({
    holder_name: "",
    cpf_cnpj: "",
    birth_date: "",
    phone: "",
    postal_code: "",
    address: "",
    monthly_income: "5000",
    pix_key: "",
    bank_code: "341",
    agency: "",
    account: "",
    account_type: "corrente",
    accepted_fee_terms: true,
  });

  // Formulário de Cartão de Crédito do Doutor (Settings)
  const [cardForm, setCardForm] = useState({
    holder_name: "",
    number: "",
    expiry: "",
    cvv: "",
    cpf_holder: "",
  });

  const { data: savedData, isLoading } = useQuery({
    queryKey: ["vault_config"],
    queryFn: async () => (await api.get("/finance/vault")).data,
  });

  useEffect(() => {
    if (savedData) {
      if (savedData.status === "configured") {
        setEditMode(false);
        setFormData((prev) => ({
          ...prev,
          holder_name: savedData.holder_name || "",
          cpf_cnpj: savedData.cpf_cnpj || "",
          phone: savedData.phone || "",
          postal_code: savedData.postal_code || "",
          address: savedData.address || "",
          bank_code: savedData.bank_code || "341",
          agency: savedData.agency || "",
          accepted_fee_terms: true,
        }));
      } else {
        setEditMode(true);
      }
    }
  }, [savedData]);

  const saveVaultMutation = useMutation({
    mutationFn: async (payload) => (await api.post("/finance/vault", payload)).data,
    onSuccess: (res) => {
      toast.success(res.msg || "Conta Digital Psicobank ativada com sucesso!");
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ["vault_config"] });
      qc.invalidateQueries({ queryKey: ["finance_balance"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Erro ao ativar conta de recebimentos.");
    },
  });

  const saveCardMutation = useMutation({
    mutationFn: async (payload) => (await api.post("/finance/card", payload)).data,
    onSuccess: () => {
      toast.success("Cartão de crédito validado e vinculado à sua conta!");
      setShowCardForm(false);
      setCardForm({ holder_name: "", number: "", expiry: "", cvv: "", cpf_holder: "" });
      qc.invalidateQueries({ queryKey: ["vault_config"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Não foi possível salvar o cartão.");
    },
  });

  const removeCardMutation = useMutation({
    mutationFn: async () => (await api.delete("/finance/card")).data,
    onSuccess: () => {
      toast.success("Cartão removido com sucesso.");
      qc.invalidateQueries({ queryKey: ["vault_config"] });
    },
  });

  const handleSubmitVault = (e) => {
    e.preventDefault();
    if (!formData.cpf_cnpj.trim() || !formData.pix_key.trim()) {
      return toast.error("Informe pelo menos o CPF/CNPJ e sua Chave PIX principal.");
    }
    if (!formData.accepted_fee_terms) {
      return toast.error("Você precisa concordar com a política de taxas operacionais do Pix.");
    }
    saveVaultMutation.mutate(formData);
  };

  const handleSubmitCard = (e) => {
    e.preventDefault();
    const cleanNum = cardForm.number.replace(/\D/g, "");
    if (cleanNum.length < 13) {
      return toast.error("Número de cartão inválido.");
    }
    saveCardMutation.mutate(cardForm);
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-8 bg-white rounded-3xl border border-stone-200 text-center text-stone-400 animate-pulse font-bold text-sm">
        Sincronizando Cofre Digital e Credenciais White-Label...
      </div>
    );
  }

  const isConfigured = savedData?.status === "configured";
  const feePerPix = savedData?.pix_fee ?? PIX_FEE_FIXED;
  const numericSim = Math.max(0, parseFloat(simValue.toString().replace(",", ".")) || 0);
  const netSim = Math.max(0, numericSim - (numericSim > 0 ? feePerPix : 0));

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      
      {/* ================================================================= */}
      {/* BLOCO 1: TRANSPARÊNCIA DE TAXAS PIX & SIMULADOR DE LÍQUIDO        */}
      {/* ================================================================= */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 rounded-3xl p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-56 h-56 bg-[#D46F54] opacity-15 rounded-full blur-3xl pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          <div className="lg:col-span-7 space-y-4">
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/15 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest text-amber-300">
              <BadgePercent size={14} /> Política Transparente de Taxas (Psicobank)
            </div>
            <h2 className="font-heading text-2xl md:text-3xl font-bold leading-tight">
              Receba dos seus pacientes via PIX sem precisar criar conta em bancos externos.
            </h2>
            <p className="text-sm text-stone-300 leading-relaxed">
              O <strong>VoxIntelligence</strong> já possui motor bancário integrado. Você cadastra apenas sua chave de repasse aqui no portal e já pode emitir QR Codes Pix com baixa automática no prontuário.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Emissão de QR Code</span>
                <span className="text-xl font-heading font-bold text-emerald-400">R$ 0,00</span>
                <span className="text-[10px] text-stone-400 block mt-0.5">Grátis para gerar e enviar</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Taxa de Liquidação Pix</span>
                <span className="text-xl font-heading font-bold text-amber-300">
                  R$ {feePerPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[10px] text-stone-400 block mt-0.5">Apenas se o paciente pagar</span>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 block">Custódia & Baixa</span>
                <span className="text-xl font-heading font-bold text-white">Automática</span>
                <span className="text-[10px] text-stone-400 block mt-0.5">Direto para o seu Psicobank</span>
              </div>
            </div>
          </div>

          {/* Simulador de Recebimento Líquido */}
          <div className="lg:col-span-5 bg-white text-stone-800 rounded-2xl p-5 shadow-lg border border-stone-200">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D46F54] mb-3">
              <Calculator size={15} /> Simulador de Recebimento Líquido
            </div>
            <label className="text-xs font-bold text-stone-500 block mb-1">
              Se você cobrar do paciente (R$):
            </label>
            <Input
              type="number"
              value={simValue}
              onChange={(e) => setSimValue(e.target.value)}
              className="h-11 bg-stone-50 font-heading text-lg font-bold border-stone-200 mb-4"
            />
            <div className="space-y-2 text-xs border-t border-stone-100 pt-3">
              <div className="flex justify-between text-stone-500">
                <span>Valor pago pelo paciente:</span>
                <span className="font-bold text-stone-700">R$ {numericSim.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-rose-600">
                <span>Taxa operacional Pix (Asaas/Gateway):</span>
                <span className="font-bold">- R$ {(numericSim > 0 ? feePerPix : 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center bg-emerald-50 border border-emerald-100 p-3 rounded-xl mt-2">
                <span className="font-bold text-emerald-900">Você recebe líquido:</span>
                <span className="font-heading text-xl font-black text-emerald-700">
                  R$ {netSim.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* BLOCO 2: CADASTRO WHITE-LABEL DO COFRE (SEM SAIR DO SISTEMA)      */}
      {/* ================================================================= */}
      <div className="p-6 md:p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
              <ShieldCheck size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-heading font-bold text-stone-800">Conta Digital de Recebimentos</h2>
                {isConfigured && (
                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Ativa • White-Label
                  </span>
                )}
              </div>
              <p className="text-sm text-stone-500">
                Habilite sua carteira de recebimentos preenchendo os dados abaixo — tudo direto pelo nosso portal.
              </p>
            </div>
          </div>
        </div>

        {/* VISÃO CONFIGURADA */}
        {!editMode && isConfigured && (
          <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 bg-emerald-100/80 text-emerald-800 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                  <Lock size={13} /> Subconta Integrada Ativa (Sem necessidade de painel externo)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-1">
                  <div>
                    <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">Titular Credenciado</span>
                    <span className="text-sm font-bold text-stone-800">{savedData.holder_name || "Profissional Titular"}</span>
                    <span className="block text-xs font-mono text-stone-500 mt-0.5">{savedData.cpf_cnpj}</span>
                  </div>

                  <div>
                    <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">Chave PIX de Repasse</span>
                    <span className="text-lg font-mono font-bold text-[#D46F54]">{savedData.pix_masked || "Não cadastrada"}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-stone-200/80 flex flex-wrap gap-6 text-xs text-stone-600">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Building2 size={15} className="text-stone-400" />
                    Banco: {BANCOS_POPULARES.find((b) => b.code === savedData.bank_code)?.name || savedData.bank_code}
                  </span>
                  <span className="font-mono font-bold">Ag: {savedData.agency || "****"}</span>
                  <span className="font-mono font-bold">Conta: {savedData.account_masked || "****"}</span>
                  <span className="text-emerald-700 font-bold">
                    • Taxa Pix Acordada: R$ {feePerPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/transação
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={() => setEditMode(true)}
                className="border-stone-300 text-stone-700 hover:bg-white font-bold rounded-xl shrink-0"
              >
                Atualizar Dados Bancários
              </Button>
            </div>
          </div>
        )}

        {/* FORMULÁRIO WHITE-LABEL DE CREDENCIAMENTO DIRETO */}
        {editMode && (
          <form onSubmit={handleSubmitVault} className="space-y-6 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Nome Completo ou Razão Social *</Label>
                <Input
                  required
                  value={formData.holder_name}
                  onChange={(e) => setFormData({ ...formData, holder_name: e.target.value })}
                  placeholder="Ex: Dra. Carla Souza Fonoaudiologia"
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">CPF ou CNPJ do Titular *</Label>
                <Input
                  required
                  value={formData.cpf_cnpj}
                  onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
                  placeholder="000.000.000-00"
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Data de Nascimento (Obrigatório p/ CPF) *</Label>
                <Input
                  type="date"
                  required
                  value={formData.birth_date}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Telefone / WhatsApp Comercial</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="(19) 99999-9999"
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">CEP da Clínica</Label>
                <Input
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  placeholder="00000-000"
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Chave PIX Principal (Para Saques) *</Label>
                <Input
                  required
                  value={formData.pix_key}
                  onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                  placeholder="CPF, E-mail, Celular ou Aleatória"
                  className="h-11 bg-stone-50 border-[#D46F54]/40"
                />
              </div>

              <div className="md:col-span-3 pt-2 border-t border-stone-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                  Conta Bancária de Titularidade (Opcional para transferências TED)
                </span>
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Banco</Label>
                <select
                  className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium outline-none"
                  value={formData.bank_code}
                  onChange={(e) => setFormData({ ...formData, bank_code: e.target.value })}
                >
                  {BANCOS_POPULARES.map((b) => (
                    <option key={b.code} value={b.code}>{`${b.code} - ${b.name}`}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Agência</Label>
                <Input
                  value={formData.agency}
                  onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
                  placeholder="Ex: 0001"
                  className="h-11 bg-stone-50"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Conta com dígito</Label>
                <Input
                  value={formData.account}
                  onChange={(e) => setFormData({ ...formData, account: e.target.value })}
                  placeholder="Ex: 12345-6"
                  className="h-11 bg-stone-50"
                />
              </div>
            </div>

            {/* Termo de Ciência das Taxas Pix */}
            <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <input
                type="checkbox"
                id="fee_terms"
                checked={formData.accepted_fee_terms}
                onChange={(e) => setFormData({ ...formData, accepted_fee_terms: e.target.checked })}
                className="w-5 h-5 accent-[#D46F54] mt-0.5 cursor-pointer"
              />
              <label htmlFor="fee_terms" className="text-xs text-stone-700 leading-relaxed cursor-pointer">
                <strong>Declaração de Ciência de Taxas:</strong> Estou ciente de que a ativação da conta digital integrada é gratuita e que cada cobrança Pix paga pelos meus pacientes possui uma taxa de liquidação operacional de{" "}
                <strong>R$ {feePerPix.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>, descontada automaticamente do saldo líquido creditado no Psicobank.
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              {isConfigured && (
                <Button type="button" variant="outline" onClick={() => setEditMode(false)} className="rounded-xl h-11">
                  Cancelar
                </Button>
              )}
              <Button
                type="submit"
                disabled={saveVaultMutation.isPending}
                className="bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold rounded-xl h-11 px-6 shadow-md"
              >
                <Lock size={16} className="mr-2" />
                {saveVaultMutation.isPending ? "Ativando Conta Digital..." : "Ativar Conta Digital no Portal"}
              </Button>
            </div>
          </form>
        )}
      </div>

      {/* ================================================================= */}
      {/* BLOCO 3: CARTÃO DE CRÉDITO DO DOUTOR (ASSINATURA & FATURAMENTO)   */}
      {/* ================================================================= */}
      <div className="p-6 md:p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 pb-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
              <CreditCard size={28} />
            </div>
            <div>
              <h2 className="text-xl font-heading font-bold text-stone-800">Cartão de Crédito Cadastrado (Assinatura SaaS)</h2>
              <p className="text-sm text-stone-500">
                Mantenha um cartão cadastrado para renovação automática da sua licença VoxIntelligence sem interrupções.
              </p>
            </div>
          </div>

          {!showCardForm && !savedData?.card && (
            <Button
              onClick={() => setShowCardForm(true)}
              className="bg-stone-900 hover:bg-black text-white font-bold rounded-xl h-11"
            >
              <Plus size={16} className="mr-2" /> Cadastrar Cartão
            </Button>
          )}
        </div>

        {/* CARTÃO JÁ SALVO */}
        {savedData?.card && !showCardForm ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-lg relative overflow-hidden">
              <div className="flex justify-between items-center mb-8">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-300">VoxIntelligence Member</span>
                <span className="text-sm font-black uppercase bg-white/10 px-2.5 py-1 rounded">{savedData.card.brand || "CARTÃO"}</span>
              </div>
              <div className="font-mono text-xl tracking-[0.2em] mb-6">
                •••• •••• •••• {savedData.card.last4}
              </div>
              <div className="flex justify-between items-end text-xs">
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block">Titular</span>
                  <span className="font-bold uppercase">{savedData.card.holder_name}</span>
                </div>
                <div>
                  <span className="text-[9px] uppercase text-slate-400 block">Validade</span>
                  <span className="font-mono font-bold">{savedData.card.expiry}</span>
                </div>
              </div>
            </div>

            <div className="md:col-span-6 space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-800 font-medium">
                <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                Cartão tokenizado com segurança (PCI-DSS). Nenhuma informação sensível de CVV fica exposta.
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setShowCardForm(true)} className="rounded-xl font-bold">
                  Trocar Cartão
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => removeCardMutation.mutate()}
                  disabled={removeCardMutation.isPending}
                  className="text-rose-600 hover:bg-rose-50 rounded-xl font-bold"
                >
                  <Trash2 size={16} className="mr-1.5" /> Remover
                </Button>
              </div>
            </div>
          </div>
        ) : showCardForm ? (
          <form onSubmit={handleSubmitCard} className="space-y-4 bg-stone-50 p-6 rounded-2xl border border-stone-200 animate-in fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1 block">Nome impresso no cartão *</Label>
                <Input
                  required
                  placeholder="Ex: CARLA H SOUZA"
                  value={cardForm.holder_name}
                  onChange={(e) => setCardForm({ ...cardForm, holder_name: e.target.value.toUpperCase() })}
                  className="bg-white h-11"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1 block">CPF do Titular do Cartão *</Label>
                <Input
                  required
                  placeholder="000.000.000-00"
                  value={cardForm.cpf_holder}
                  onChange={(e) => setCardForm({ ...cardForm, cpf_holder: e.target.value })}
                  className="bg-white h-11"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-stone-600 mb-1 block">Número do Cartão *</Label>
                <Input
                  required
                  placeholder="0000 0000 0000 0000"
                  maxLength={19}
                  value={cardForm.number}
                  onChange={(e) => setCardForm({ ...cardForm, number: e.target.value })}
                  className="bg-white h-11 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-stone-600 mb-1 block">Validade (MM/AA) *</Label>
                  <Input
                    required
                    placeholder="08/29"
                    maxLength={5}
                    value={cardForm.expiry}
                    onChange={(e) => setCardForm({ ...cardForm, expiry: e.target.value })}
                    className="bg-white h-11 font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-stone-600 mb-1 block">CVV *</Label>
                  <Input
                    required
                    type="password"
                    placeholder="***"
                    maxLength={4}
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value })}
                    className="bg-white h-11 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <Button type="button" variant="outline" onClick={() => setShowCardForm(false)} className="rounded-xl">
                Cancelar
              </Button>
              <Button type="submit" disabled={saveCardMutation.isPending} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl px-6">
                {saveCardMutation.isPending ? "Validando..." : "Salvar Cartão Seguro"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="text-center py-8 bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-stone-500 text-sm">
            Nenhum cartão cadastrado no momento.
          </div>
        )}
      </div>

    </div>
  );
}