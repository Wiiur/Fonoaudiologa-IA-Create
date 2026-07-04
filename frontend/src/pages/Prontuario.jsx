import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export default function Prontuario() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id: "",
    session_date: today,
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });
  const { data: records = [] } = useQuery({
    queryKey: ["records-all", form.patient_id],
    queryFn: async () => (await api.get(form.patient_id ? `/records?patient_id=${form.patient_id}` : "/records")).data,
  });

  const save = useMutation({
    mutationFn: async () => (await api.post("/records", form)).data,
    onSuccess: () => {
      toast.success("Prontuário registrado");
      qc.invalidateQueries({ queryKey: ["records-all"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setForm({ ...form, subjective: "", objective: "", assessment: "", plan: "" });
    },
    onError: () => toast.error("Erro ao salvar"),
  });

  return (
    <div className="p-8 md:p-10">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Registro clínico</div>
        <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Prontuário SOAP</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white border border-stone-200 rounded-lg p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <Label className="text-xs">Paciente</Label>
              <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                <SelectTrigger data-testid="soap-patient-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data da sessão</Label>
              <Input type="date" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
            </div>
          </div>

          {[
            { k: "subjective", l: "S — Subjetivo", h: "Relato do paciente / queixas / percepções" },
            { k: "objective", l: "O — Objetivo", h: "Achados clínicos, medidas, observações objetivas" },
            { k: "assessment", l: "A — Avaliação", h: "Interpretação clínica / hipóteses" },
            { k: "plan", l: "P — Plano", h: "Condutas, próximos passos, orientações" },
          ].map((f) => (
            <div key={f.k} className="mb-4">
              <Label className="text-xs font-medium text-[#B75C46]">{f.l}</Label>
              <Textarea
                data-testid={`soap-${f.k}-textarea`}
                rows={3}
                placeholder={f.h}
                value={form[f.k]}
                onChange={(e) => setForm({ ...form, [f.k]: e.target.value })}
                className="mt-1"
              />
            </div>
          ))}

          <Button
            data-testid="save-soap-btn"
            onClick={() => save.mutate()}
            disabled={!form.patient_id || save.isPending}
            className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white"
          >
            {save.isPending ? "Salvando…" : "Registrar evolução"}
          </Button>
        </div>

        <div className="lg:col-span-5">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Histórico</div>
          <div className="space-y-3">
            {records.length === 0 ? (
              <div className="bg-white border border-dashed border-stone-200 rounded-lg p-8 text-center text-stone-500 text-sm">
                {form.patient_id ? "Sem registros para este paciente." : "Selecione um paciente para ver histórico."}
              </div>
            ) : (
              records.map((r) => (
                <div key={r.record_id} className="bg-white border border-stone-200 rounded-lg p-4">
                  <div className="text-xs text-stone-500 mb-2">{r.session_date}</div>
                  <div className="text-sm space-y-1">
                    {r.subjective && <div><span className="text-[#B75C46] font-medium text-xs">S:</span> {r.subjective}</div>}
                    {r.objective && <div><span className="text-[#B75C46] font-medium text-xs">O:</span> {r.objective}</div>}
                    {r.assessment && <div><span className="text-[#B75C46] font-medium text-xs">A:</span> {r.assessment}</div>}
                    {r.plan && <div><span className="text-[#B75C46] font-medium text-xs">P:</span> {r.plan}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
