import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DIAGS = ["Disfagia", "Afasia", "TDL", "Motricidade Orofacial", "Voz", "Fluência", "Linguagem", "Outros"];

export default function Patients() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", email: "", phone: "", age: "", diagnosis: "", interests: "", notes: "" });

  const { data: patients = [], isLoading } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/patients", { ...form, age: form.age ? Number(form.age) : null })).data,
    onSuccess: () => {
      toast.success("Paciente cadastrado");
      qc.invalidateQueries({ queryKey: ["patients"] });
      setOpen(false);
      setForm({ name: "", email: "", phone: "", age: "", diagnosis: "", interests: "", notes: "" });
    },
    onError: () => toast.error("Erro ao cadastrar"),
  });

  const filtered = patients.filter(
    (p) =>
      !q ||
      p.name?.toLowerCase().includes(q.toLowerCase()) ||
      p.diagnosis?.toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div className="p-8 md:p-10">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Gestão</div>
          <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Pacientes</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="new-patient-btn" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
              <i className="fa-solid fa-plus mr-2"></i> Novo paciente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-heading">Cadastrar paciente</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-2">
              <div className="col-span-2">
                <Label className="text-xs">Nome completo</Label>
                <Input data-testid="patient-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">E-mail</Label>
                <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Telefone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Idade</Label>
                <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Diagnóstico</Label>
                <Select value={form.diagnosis} onValueChange={(v) => setForm({ ...form, diagnosis: v })}>
                  <SelectTrigger data-testid="patient-diagnosis-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {DIAGS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Interesses do paciente</Label>
                <Input placeholder="Ex.: futebol, música, animais…" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Observações</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                data-testid="submit-patient-btn"
                disabled={!form.name || create.isPending}
                onClick={() => create.mutate()}
                className="bg-[#D46F54] hover:bg-[#B75C46] text-white"
              >
                {create.isPending ? "Salvando…" : "Cadastrar"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-5">
        <Input
          data-testid="patient-search-input"
          placeholder="Buscar por nome ou diagnóstico…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-md"
        />
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-stone-500 bg-stone-50/50 border-b border-stone-200">
              <th className="text-left p-4 font-medium">Nome</th>
              <th className="text-left p-4 font-medium">Diagnóstico</th>
              <th className="text-left p-4 font-medium">Idade</th>
              <th className="text-left p-4 font-medium">Contato</th>
              <th className="text-left p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={5} className="p-8 text-center text-stone-500">Carregando…</td></tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="p-10 text-center text-stone-500">
                Nenhum paciente ainda. Cadastre o primeiro.
              </td></tr>
            )}
            {filtered.map((p) => (
              <tr key={p.patient_id} className="border-b border-stone-100 hover:bg-stone-50/50">
                <td className="p-4">
                  <Link to={`/patients/${p.patient_id}`} className="font-medium hover:text-[#B75C46]" data-testid={`patient-row-${p.patient_id}`}>
                    {p.name}
                  </Link>
                </td>
                <td className="p-4">
                  {p.diagnosis && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#F3E7E4] text-[#B75C46]">
                      {p.diagnosis}
                    </span>
                  )}
                </td>
                <td className="p-4 text-stone-600">{p.age ?? "—"}</td>
                <td className="p-4 text-stone-600 text-xs">{p.phone || p.email || "—"}</td>
                <td className="p-4">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#6B8E7C]/10 text-[#6B8E7C]">
                    {p.status === "active" ? "Ativo" : p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
