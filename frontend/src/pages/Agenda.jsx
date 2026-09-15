import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Ícones modernos do Lucide-React
import { 
  CalendarDays, Clock, User, Video, Users, Stethoscope, 
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, 
  Trash2, Plus, AlignLeft, BarChart3, Bell, CheckCircle2, 
  ExternalLink, Ban, Repeat, MapPin, Link2, RefreshCcw
} from 'lucide-react';

import { useNavigate } from "react-router-dom";

const startOfWeek = (d) => {
  const x = new Date(d);
  const day = x.getDay(); 
  const diff = (day + 6) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
};

const timeSlots = [
  "08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"
];

export default function Agenda() { 
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [selectedAppointment, setSelectedAppointment] = useState(null); 
  const [selectedDayInfo, setSelectedDayInfo] = useState(null); 
  const [anchor, setAnchor] = useState(new Date());
  const [open, setOpen] = useState(false);
  
  // O FORMULÁRIO AGORA SUPORTA BLOQUEIOS, SALAS E RECORRÊNCIA
  const [form, setForm] = useState({ 
    patient_id: "", 
    date: new Date().toISOString().split('T')[0],
    time: "09:00", 
    duration: 60,
    type: "paciente", // paciente, reuniao, block
    mode: "clinic", 
    room: "sala_1", // Nova feature: Salas
    recurrence: "none", // Nova feature: none, weekly, biweekly, monthly
    notes: "" 
  });

  const { data: apts = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => (await api.get("/appointments")).data,
  });
  
  const { data: patients = [] } = useQuery({
    queryKey: ["patients"],
    queryFn: async () => (await api.get("/patients")).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      const startDT = new Date(`${form.date}T${form.time}:00`);
      const endDT = new Date(startDT.getTime() + form.duration * 60000);
      
      let title = "Sessão Fono";
      if (form.type === 'reuniao') title = "Reunião de Equipe";
      if (form.type === 'block') title = "Bloqueio de Agenda";

      const payload = {
        patient_id: form.type === 'paciente' ? form.patient_id : null, 
        title: title,
        start: startDT.toISOString(),
        end: endDT.toISOString(),
        mode: form.mode,
        type: form.type,
        room: form.room,
        recurrence: form.recurrence,
        notes: form.notes
      };
      
      return (await api.post("/appointments", payload)).data;
    },
    onSuccess: () => {
      toast.success(form.type === 'block' ? "Horário bloqueado com sucesso!" : "Agendamento criado com sucesso!");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setOpen(false);
      setForm({ ...form, patient_id: "", notes: "", type: "paciente", recurrence: "none" });
    },
    onError: () => toast.error("Erro ao agendar evento."),
  });

  const remove = useMutation({
    mutationFn: async (id) => api.delete(`/appointments/${id}`),
    onSuccess: () => {
      toast.success("Evento removido da agenda");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setSelectedAppointment(null);
    },
  });

  // NOVA FEATURE: Confirmação de Presença
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }) => api.patch(`/appointments/${id}`, { status }),
    onSuccess: () => {
      toast.success("Status atualizado!");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setSelectedAppointment(null);
    }
  });

  const copyPatientLink = () => {
    navigator.clipboard.writeText("https://suaclinica.com/agendar/dr-willian");
    toast.success("Link de agendamento online copiado!");
  };

  const syncGoogle = () => {
    toast("Iniciando sincronização com Google Calendar...", { icon: '🔄' });
    // Aqui entrará a chamada do backend no futuro
  };

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
    <div className="p-4 md:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      
      {/* CABEÇALHO */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-8 gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-sm">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-stone-500 font-bold mb-1 flex items-center gap-2">
            <CalendarIcon size={14} className="text-[#D46F54]"/> Planejamento Inteligente
          </div>
          <h1 className="font-heading text-3xl font-bold text-stone-800">Agenda da Semana</h1>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Botões de Integração */}
          <div className="flex gap-2 mr-auto xl:mr-4">
            <Button variant="outline" onClick={copyPatientLink} className="h-10 text-xs font-bold text-stone-600 border-stone-200 hover:bg-stone-50">
              <Link2 size={16} className="mr-2 text-indigo-500" /> Link Paciente
            </Button>
            <Button variant="outline" onClick={syncGoogle} className="h-10 text-xs font-bold text-stone-600 border-stone-200 hover:bg-stone-50">
              <RefreshCcw size={16} className="mr-2 text-emerald-500" /> Sincronizar Google
            </Button>
          </div>

          <div className="flex bg-stone-100 rounded-lg p-1">
            <Button variant="ghost" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() - 7); setAnchor(d); }} className="px-2 hover:bg-white hover:shadow-sm h-8 text-stone-500 hover:text-stone-800">
              <ChevronLeft size={18} />
            </Button>
            <Button variant="ghost" onClick={() => setAnchor(new Date())} className="h-8 px-4 text-xs font-bold text-stone-600 hover:bg-white hover:text-stone-900 hover:shadow-sm">
              Hoje
            </Button>
            <Button variant="ghost" onClick={() => { const d = new Date(anchor); d.setDate(d.getDate() + 7); setAnchor(d); }} className="px-2 hover:bg-white hover:shadow-sm h-8 text-stone-500 hover:text-stone-800">
              <ChevronRight size={18} />
            </Button>
          </div>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#D46F54] hover:bg-[#B75C46] text-white shadow-sm flex-1 sm:flex-none h-10">
                <Plus size={18} className="mr-2" /> Agendar
              </Button>
            </DialogTrigger>
            
            {/* MODAL DE AGENDAMENTO PREMIUM */}
            <DialogContent className="max-w-3xl p-0 overflow-hidden bg-stone-50 rounded-2xl border-stone-200">
              <DialogHeader className="bg-white p-6 border-b border-stone-200">
                <DialogTitle className="font-heading text-2xl text-stone-800 flex items-center gap-2">
                  <CalendarDays className="text-[#D46F54]" /> Novo Agendamento
                </DialogTitle>
              </DialogHeader>
              
              <div className="p-6">
                {/* 1. Escolha o Tipo de Evento */}
                <div className="mb-6">
                  <Label className="text-xs font-bold text-stone-500 mb-2 block uppercase tracking-wider">Tipo de Ação</Label>
                  <div className="flex flex-wrap md:flex-nowrap gap-2 bg-stone-200/50 p-1 rounded-xl">
                    <button onClick={() => setForm({...form, type: 'paciente'})} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 text-sm font-bold rounded-lg transition-all ${form.type === 'paciente' ? 'bg-white text-emerald-600 shadow-sm border border-emerald-100' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/80'}`}>
                      <Stethoscope size={16}/> Paciente
                    </button>
                    <button onClick={() => setForm({...form, type: 'reuniao'})} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 text-sm font-bold rounded-lg transition-all ${form.type === 'reuniao' ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/80'}`}>
                      <Users size={16}/> Reunião
                    </button>
                    <button onClick={() => setForm({...form, type: 'block'})} className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-2 text-sm font-bold rounded-lg transition-all ${form.type === 'block' ? 'bg-white text-rose-600 shadow-sm border border-rose-100' : 'text-stone-500 hover:text-stone-700 hover:bg-stone-200/80'}`}>
                      <Ban size={16}/> Bloqueio de Sala/Horário
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Coluna 1: Dados Principais */}
                  <div className="space-y-4">
                    {form.type === 'paciente' && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Paciente</Label>
                        <Select value={form.patient_id} onValueChange={(v) => setForm({ ...form, patient_id: v })}>
                          <SelectTrigger className="bg-white border-stone-200 h-11"><SelectValue placeholder="Selecione o paciente" /></SelectTrigger>
                          <SelectContent>
                            {patients.map((p) => (
                              <SelectItem key={p.patient_id} value={p.patient_id} className="font-medium">{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Data</Label>
                        <input 
                          type="date" 
                          value={form.date} 
                          onChange={(e) => setForm({...form, date: e.target.value})}
                          className="w-full h-11 px-3 rounded-md border border-stone-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#D46F54]/20 focus:border-[#D46F54]"
                        />
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Recorrência</Label>
                        <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                          <SelectTrigger className="bg-white border-stone-200 h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Não repete</SelectItem>
                            <SelectItem value="weekly">Toda Semana</SelectItem>
                            <SelectItem value="biweekly">Quinzenal</SelectItem>
                            <SelectItem value="monthly">Mensal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Formato</Label>
                        <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })}>
                          <SelectTrigger className="bg-white border-stone-200 h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="clinic"><span className="flex items-center gap-2"><User size={14}/> Presencial</span></SelectItem>
                            <SelectItem value="telehealth"><span className="flex items-center gap-2 text-indigo-600"><Video size={14}/> Online</span></SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-stone-600 mb-1 block">Sala / Local</Label>
                        <Select value={form.room} onValueChange={(v) => setForm({ ...form, room: v })}>
                          <SelectTrigger className="bg-white border-stone-200 h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sala_1">Sala 1 (Voz)</SelectItem>
                            <SelectItem value="sala_2">Sala 2 (Infantil)</SelectItem>
                            <SelectItem value="online">Link Online</SelectItem>
                            <SelectItem value="externo">Externo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div>
                      <Label className="text-xs font-bold text-stone-600 mb-1 block flex items-center gap-2"><AlignLeft size={14}/> {form.type === 'block' ? 'Motivo do Bloqueio' : 'Observações'}</Label>
                      <Textarea 
                        rows={2} 
                        placeholder={form.type === 'block' ? "Ex: Manutenção da sala, Feriado..." : "Ex: Primeira avaliação..."}
                        value={form.notes} 
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} 
                        className="bg-white border-stone-200 resize-none"
                      />
                    </div>
                  </div>

                  {/* Coluna 2: Horários (Quick Select) */}
                  <div className="bg-white p-4 rounded-xl border border-stone-200 h-fit">
                    <Label className="text-xs font-bold text-stone-500 mb-3 block flex items-center gap-2 uppercase tracking-wider"><Clock size={14}/> Horário de Início</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map(time => (
                        <button
                          key={time}
                          onClick={() => setForm({...form, time: time})}
                          className={`py-2 rounded-lg text-sm font-bold transition-all border ${
                            form.time === time
                              ? 'border-[#D46F54] bg-[#D46F54] text-white shadow-sm'
                              : 'border-stone-100 bg-stone-50 text-stone-500 hover:border-stone-300'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
                       <Label className="text-xs font-bold text-stone-600">Duração prevista:</Label>
                       <Select value={form.duration.toString()} onValueChange={(v) => setForm({ ...form, duration: parseInt(v) })}>
                          <SelectTrigger className="w-32 bg-stone-50 border-stone-200 h-8 text-xs font-bold"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30 minutos</SelectItem>
                            <SelectItem value="45">45 minutos</SelectItem>
                            <SelectItem value="60">1 hora</SelectItem>
                            <SelectItem value="90">1h 30m</SelectItem>
                            <SelectItem value="120">2 horas (Bloqueio)</SelectItem>
                          </SelectContent>
                        </Select>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-stone-200">
                  <Button variant="outline" onClick={() => setOpen(false)} className="border-stone-300 text-stone-600 font-bold hover:bg-stone-100">Cancelar</Button>
                  <Button
                    onClick={() => create.mutate()}
                    disabled={create.isPending || (form.type === 'paciente' && !form.patient_id)}
                    className="bg-stone-900 hover:bg-black text-white font-bold min-w-[140px]"
                  >
                    {create.isPending ? "Salvando..." : (form.type === 'block' ? "Bloquear Agenda" : "Confirmar Agendamento")}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* GRID DA AGENDA */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 sm:gap-4">
        {week.map((d) => {
          const isToday = d.toDateString() === new Date().toDateString();
          const dayAppointments = dayApts(d);
          
          const maxVisible = 4;
          const visibleApts = dayAppointments.slice(0, maxVisible);
          const hiddenCount = dayAppointments.length - maxVisible;
          
          return (
            <div key={d.toISOString()} className={`bg-white rounded-2xl flex flex-col h-[380px] shadow-sm transition-all border overflow-hidden ${isToday ? "border-[#D46F54] ring-1 ring-[#D46F54]/20" : "border-stone-200 hover:border-stone-300"}`}>
              
              <div 
                onClick={() => setSelectedDayInfo(d)}
                className={`p-3 text-center border-b border-stone-100 cursor-pointer transition-colors ${isToday ? "bg-[#F3E7E4]/40 hover:bg-[#F3E7E4]/70" : "bg-stone-50 hover:bg-stone-100"}`}
                title="Clique para ver o dia completo"
              >
                <div className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${isToday ? "text-[#D46F54]" : "text-stone-400"}`}>
                  {d.toLocaleDateString("pt-BR", { weekday: "short" }).replace('.', '')}
                </div>
                <div className={`text-2xl font-heading font-bold ${isToday ? "text-[#B75C46]" : "text-stone-700"}`}>
                  {d.getDate().toString().padStart(2, '0')}
                </div>
              </div>

              <div className="p-2 space-y-1.5 flex-1 overflow-hidden">
                {dayAppointments.length === 0 ? (
                  <div className="text-center mt-8">
                    <CalendarIcon className="mx-auto text-stone-200 mb-2 opacity-30" size={20}/>
                    <p className="text-[9px] font-bold text-stone-400 uppercase tracking-wider">Livre</p>
                  </div>
                ) : (
                  <>
                    {visibleApts.map((apt) => {
                      const isMeeting = apt.type === 'reuniao';
                      const isBlock = apt.type === 'block';
                      
                      let bgClass = 'bg-white border-stone-200';
                      let barClass = 'bg-emerald-500';
                      let timeClass = 'bg-stone-100 text-stone-600';
                      
                      if (isMeeting) {
                        bgClass = 'bg-indigo-50 border-indigo-100';
                        barClass = 'bg-indigo-500';
                        timeClass = 'bg-indigo-100 text-indigo-700';
                      } else if (isBlock) {
                        bgClass = 'bg-rose-50 border-rose-100 opacity-80';
                        barClass = 'bg-rose-500';
                        timeClass = 'bg-rose-100 text-rose-700 line-through decoration-rose-300';
                      } else if (apt.status === 'confirmed') {
                        barClass = 'bg-emerald-400';
                        bgClass = 'bg-emerald-50/30 border-emerald-100';
                      }

                      return (
                        <div key={apt.appointment_id} 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setSelectedAppointment(apt); 
                              }} 
                              className={`relative rounded-lg p-1.5 border shadow-sm cursor-pointer hover:-translate-y-0.5 transition-transform ${bgClass}`}
                          >
                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${barClass}`}></div>
                          <div className="pl-2 flex items-center gap-1.5 overflow-hidden">
                            <span className={`font-mono text-[9px] font-bold px-1 rounded flex items-center gap-1 ${timeClass}`}>
                              {apt.status === 'confirmed' && <CheckCircle2 size={8} className="text-emerald-500"/>}
                              {new Date(apt.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                            <span className={`font-bold text-[10px] text-stone-700 truncate ${isBlock && 'text-rose-700 italic'}`}>
                              {isMeeting || isBlock ? (apt.title) : (apt.patient_name || "Sessão")}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                    
                    {hiddenCount > 0 && (
                      <button 
                        onClick={() => setSelectedDayInfo(d)}
                        className="w-full py-1 mt-1 text-[10px] font-bold text-stone-500 hover:text-[#D46F54] hover:bg-[#F3E7E4]/50 rounded border border-transparent hover:border-[#D46F54]/20 transition-all"
                      >
                        + {hiddenCount} itens
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE VISÃO DETALHADA DO DIA (Mantido, com suporte a blocos) */}
      <Dialog open={!!selectedDayInfo} onOpenChange={(isOpen) => !isOpen && setSelectedDayInfo(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden bg-stone-50 rounded-2xl">
          <DialogHeader className="bg-white p-5 border-b border-stone-200">
            <DialogTitle className="font-heading text-xl text-stone-800 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <CalendarDays className="text-[#D46F54]" /> Agenda do Dia
              </span>
              {selectedDayInfo && (
                <span className="text-sm font-bold text-stone-500 bg-stone-100 px-3 py-1 rounded-full">
                  {selectedDayInfo.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-3">
            {selectedDayInfo && dayApts(selectedDayInfo).length === 0 ? (
              <p className="text-center text-stone-400 font-bold text-sm py-10">Livre.</p>
            ) : (
              selectedDayInfo && dayApts(selectedDayInfo).map((apt) => {
                const isMeeting = apt.type === 'reuniao';
                const isBlock = apt.type === 'block';
                const isOnline = apt.mode === 'telehealth';
                
                return (
                  <div key={apt.appointment_id} className={`relative rounded-xl p-4 border shadow-sm ${isMeeting ? 'bg-indigo-50 border-indigo-100' : isBlock ? 'bg-rose-50 border-rose-100' : 'bg-white border-stone-200'}`}>
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl ${isMeeting ? 'bg-indigo-500' : isBlock ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                    
                    <div className="flex justify-between items-start pl-2">
                      <div>
                        <div className={`font-mono text-xs font-bold px-2 py-1 rounded inline-flex items-center gap-1.5 mb-2 ${isMeeting ? 'bg-indigo-100 text-indigo-700' : isBlock ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          <Clock size={12} /> {new Date(apt.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <h4 className="font-bold text-base text-stone-800">
                          {isMeeting || isBlock ? (apt.title) : (apt.patient_name || "Sessão")}
                        </h4>
                        
                        <div className="flex items-center gap-2 mt-3">
                          {isOnline ? (
                             <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-white border border-indigo-100 px-2 py-1 rounded-md shadow-sm">
                               <Video size={12}/> Online
                             </span>
                          ) : (
                             <span className="flex items-center gap-1 text-[11px] font-bold text-stone-500 bg-stone-100 px-2 py-1 rounded-md">
                               <MapPin size={12}/> {apt.room === 'sala_2' ? 'Sala 2' : 'Sala 1'}
                             </span>
                          )}
                        </div>
                      </div>
                      
                      <button onClick={() => remove.mutate(apt.appointment_id)} className="text-stone-300 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-lg">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: MINI FICHA DO AGENDAMENTO (Com botões de presença) */}
      <Dialog open={!!selectedAppointment} onOpenChange={(isOpen) => !isOpen && setSelectedAppointment(null)}>
        <DialogContent className="max-w-sm p-0 overflow-hidden bg-white rounded-2xl border-stone-200">
          {selectedAppointment && (
            <>
              {/* Cabeçalho dinâmico */}
              <div className={`p-6 text-white ${selectedAppointment.type === 'reuniao' ? 'bg-indigo-600' : selectedAppointment.type === 'block' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-2 opacity-90">
                  {selectedAppointment.type === 'reuniao' ? <Users size={14}/> : selectedAppointment.type === 'block' ? <Ban size={14}/> : <Stethoscope size={14}/>}
                  {selectedAppointment.type === 'reuniao' ? 'Reunião' : selectedAppointment.type === 'block' ? 'Bloqueio' : 'Sessão Clínica'}
                </div>
                <h3 className="font-heading text-2xl font-bold leading-tight">
                  {selectedAppointment.type === 'reuniao' || selectedAppointment.type === 'block' ? (selectedAppointment.title) : (selectedAppointment.patient_name || "Paciente")}
                </h3>
              </div>

              <div className="p-6 space-y-5">
                <div className="flex items-center gap-4 bg-stone-50 p-3 rounded-xl border border-stone-100">
                  <div className={`p-3 rounded-lg ${selectedAppointment.type === 'reuniao' ? 'bg-indigo-100 text-indigo-600' : selectedAppointment.type === 'block' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    <CalendarDays size={20} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-stone-500 uppercase tracking-wider">Data e Horário</p>
                    <p className="text-sm font-bold text-stone-800">
                      {new Date(selectedAppointment.start).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })} às {new Date(selectedAppointment.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div>
                     <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Local / Sala</p>
                     <div className="flex items-center gap-1.5 text-sm font-bold text-stone-700">
                       {selectedAppointment.mode === 'telehealth' ? <><Video size={16} className="text-indigo-500"/> Online</> : <><MapPin size={16} className="text-stone-400"/> {selectedAppointment.room === 'sala_2' ? 'Sala 2' : 'Sala 1'}</>}
                     </div>
                   </div>
                   {selectedAppointment.recurrence && selectedAppointment.recurrence !== 'none' && (
                     <div>
                       <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Repetição</p>
                       <div className="flex items-center gap-1.5 text-sm font-bold text-indigo-600">
                         <Repeat size={14}/> {selectedAppointment.recurrence === 'weekly' ? 'Semanal' : selectedAppointment.recurrence === 'monthly' ? 'Mensal' : 'Quinzenal'}
                       </div>
                     </div>
                   )}
                </div>

                {selectedAppointment.notes && (
                  <div className="pt-4 border-t border-stone-100">
                    <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <AlignLeft size={14}/> Notas
                    </p>
                    <div className="bg-amber-50/50 border border-amber-100/50 rounded-xl p-3 text-sm text-stone-700 italic">
                      "{selectedAppointment.notes}"
                    </div>
                  </div>
                )}

                {/* BOTÕES DE AÇÃO DO AGENDAMENTO */}
                <div className="pt-6 mt-4 border-t border-stone-100 space-y-2">
                  {selectedAppointment.type === 'paciente' && selectedAppointment.status !== 'confirmed' && (
                    <Button 
                      onClick={() => updateStatus.mutate({ id: selectedAppointment.appointment_id, status: 'confirmed' })}
                      disabled={updateStatus.isPending}
                      className="w-full h-11 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold rounded-xl flex items-center justify-center gap-2 shadow-none transition-all"
                    >
                      <CheckCircle2 size={18} /> Confirmar Presença
                    </Button>
                  )}
                  
                  {selectedAppointment.patient_id && (
                    <Button 
                      onClick={() => navigate(`/patients/${selectedAppointment.patient_id}`)}
                      className="w-full h-11 bg-stone-900 hover:bg-black text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      Acessar Prontuário <ExternalLink size={18} />
                    </Button>
                  )}
                  
                  <Button 
                    onClick={() => {
                      if(window.confirm("Tem certeza que deseja cancelar este evento?")) {
                        remove.mutate(selectedAppointment.appointment_id);
                      }
                    }}
                    variant="ghost"
                    className="w-full h-11 text-stone-400 hover:text-rose-600 hover:bg-rose-50 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
                  >
                    <Trash2 size={16} /> Cancelar Evento
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* PAINEL INFERIOR: INSIGHTS E LEMBRETES */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-6 border-b border-stone-100 pb-4">
            <BarChart3 className="text-[#D46F54]" size={20} />
            <h2 className="text-lg font-heading font-bold text-stone-800">Resumo desta Semana</h2>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
              <div className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1">Total (Saúde)</div>
              <div className="text-3xl font-heading font-bold text-stone-800">
                {week.flatMap(d => dayApts(d)).filter(a => a.type === 'paciente').length}
              </div>
            </div>
            
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Presencial</div>
              <div className="text-3xl font-heading font-bold text-emerald-700">
                {week.flatMap(d => dayApts(d)).filter(a => a.type === 'paciente' && a.mode === 'clinic').length}
              </div>
            </div>
            
            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <div className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">Telehealth</div>
              <div className="text-3xl font-heading font-bold text-indigo-700">
                {week.flatMap(d => dayApts(d)).filter(a => a.type === 'paciente' && a.mode === 'telehealth').length}
              </div>
            </div>
            
            <div className="bg-[#F3E7E4]/50 rounded-xl p-4 border border-[#D46F54]/20">
              <div className="text-xs font-bold text-[#B75C46] uppercase tracking-wider mb-1">Bloqueios</div>
              <div className="text-3xl font-heading font-bold text-[#D46F54]">
                {week.flatMap(d => dayApts(d)).filter(a => a.type === 'block').length}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-stone-200 shadow-sm">
          <div className="flex items-center justify-between mb-6 border-b border-stone-100 pb-4">
            <div className="flex items-center gap-2">
              <Bell className="text-amber-500" size={20} />
              <h2 className="text-lg font-heading font-bold text-stone-800">Avisos do Sistema</h2>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-xl border border-amber-100">
              <div className="bg-amber-100 p-1.5 rounded-lg text-amber-600 mt-0.5"><Link2 size={14}/></div>
              <div>
                <h4 className="text-sm font-bold text-amber-800">Agendamento Online Ativo</h4>
                <p className="text-xs text-amber-700/80 mt-1">Os pacientes podem marcar horários usando o link no cabeçalho.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 bg-stone-50 rounded-xl border border-stone-100">
              <div className="bg-stone-200 p-1.5 rounded-lg text-stone-600 mt-0.5"><RefreshCcw size={14}/></div>
              <div>
                <h4 className="text-sm font-bold text-stone-800">Google Calendar</h4>
                <p className="text-xs text-stone-500 mt-1">Lembre-se de sincronizar sua agenda caso faça marcações pelo celular.</p>
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}