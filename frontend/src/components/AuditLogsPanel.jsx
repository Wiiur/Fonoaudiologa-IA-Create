import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ShieldAlert, Search, Clock, Calendar, UserCheck, Eye,
  FileText, DollarSign, Settings, RefreshCw, LogIn, Filter
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

const CATEGORIAS = ["Todos", "Prontuário", "Financeiro", "Configurações", "Documentos", "Acesso"];

export default function AuditLogsPanel() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit_logs", selectedCategory, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== "Todos") params.append("category", selectedCategory);
      if (search.trim()) params.append("search", search.trim());
      return (await api.get(`/audit-logs?${params.toString()}`)).data;
    },
    refetchInterval: 15000, // Atualiza sozinho a cada 15 segundos
  });

  const getCategoryBadge = (category) => {
    switch (category) {
      case "Prontuário":
        return {
          icon: <Eye size={14} />,
          style: "bg-amber-50 text-amber-800 border-amber-200",
          label: "Ficha / Prontuário"
        };
      case "Financeiro":
        return {
          icon: <DollarSign size={14} />,
          style: "bg-emerald-50 text-emerald-800 border-emerald-200",
          label: "Financeiro"
        };
      case "Configurações":
        return {
          icon: <Settings size={14} />,
          style: "bg-purple-50 text-purple-800 border-purple-200",
          label: "Configurações"
        };
      case "Documentos":
        return {
          icon: <FileText size={14} />,
          style: "bg-blue-50 text-blue-800 border-blue-200",
          label: "Documentos / PDF"
        };
      case "Acesso":
        return {
          icon: <LogIn size={14} />,
          style: "bg-stone-100 text-stone-700 border-stone-200",
          label: "Login / Acesso"
        };
      default:
        return {
          icon: <ShieldAlert size={14} />,
          style: "bg-stone-100 text-stone-700 border-stone-200",
          label: category || "Sistema"
        };
    }
  };

  const todayStr = new Date().toLocaleDateString("pt-BR");
  const logsToday = logs.filter((l) => l.date_br === todayStr).length;
  const patientViews = logs.filter((l) => l.category === "Prontuário").length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in">
      {/* CABEÇALHO EXPLICATIVO E RESUMO */}
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-stone-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-100">
          <div className="flex items-center gap-4">
            <div className="p-3.5 bg-[#D46F54]/10 text-[#D46F54] rounded-2xl border border-[#D46F54]/20">
              <ShieldAlert size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-heading font-bold text-stone-800">
                  Registro de Atividades do Sistema (Logs & Auditoria)
                </h2>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Monitoramento Ativo
                </span>
              </div>
              <p className="text-sm text-stone-500 mt-0.5">
                Acompanhe tudo o que foi feito no sistema, quem executou a ação (Doutor ou Equipe), o dia e o horário exato.
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-xl font-bold border-stone-200 text-stone-700 shrink-0"
          >
            <RefreshCw size={15} className={`mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar Agora
          </Button>
        </div>

        {/* INDICADORES RÁPIDOS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6">
          <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 block">
              Total de Ações Registradas
            </span>
            <span className="text-2xl font-heading font-black text-stone-800 mt-1 block">
              {logs.length}
            </span>
            <span className="text-xs text-stone-500">Últimos eventos auditados</span>
          </div>

          <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 block">
              Acessos a Fichas de Pacientes
            </span>
            <span className="text-2xl font-heading font-black text-amber-900 mt-1 block">
              {patientViews}
            </span>
            <span className="text-xs text-amber-700">Visualizações e edições de prontuário</span>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">
              Atividades Realizadas Hoje ({todayStr})
            </span>
            <span className="text-2xl font-heading font-black text-emerald-900 mt-1 block">
              {logsToday}
            </span>
            <span className="text-xs text-emerald-700">Horário oficial de Brasília</span>
          </div>
        </div>
      </div>

      {/* BARRA DE BUSCA E FILTROS */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por paciente, membro da equipe ou data..."
              className="pl-10 h-11 bg-stone-50 rounded-xl border-stone-200"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 w-full md:w-auto">
            {CATEGORIAS.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                  selectedCategory === cat
                    ? "bg-stone-900 text-white shadow-sm"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* LISTA DE EVENTOS DE FÁCIL LEITURA */}
        {isLoading ? (
          <div className="py-12 text-center text-stone-400 font-bold text-sm animate-pulse">
            Carregando histórico detalhado do sistema...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-stone-500 text-sm">
            Nenhuma atividade encontrada para este filtro.
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {logs.map((log) => {
              const badge = getCategoryBadge(log.category);
              const isDoctor = log.actor_role?.includes("Doutor");

              return (
                <div
                  key={log.id}
                  className="py-4 px-3 hover:bg-stone-50/80 rounded-2xl transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* O QUE FOI FEITO E POR QUEM */}
                  <div className="flex items-start gap-3.5">
                    <div className={`p-2.5 rounded-xl border shrink-0 mt-0.5 ${badge.style}`}>
                      {badge.icon}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-stone-900">
                          {log.actor_name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            isDoctor
                              ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              : "bg-orange-50 text-orange-700 border border-orange-200"
                          }`}
                        >
                          {log.actor_role}
                        </span>
                        <span className="text-xs text-stone-400">({log.actor_email})</span>
                      </div>

                      {/* Frase clara e entendível do que aconteceu */}
                      <p className="text-sm text-stone-700 font-medium leading-relaxed">
                        {log.description}
                      </p>
                    </div>
                  </div>

                  {/* QUE DIA FEZ E QUE HORAS FEZ */}
                  <div className="flex md:flex-col items-center md:items-end justify-between md:justify-center gap-2 shrink-0 bg-stone-100/70 md:bg-transparent px-3 py-2 md:p-0 rounded-xl">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-stone-700">
                      <Calendar size={13} className="text-[#D46F54]" />
                      <span>Dia {log.date_br}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-stone-500">
                      <Clock size={13} className="text-stone-400" />
                      <span>às {log.time_br}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}