import React, { useState } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { 
  LayoutDashboard, Users, CalendarDays, BrainCircuit, FileText, 
  AudioLines, Award, FileSignature, Bot, Package, Settings, 
  LogOut, Menu, X, Activity
} from "lucide-react";

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Inteligência de Permissões: É o dono/doutor ou é equipe?
  const isMaster = user?.role === "doctor" || user?.isOwner;
  const p = user?.permissions || {};

  // Lista dinâmica: Os botões só existem na tela se "show" for true
  const navItems = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", show: true },
    { to: "/patients", icon: Users, label: "Pacientes", show: isMaster || p.agenda },
    { to: "/agenda", icon: CalendarDays, label: "Agenda", show: isMaster || p.agenda },
    { to: "/activities", icon: BrainCircuit, label: "Atividades IA", show: isMaster || p.clinical },
    { to: "/prontuario", icon: FileText, label: "Prontuário SOAP", show: isMaster || p.clinical },
    { to: "/voice-lab", icon: AudioLines, label: "Análise Vocal", show: isMaster || p.clinical },
    { to: "/voice-challenges", icon: Award, label: "Desafios Vocais", show: isMaster || p.clinical },
    { to: "/reports", icon: FileSignature, label: "Relatórios IA", show: isMaster || p.clinical },
    { to: "/copilot", icon: Bot, label: "Copiloto Científico", show: isMaster || p.clinical },
    { to: "/packages", icon: Package, label: "Gestão & Faturamento", show: isMaster || p.financial },
    { to: "/settings", icon: Settings, label: "Configurações", show: isMaster },
  ].filter(item => item.show);

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen flex bg-[#FAF9F6] relative">
      
      {/* ================= HEADER MOBILE ================= */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-stone-200 z-50 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-[#D46F54] flex items-center justify-center text-white">
            <Activity size={18} />
          </div>
          <span className="font-heading font-bold text-stone-800">VoxIntelligence</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-stone-600 hover:text-[#D46F54] transition-colors">
          {isMobileMenuOpen ? <X size={26} /> : <Menu size={26} />}
        </button>
      </div>

      {/* OVERLAY ESCURO (Quando o menu mobile estiver aberto) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-stone-900/60 z-40 lg:hidden backdrop-blur-sm" onClick={closeMenu} />
      )}

      {/* ================= MENU LATERAL FIXO (ASIDE) ================= */}
      <aside className={`fixed top-0 left-0 h-screen w-64 bg-white border-r border-stone-200 flex flex-col z-50 transition-transform duration-300 ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}>
        
        {/* LOGO NO COMPUTADOR */}
        <div className="p-6 border-b border-stone-100 shrink-0 hidden lg:block">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#D46F54] flex items-center justify-center text-white shadow-md shadow-[#D46F54]/20">
              <Activity size={20} />
            </div>
            <div>
              <div className="font-heading font-bold text-sm tracking-tight text-stone-800">VoxIntelligence</div>
              <div className="text-[10px] uppercase tracking-widest text-[#D46F54] font-bold mt-0.5">
                {isMaster ? "Proprietário" : user?.role || "Equipe"}
              </div>
            </div>
          </div>
        </div>

        {/* ESPAÇADOR NO CELULAR (Pra compensar o cabeçalho) */}
        <div className="h-16 lg:hidden shrink-0 border-b border-stone-100 bg-stone-50 flex items-center px-6">
            <div className="text-xs font-bold text-stone-500 uppercase tracking-widest">Menu Principal</div>
        </div>

        {/* BOTÕES DE NAVEGAÇÃO */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all font-semibold ${
                  isActive
                    ? "bg-[#F3E7E4]/70 text-[#B75C46] shadow-sm border border-[#D46F54]/10"
                    : "text-stone-500 hover:text-stone-800 hover:bg-stone-50 border border-transparent"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-[#D46F54]" : "text-stone-400"} />
                  <span className="truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* RODAPÉ DO MENU (Perfil e Logout) */}
        <div className="p-5 border-t border-stone-100 bg-stone-50/50 shrink-0">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-stone-200 border-2 border-white shadow-sm flex items-center justify-center font-bold text-stone-600 uppercase text-lg">
              {user?.name?.[0] || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-stone-800 truncate">{user?.name || "Usuário"}</div>
              <div className="text-[10px] text-stone-500 font-medium truncate mt-0.5">{user?.email || "email@clinica.com"}</div>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 border border-rose-100 hover:border-rose-200 transition-colors shadow-sm"
          >
            <LogOut size={16} /> Encerrar Sessão
          </button>
        </div>
      </aside>

      {/* ================= ÁREA DE CONTEÚDO (Onde as telas abrem) ================= */}
      <main className="flex-1 min-w-0 min-h-screen lg:ml-64 pt-16 lg:pt-0 overflow-x-hidden">
        <Outlet />
      </main>
      
    </div>
  );
}