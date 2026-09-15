import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Importação das Telas
import Landing from "@/pages/Landing";
import AuthCallback from "@/pages/AuthCallback";
import RoleSelect from "@/pages/RoleSelect";
import Dashboard from "@/pages/Dashboard";
import Patients from "@/pages/Patients";
import PatientDetail from "@/pages/PatientDetail";
import Agenda from "@/pages/Agenda";
import Activities from "@/pages/Activities";
import Prontuario from "@/pages/Prontuario";
import Reports from "@/pages/Reports";
import Copilot from "@/pages/Copilot";
import VoiceLab from "@/pages/VoiceLab";
import VoiceChallenges from "@/pages/VoiceChallenges";
import Packages from "@/pages/Packages";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import PatientPortal from "@/pages/PatientPortal";
import PortalJoin from "@/pages/PortalJoin";
import AppLayout from "@/components/layout/AppLayout";
import SettingsPage from "@/pages/Settings";
import TeamSetup from "@/pages/TeamSetup";
import Login from "@/pages/Login";

// ==============================================================
// 1. O NOVO SISTEMA DE PROTEÇÃO COM INTELIGÊNCIA DE PERMISSÕES 
// ==============================================================
const Protected = ({ children, blockPatients, permissionRequired }) => {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
        <div className="text-stone-500 text-sm animate-pulse font-medium">Autenticando sessão segura...</div>
      </div>
    );
  }

  // Se não tem usuário logado, chuta pra Landing Page
  if (!user) return <Navigate to="/" state={{ from: loc }} replace />;
  if (user.role === "unassigned") return <Navigate to="/onboarding" replace />;

  // Se for um PACIENTE, impede que ele acesse a visão interna da clínica
  if (blockPatients && user.role === "patient") {
    return <Navigate to="/portal" replace />;
  }

  // ===============================================
  // CHECAGEM DE PERMISSÕES DA EQUIPE (LGPD)
  // ===============================================
  const isMaster = user.role === "doctor" || user.isOwner === true;

  // Se não for o Dono/Doutor, nós checamos se ele tem a chavinha ativada
  if (!isMaster && permissionRequired) {
    
    // Se a rota for restrita SOMENTE para o mestre (Ex: Configurações)
    if (permissionRequired === "master") {
      return <Navigate to="/dashboard" replace />;
    }
    
    // Verifica no banco de dados se a secretária/atendente tem aquela permissão
    const hasPermission = user.permissions && user.permissions[permissionRequired];
    
    // Se não tiver permissão, devolve ela suavemente para o Dashboard
    if (!hasPermission) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
};

const AppRouter = () => {
  const location = useLocation();

  if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      {/* ROTAS PÚBLICAS (Sem login) */}
      <Route path="/" element={<Landing />} />
      <Route path="/onboarding" element={<RoleSelect />} />
      <Route path="/portal/join" element={<PortalJoin />} />
      <Route path="/setup-colaborador" element={<TeamSetup />} />
      <Route path="/login" element={<Login />} />

      {/* ========================================== */}
      {/* ROTAS DA CLÍNICA (Onde a mágica acontece)  */}
      {/* ========================================== */}
      <Route element={<Protected blockPatients={true}><AppLayout /></Protected>}>
        
        {/* Dashboard: A tela inicial liberada para todos da equipe verem os cards */}
        <Route path="/dashboard" element={<Dashboard />} />
        
        {/* PERMISSÃO: AGENDA & PACIENTES (Recepção) */}
        <Route path="/agenda" element={<Protected permissionRequired="agenda"><Agenda /></Protected>} />
        <Route path="/patients" element={<Protected permissionRequired="agenda"><Patients /></Protected>} />
        <Route path="/patients/:id" element={<Protected permissionRequired="agenda"><PatientDetail /></Protected>} />

        {/* PERMISSÃO: CLÍNICO (Acesso a Prontuários SOAP, Laudos e Exercícios) */}
        <Route path="/activities" element={<Protected permissionRequired="clinical"><Activities /></Protected>} />
        <Route path="/prontuario" element={<Protected permissionRequired="clinical"><Prontuario /></Protected>} />
        <Route path="/reports" element={<Protected permissionRequired="clinical"><Reports /></Protected>} />
        <Route path="/copilot" element={<Protected permissionRequired="clinical"><Copilot /></Protected>} />
        <Route path="/voice-lab" element={<Protected permissionRequired="clinical"><VoiceLab /></Protected>} />
        <Route path="/voice-challenges" element={<Protected permissionRequired="clinical"><VoiceChallenges /></Protected>} />

        {/* PERMISSÃO: FINANCEIRO (Faturamento e Recibos) */}
        <Route path="/packages" element={<Protected permissionRequired="financial"><Packages /></Protected>} />

        {/* PERMISSÃO: MASTER (Apenas o Dono acessa as configurações) */}
        <Route path="/settings" element={<Protected permissionRequired="master"><SettingsPage /></Protected>} />
      </Route>

      {/* ========================================== */}
      {/* OUTRAS ROTAS ESPECIAIS                     */}
      {/* ========================================== */}
      <Route path="/checkout/success" element={<Protected blockPatients={true}><CheckoutSuccess /></Protected>} />
      
      {/* ROTA EXCLUSIVA DO PACIENTE */}
      <Route path="/portal" element={
        <Protected>
           <PatientPortal />
        </Protected>
      } />
      
      {/* Fallback de Segurança */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;