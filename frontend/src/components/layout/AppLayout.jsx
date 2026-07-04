import React from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const NAV_DOCTOR = [
  { to: "/dashboard", icon: "fa-gauge", label: "Dashboard" },
  { to: "/patients", icon: "fa-users", label: "Pacientes" },
  { to: "/agenda", icon: "fa-calendar-days", label: "Agenda" },
  { to: "/activities", icon: "fa-brain", label: "Atividades IA" },
  { to: "/prontuario", icon: "fa-notes-medical", label: "Prontuário" },
  { to: "/reports", icon: "fa-file-signature", label: "Relatórios" },
  { to: "/copilot", icon: "fa-microscope", label: "Copiloto" },
  { to: "/packages", icon: "fa-box-open", label: "Pacotes" },
];

const NAV_SECRETARY = [
  { to: "/dashboard", icon: "fa-gauge", label: "Dashboard" },
  { to: "/patients", icon: "fa-users", label: "Pacientes" },
  { to: "/agenda", icon: "fa-calendar-days", label: "Agenda" },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = user?.role === "doctor" ? NAV_DOCTOR : NAV_SECRETARY;

  return (
    <div className="min-h-screen flex bg-[#FAF9F6]">
      <aside className="w-64 shrink-0 bg-white border-r border-stone-200 flex flex-col">
        <div className="p-5 border-b border-stone-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#D46F54] flex items-center justify-center text-white">
              <i className="fa-solid fa-waveform-lines text-sm"></i>
            </div>
            <div>
              <div className="font-heading font-semibold text-sm tracking-tight">VoxIntelligence</div>
              <div className="text-[10px] uppercase tracking-widest text-stone-500">
                {user?.role === "doctor" ? "Fonoaudiólogo" : "Secretaria"}
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-[#F3E7E4] text-[#B75C46] font-medium"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-50"
                }`
              }
            >
              <i className={`fa-solid ${item.icon} w-4 text-center`}></i>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-stone-200">
          <div className="flex items-center gap-3 px-3 py-2">
            {user?.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-stone-200 flex items-center justify-center text-xs">
                {user?.name?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate">{user?.name}</div>
              <div className="text-[10px] text-stone-500 truncate">{user?.email}</div>
            </div>
            <button
              data-testid="logout-btn"
              onClick={logout}
              className="text-stone-400 hover:text-stone-700"
              title="Sair"
            >
              <i className="fa-solid fa-arrow-right-from-bracket text-sm"></i>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <Outlet />
      </main>
    </div>
  );
}
