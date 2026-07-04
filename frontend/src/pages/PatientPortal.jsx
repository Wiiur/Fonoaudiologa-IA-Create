import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import MarkdownView from "@/components/MarkdownView";

export default function PatientPortal() {
  const { user, logout } = useAuth();
  const [selectedAct, setSelectedAct] = useState(null);

  const { data: apts = [] } = useQuery({
    queryKey: ["p-appts"],
    queryFn: async () => (await api.get("/appointments")).data,
  });
  const { data: activities = [] } = useQuery({
    queryKey: ["p-acts"],
    queryFn: async () => (await api.get("/activities")).data,
  });

  const upcoming = apts.filter((a) => new Date(a.start) >= new Date()).slice(0, 5);

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      <header className="bg-white border-b border-stone-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#D46F54] flex items-center justify-center text-white">
              <i className="fa-solid fa-waveform-lines text-sm"></i>
            </div>
            <div>
              <div className="font-heading font-semibold text-sm">VoxIntelligence · Portal</div>
              <div className="text-[10px] uppercase tracking-widest text-stone-500">Paciente</div>
            </div>
          </div>
          <Button variant="ghost" onClick={logout} data-testid="portal-logout">
            <i className="fa-solid fa-arrow-right-from-bracket mr-2"></i> Sair
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="font-heading text-4xl font-medium tracking-tight">Olá, {user?.name?.split(" ")[0]}</h1>
        <p className="text-stone-500 text-sm mt-2">Acompanhe suas sessões e atividades.</p>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Próximas sessões</div>
          {upcoming.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-200 rounded-lg p-8 text-center text-sm text-stone-500">
              Nenhuma sessão agendada.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {upcoming.map((a) => (
                <div key={a.appointment_id} className="bg-white border border-stone-200 rounded-lg p-5">
                  <div className="text-xs text-stone-500 uppercase tracking-wider">
                    {new Date(a.start).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
                  </div>
                  <div className="font-heading text-xl mt-1">
                    {new Date(a.start).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="text-xs text-[#B75C46] mt-2 font-medium">{a.mode === "clinic" ? "Presencial" : "Telehealth"}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Atividades de home care</div>
          {activities.length === 0 ? (
            <div className="bg-white border border-dashed border-stone-200 rounded-lg p-8 text-center text-sm text-stone-500">
              Ainda sem atividades atribuídas.
            </div>
          ) : selectedAct ? (
            <div className="bg-white border border-stone-200 rounded-lg p-8">
              <Button variant="outline" onClick={() => setSelectedAct(null)} className="mb-4">
                <i className="fa-solid fa-arrow-left mr-2"></i> Voltar
              </Button>
              <MarkdownView content={selectedAct.content} />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activities.map((a) => (
                <button
                  key={a.activity_id}
                  onClick={() => setSelectedAct(a)}
                  className="text-left bg-white border border-stone-200 rounded-lg p-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
                >
                  <div className="text-[10px] uppercase tracking-widest text-stone-500">{a.diagnosis}</div>
                  <div className="font-heading font-medium mt-1">{a.title}</div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
