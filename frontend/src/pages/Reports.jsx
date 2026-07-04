import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { streamPost } from "@/lib/sse";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import MarkdownView from "@/components/MarkdownView";

export default function Reports() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ patient_id: "", recipient: "", purpose: "" });
  const [selected, setSelected] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");

  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => (await api.get("/reports")).data,
  });

  const gen = useMutation({
    mutationFn: async () => {
      setStreaming(true);
      setStreamText("");
      setSelected(null);
      let result;
      try {
        result = await streamPost("/reports/generate", form, {
          onDelta: (d) => setStreamText((prev) => prev + d),
        });
      } catch (e) {
        result = null;
      }
      if (result?.report) return result.report;
      const latest = (await api.get("/reports")).data?.[0];
      return latest;
    },
    onSuccess: (d) => {
      setStreaming(false);
      toast.success("Relatório gerado");
      if (d) setSelected(d);
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: () => {
      setStreaming(false);
      toast.error("Erro ao gerar relatório");
    },
  });

  if (selected) {
    return (
      <div className="p-8 md:p-10 print-page">
        <div className="no-print flex justify-between items-center mb-6">
          <Button variant="outline" onClick={() => setSelected(null)}>
            <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
          </Button>
          <div className="flex gap-2">
            <Button
              data-testid="print-report-btn"
              onClick={() => window.print()}
              className="bg-[#D46F54] hover:bg-[#B75C46] text-white"
            >
              <i className="fa-solid fa-print mr-2"></i> Imprimir / Salvar PDF
            </Button>
          </div>
        </div>
        <div className="bg-white border border-stone-200 rounded-lg p-10 max-w-4xl mx-auto">
          <div className="text-xs uppercase tracking-widest text-stone-500 mb-1">Relatório Fonoaudiológico</div>
          <div className="text-sm text-stone-500 mb-6">Paciente: {selected.patient_name} · {new Date(selected.created_at).toLocaleDateString("pt-BR")}</div>
          <MarkdownView content={selected.content} />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 md:p-10">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Documentos</div>
        <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Relatórios</h1>
        <p className="text-stone-500 text-sm mt-2">Documentos premium prontos para impressão.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg p-6 h-fit">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Novo relatório</div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Paciente</Label>
              <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                <SelectTrigger data-testid="report-patient-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Destinatário</Label>
              <Input placeholder="Ex.: Dr. Silva / Escola / Convênio" value={form.recipient} onChange={(e) => setForm({ ...form, recipient: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Finalidade</Label>
              <Input placeholder="Ex.: encaminhamento, atualização clínica…" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
            <Button
              data-testid="generate-report-btn"
              onClick={() => gen.mutate()}
              disabled={!form.patient_id || gen.isPending}
              className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white"
            >
              {gen.isPending ? (
                <><i className="fa-solid fa-spinner fa-spin mr-2"></i> Gerando…</>
              ) : (
                <><i className="fa-solid fa-file-signature mr-2"></i> Gerar relatório</>
              )}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-8">
          {streaming && (
            <div className="bg-white border border-stone-200 rounded-lg p-8 mb-4">
              <div className="text-xs uppercase tracking-widest text-[#B75C46] font-bold mb-3">
                <i className="fa-solid fa-file-signature mr-2"></i> Redigindo relatório…
              </div>
              <MarkdownView content={streamText || "_A IA está redigindo…_"} />
            </div>
          )}
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Histórico</div>
          {reports.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-200 rounded-lg p-12 text-center text-stone-500 text-sm">
              Seus relatórios aparecerão aqui.
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((r) => (
                <button
                  key={r.report_id}
                  data-testid={`report-card-${r.report_id}`}
                  onClick={() => setSelected(r)}
                  className="w-full text-left bg-white border border-stone-200 rounded-lg p-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-heading font-medium">{r.patient_name}</div>
                      <div className="text-xs text-stone-500 mt-1">
                        {r.recipient || "—"} · {r.purpose || "atualização clínica"}
                      </div>
                    </div>
                    <div className="text-xs text-stone-500 font-mono">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
