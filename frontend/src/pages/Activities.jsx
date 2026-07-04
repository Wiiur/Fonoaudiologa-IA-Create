import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { streamPost } from "@/lib/sse";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import MarkdownView from "@/components/MarkdownView";

const DIAGS = ["Disfagia", "Afasia", "TDL", "Motricidade Orofacial", "Voz", "Fluência", "Linguagem"];
const AGES = [
  { v: "child", l: "Criança (0-11)" },
  { v: "teen", l: "Adolescente (12-17)" },
  { v: "adult", l: "Adulto (18-59)" },
  { v: "elderly", l: "Idoso (60+)" },
];

export default function Activities() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    patient_id: "",
    diagnosis: "",
    environment: "home",
    age_group: "adult",
    goals: "",
    interests: "",
  });
  const [selected, setSelected] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");

  const { data: activities = [], isLoading } = useQuery({
    queryKey: ["activities"],
    queryFn: async () => (await api.get("/activities")).data,
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const generate = useMutation({
    mutationFn: async () => {
      setStreaming(true);
      setStreamText("");
      setSelected(null);
      let result;
      try {
        result = await streamPost(
          "/activities/generate",
          { ...form, patient_id: form.patient_id || null },
          { onDelta: (d) => setStreamText((prev) => prev + d) }
        );
      } catch (e) {
        // Cloudflare may cut long streams. Fallback: fetch latest saved activity.
        result = null;
      }
      if (result?.activity) return result.activity;
      // Fallback: fetch latest activity from server (backend saves even if stream is cut)
      const latest = (await api.get("/activities")).data?.[0];
      return latest;
    },
    onSuccess: (d) => {
      setStreaming(false);
      toast.success("Atividade gerada");
      if (d) setSelected(d);
      qc.invalidateQueries({ queryKey: ["activities"] });
    },
    onError: () => {
      setStreaming(false);
      toast.error("Erro ao gerar atividade");
    },
  });

  return (
    <div className="p-8 md:p-10">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Design terapêutico</div>
        <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Atividades por IA</h1>
        <p className="text-stone-500 text-sm mt-2">Planos personalizados por diagnóstico, idade e ambiente.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 bg-white border border-stone-200 rounded-lg p-6 h-fit">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Configurar</div>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Paciente (opcional)</Label>
              <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                <SelectTrigger data-testid="act-patient-select"><SelectValue placeholder="Genérico" /></SelectTrigger>
                <SelectContent>
                  {patients.map((p) => (
                    <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Diagnóstico</Label>
              <Select value={form.diagnosis} onValueChange={(v) => setForm({ ...form, diagnosis: v })}>
                <SelectTrigger data-testid="act-diagnosis-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                <SelectContent>
                  {DIAGS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Faixa etária</Label>
              <Select value={form.age_group} onValueChange={(v) => setForm({ ...form, age_group: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGES.map((a) => <SelectItem key={a.v} value={a.v}>{a.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ambiente</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {["clinic", "home"].map((v) => (
                  <button
                    key={v}
                    onClick={() => setForm({ ...form, environment: v })}
                    data-testid={`env-${v}`}
                    className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                      form.environment === v ? "bg-[#F3E7E4] border-[#D46F54] text-[#B75C46]" : "border-stone-200 hover:bg-stone-50"
                    }`}
                  >
                    {v === "clinic" ? "Clínica" : "Home care"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs">Objetivos terapêuticos</Label>
              <Textarea rows={2} placeholder="Ex.: melhorar praxia oral, aumentar VOT..." value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Interesses do paciente</Label>
              <Input placeholder="Ex.: dinossauros, futebol…" value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
            </div>

            <Button
              data-testid="generate-activity-btn"
              onClick={() => generate.mutate()}
              disabled={!form.diagnosis || generate.isPending}
              className="w-full bg-[#D46F54] hover:bg-[#B75C46] text-white"
            >
              {generate.isPending ? (
                <><i className="fa-solid fa-spinner fa-spin mr-2"></i> Gerando…</>
              ) : (
                <><i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Gerar atividade</>
              )}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-8">
          {streaming ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8">
              <div className="text-xs uppercase tracking-widest text-[#B75C46] font-bold mb-3">
                <i className="fa-solid fa-wand-magic-sparkles mr-2"></i> Gerando em tempo real…
              </div>
              <MarkdownView content={streamText || "_A IA está pensando…_"} />
            </div>
          ) : selected ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs uppercase tracking-widest text-stone-500">
                    {selected.environment === "clinic" ? "Clínica" : "Home care"} · {selected.diagnosis}
                  </div>
                  <h2 className="font-heading text-2xl font-medium tracking-tight mt-1">{selected.title}</h2>
                </div>
                <Button variant="outline" onClick={() => setSelected(null)}>Voltar à lista</Button>
              </div>
              <MarkdownView content={selected.content} />
            </div>
          ) : (
            <div>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-3">Atividades geradas</div>
              {isLoading ? (
                <div className="text-stone-500 text-sm">Carregando…</div>
              ) : activities.length === 0 ? (
                <div className="bg-white border border-dashed border-stone-200 rounded-lg p-12 text-center text-stone-500 text-sm">
                  Sua primeira atividade personalizada aparecerá aqui.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {activities.map((a) => (
                    <button
                      key={a.activity_id}
                      onClick={() => setSelected(a)}
                      data-testid={`activity-card-${a.activity_id}`}
                      className="text-left bg-white border border-stone-200 rounded-lg p-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                    >
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">
                        {a.environment === "clinic" ? "Clínica" : "Home care"} · {a.diagnosis}
                      </div>
                      <div className="font-heading font-medium">{a.title}</div>
                      {a.patient_name && <div className="text-xs text-stone-500 mt-1">Para {a.patient_name}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
