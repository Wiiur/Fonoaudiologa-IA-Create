import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, ShieldCheck, CheckCircle2, AlertTriangle, Building2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

const BANCOS_POPULARES = [
  { code: "341", name: "Itaú Unibanco" },
  { code: "033", name: "Santander" },
  { code: "237", name: "Bradesco" },
  { code: "001", name: "Banco do Brasil" },
  { code: "104", name: "Caixa Econômica" },
  { code: "260", name: "Nubank" },
  { code: "077", name: "Banco Inter" },
];

export default function FinancialVault() {
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const [formData, setFormData] = useState({
    cpf_cnpj: "",
    pix_key: "",
    bank_code: "341",
    agency: "",
    account: "",
    account_type: "corrente",
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
          cpf_cnpj: savedData.cpf_cnpj || "",
          bank_code: savedData.bank_code || "341",
          agency: savedData.agency || "",
        }));
      } else {
        setEditMode(true);
      }
    }
  }, [savedData]);

  const saveVaultMutation = useMutation({
    mutationFn: async (payload) => (await api.post("/finance/vault", payload)).data,
    onSuccess: () => {
      toast.success("Cofre bancário atualizado e criptografado com sucesso!");
      setEditMode(false);
      qc.invalidateQueries({ queryKey: ["vault_config"] });
      qc.invalidateQueries({ queryKey: ["finance_balance"] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.detail || "Erro ao salvar dados bancários.");
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.cpf_cnpj.trim()) {
      return toast.error("Informe o CPF ou CNPJ do titular.");
    }
    saveVaultMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8 bg-white rounded-3xl border border-stone-200 text-center text-stone-400 animate-pulse font-bold text-sm">
        Verificando credenciais do Cofre Bancário...
      </div>
    );
  }

  const isConfigured = savedData?.status === "configured";

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-8 bg-white rounded-3xl shadow-sm border border-stone-200">
      
      {/* HEADER DE SEGURANÇA */}
      <div className="flex items-center gap-4 border-b border-stone-100 pb-5 mb-6">
        <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
          <ShieldCheck size={28} />
        </div>
        <div>
          <h2 className="text-xl font-heading font-bold text-stone-800">Cofre de Recebimentos (Asaas)</h2>
          <p className="text-sm text-stone-500">Configure a conta titular para liquidação dos pagamentos Pix e saques do Psicobank.</p>
        </div>
      </div>

      {/* VISÃO PROTEGIDA (QUANDO JÁ ESTÁ CADASTRADO) */}
      {!editMode && isConfigured && (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-36 h-36 bg-emerald-100 rounded-bl-full -mr-10 -mt-10 opacity-40 pointer-events-none" />

          <div className="flex flex-col sm:flex-row justify-between items-start gap-4 relative z-10">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 bg-emerald-100/80 text-emerald-800 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider">
                <Lock size={13} /> Dados Protegidos Ponta a Ponta (LGPD)
              </div>

              <div>
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">CPF / CNPJ Titular</span>
                <span className="text-sm font-mono font-bold text-stone-700">{savedData.cpf_cnpj || "Configurado"}</span>
              </div>

              <div>
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest">Chave PIX Principal</span>
                <span className="text-lg font-mono font-bold text-stone-800">{savedData.pix_masked || "Não cadastrada"}</span>
              </div>

              <div className="pt-3 border-t border-stone-200/80">
                <span className="block text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-1">Conta Bancária Vinculada</span>
                <div className="flex items-center gap-2">
                  <Building2 size={16} className="text-[#D46F54]" />
                  <span className="text-sm font-bold text-stone-700">
                    Banco: {BANCOS_POPULARES.find((b) => b.code === savedData.bank_code)?.name || savedData.bank_code || "Padrão"}
                  </span>
                </div>
                <div className="flex gap-6 mt-1 text-xs text-stone-600 font-mono font-bold">
                  <span>Agência: {savedData.agency || "****"}</span>
                  <span>Conta: {savedData.account_masked || "****"}</span>
                </div>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => setEditMode(true)}
              className="border-stone-300 text-stone-700 hover:bg-white font-bold rounded-xl"
            >
              Alterar Conta
            </Button>
          </div>

          {savedData.updated_at && (
            <div className="mt-6 pt-4 border-t border-stone-200/60 flex items-center gap-2 text-xs text-stone-400 font-medium">
              <CheckCircle2 size={14} className="text-emerald-500" />
              Última verificação de segurança: {new Date(savedData.updated_at).toLocaleDateString("pt-BR")}
            </div>
          )}
        </div>
      )}

      {/* FORMULÁRIO DE EDIÇÃO */}
      {editMode && (
        <form onSubmit={handleSubmit} className="space-y-6 animate-in fade-in">
          <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-2xl text-xs leading-relaxed flex items-start gap-3">
            <AlertTriangle size={18} className="shrink-0 mt-0.5 text-amber-600" />
            <p>
              Os valores recebidos dos pacientes serão transferidos para a chave PIX ou conta bancária informada abaixo. Certifique-se de que a conta pertence ao <strong>mesmo titular</strong> do CPF/CNPJ cadastrado.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <Label className="text-xs font-bold text-stone-600 mb-1.5 block">CPF ou CNPJ do Titular *</Label>
              <Input
                required
                type="text"
                className="h-11 bg-stone-50"
                placeholder="000.000.000-00"
                value={formData.cpf_cnpj}
                onChange={(e) => setFormData({ ...formData, cpf_cnpj: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-600 mb-1.5 flex items-center gap-1.5">
                <Smartphone size={14} className="text-[#D46F54]" /> Chave PIX Padrão <span className="text-[10px] text-emerald-600 font-bold">(Recomendado)</span>
              </Label>
              <Input
                type="text"
                className="h-11 bg-stone-50"
                placeholder="CPF, E-mail, Celular ou Aleatória"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
              />
            </div>

            <div className="md:col-span-2 pt-3 border-t border-stone-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400">Dados Bancários (Opcional para TED)</h3>
            </div>

            <div className="md:col-span-2">
              <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Instituição Bancária</Label>
              <select
                className="w-full h-11 px-3 bg-stone-50 border border-stone-200 rounded-xl text-sm font-medium outline-none focus:border-[#D46F54]"
                value={formData.bank_code}
                onChange={(e) => setFormData({ ...formData, bank_code: e.target.value })}
              >
                {BANCOS_POPULARES.map((b) => (
                  <option key={b.code} value={b.code}>{`${b.code} - ${b.name}`}</option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Agência (sem dígito)</Label>
              <Input
                type="text"
                className="h-11 bg-stone-50"
                placeholder="Ex: 0001"
                value={formData.agency}
                onChange={(e) => setFormData({ ...formData, agency: e.target.value })}
              />
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-600 mb-1.5 block">Conta com dígito</Label>
              <Input
                type="text"
                className="h-11 bg-stone-50"
                placeholder="Ex: 12345-6"
                value={formData.account}
                onChange={(e) => setFormData({ ...formData, account: e.target.value })}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-stone-100">
            {isConfigured && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMode(false)}
                className="rounded-xl h-11 px-5 font-bold"
              >
                Cancelar
              </Button>
            )}
            <Button
              type="submit"
              disabled={saveVaultMutation.isPending}
              className="bg-[#D46F54] hover:bg-[#B75C46] text-white font-bold rounded-xl h-11 px-6 shadow-md"
            >
              <Lock size={16} className="mr-2" />
              {saveVaultMutation.isPending ? "Criptografando e Salvando..." : "Salvar no Cofre"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}