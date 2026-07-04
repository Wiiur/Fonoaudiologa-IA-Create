import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function Packages() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", sessions: 10, amount: 1500, patient_id: "" });

  const { data: packages = [] } = useQuery({
    queryKey: ["packages"],
    queryFn: async () => (await api.get("/packages")).data,
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/packages", {
      ...form,
      sessions: Number(form.sessions),
      amount: Number(form.amount),
      patient_id: form.patient_id || null,
    })).data,
    onSuccess: () => {
      toast.success("Pacote criado");
      qc.invalidateQueries({ queryKey: ["packages"] });
      setOpen(false);
    },
    onError: () => toast.error("Erro ao criar pacote"),
  });

  const startCheckout = async (pkg) => {
    try {
      const { data } = await api.post("/packages/checkout", {
        package_id: pkg.package_id,
        origin_url: window.location.origin,
      });
      // Copy link so doctor can share with patient
      try { await navigator.clipboard.writeText(data.url); } catch {}
      toast.success("Link de checkout copiado! Envie ao paciente.");
      window.open(data.url, "_blank");
    } catch {
      toast.error("Erro ao gerar link");
    }
  };

  return (
    <div className="p-8 md:p-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Faturamento</div>
          <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Pacotes de Sessões</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-package-btn" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
              <i className="fa-solid fa-plus mr-2"></i> Novo pacote
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="font-heading">Criar pacote</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input data-testid="pkg-name-input" placeholder="Ex.: Pacote Voz 10 sessões" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nº de sessões</Label>
                  <Input type="number" value={form.sessions} onChange={(e) => setForm({ ...form, sessions: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Valor (R$)</Label>
                  <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Paciente (opcional)</Label>
                <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Genérico" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                data-testid="submit-package-btn"
                onClick={() => create.mutate()}
                disabled={!form.name || create.isPending}
                className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white"
              >
                {create.isPending ? "Criando…" : "Criar pacote"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {packages.length === 0 ? (
        <div className="bg-white border border-dashed border-stone-200 rounded-lg p-12 text-center text-sm text-stone-500">
          Nenhum pacote criado. Crie o primeiro para começar a receber pagamentos.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {packages.map((p) => (
            <div key={p.package_id} data-testid={`package-card-${p.package_id}`} className="bg-white border border-stone-200 rounded-lg p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-widest text-stone-500">{p.sessions} sessões</div>
                  <div className="font-heading text-lg font-semibold mt-1">{p.name}</div>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${p.status === "paid" ? "bg-[#6B8E7C]/10 text-[#6B8E7C]" : "bg-stone-100 text-stone-600"}`}>
                  {p.status === "paid" ? "Pago" : "Aguardando"}
                </span>
              </div>
              <div className="font-heading text-3xl font-medium mt-4">R$ {Number(p.amount).toFixed(2)}</div>
              <Button
                data-testid={`checkout-btn-${p.package_id}`}
                onClick={() => startCheckout(p)}
                className="w-full mt-5 bg-[#D46F54] hover:bg-[#B75C46] text-white"
                disabled={p.status === "paid"}
              >
                <i className="fa-solid fa-link mr-2"></i> Gerar link de checkout
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
