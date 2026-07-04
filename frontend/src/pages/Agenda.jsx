import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const startOfWeek = (d) => {
  const x = new Date(d);
  const day = x.getDay(); // 0 sun
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const fmtDay = (d) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
const isoLocal = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function Agenda() {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ patient_id: "", start: "", end: "", mode: "clinic", notes: "" });

  const { data: apts = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => (await api.get("/appointments")).data,
  });
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post("/appointments", form)).data,
    onSuccess: () => {
      toast.success("Sessão agendada");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: () => toast.error("Erro ao agendar"),
  });

  const remove = useMutation({
    mutationFn: async (id) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      toast.success("Sessão removida");
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
  });

  const week = useMemo(() => {
    const s = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(s);
      d.setDate(s.getDate() + i);
      return d;
    });
  }, [anchor]);

  const dayApts = (day) =>
    apts
      .filter((a) => {
        const ad = new Date(a.start);
        return (
          ad.getFullYear() === day.getFullYear() &&
          ad.getMonth() === day.getMonth() &&
          ad.getDate() === day.getDate()
        );
      })
      .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <div className="p-8 md:p-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Gestão</div>
          <h1 className="font-heading text-4xl font-medium tracking-tight mt-2">Agenda</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }}>
            <i className="fa-solid fa-chevron-left"></i>
          </Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>Hoje</Button>
          <Button variant="outline" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }}>
            <i className="fa-solid fa-chevron-right"></i>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-appointment-btn" className="bg-[#D46F54] hover:bg-[#B75C46] text-white">
                <i className="fa-solid fa-plus mr-2"></i> Agendar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="font-heading">Nova sessão</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-xs">Paciente</Label>
                  <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                    <SelectTrigger data-testid="appt-patient-select"><SelectValue placeholder="Selecionar" /></SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.patient_id} value={p.patient_id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Início</Label>
                    <Input data-testid="appt-start-input" type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Fim</Label>
                    <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Modalidade</Label>
                  <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinic">Presencial</SelectItem>
                      <SelectItem value="telehealth">Telehealth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Observações</Label>
                  <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button
                    data-testid="submit-appointment-btn"
                    onClick={() => create.mutate()}
                    disabled={!form.patient_id || !form.start || !form.end || create.isPending}
                    className="bg-[#D46F54] hover:bg-[#B75C46] text-white"
                  >
                    {create.isPending ? "Agendando…" : "Agendar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-3">
        {week.map((d) => {
          const isToday = d.toDateString() === new Date().toDateString();
          return (
            <div key={d.toISOString()} className={`bg-white border rounded-lg p-3 min-h-[220px] ${isToday ? "border-[#D46F54]" : "border-stone-200"}`}>
              <div className={`text-xs font-medium mb-3 uppercase tracking-wider ${isToday ? "text-[#B75C46]" : "text-stone-500"}`}>
                {fmtDay(d)}
              </div>
              <div className="space-y-2">
                {dayApts(d).map((apt) => (
                  <div key={apt.appointment_id} className="bg-[#F3E7E4]/60 border border-[#D46F54]/20 rounded-md p-2 text-xs">
                    <div className="font-mono font-medium">{new Date(apt.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
                    <div className="font-medium truncate mt-0.5">{apt.patient_name}</div>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-stone-500">
                      <span>{apt.mode === "clinic" ? "Presencial" : "Telehealth"}</span>
                      <button onClick={() => remove.mutate(apt.appointment_id)} className="hover:text-red-600" data-testid={`delete-appt-${apt.appointment_id}`}>
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
