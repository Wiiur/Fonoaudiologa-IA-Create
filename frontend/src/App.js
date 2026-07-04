import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
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
import Packages from "@/pages/Packages";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import PatientPortal from "@/pages/PatientPortal";
import PortalJoin from "@/pages/PortalJoin";
import AppLayout from "@/components/layout/AppLayout";

const Protected = ({ children, roles }) => {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-stone-500 text-sm">Carregando…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" state={{ from: loc }} replace />;
  if (user.role === "unassigned") return <Navigate to="/onboarding" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return children;
};

const homeFor = (role) => {
  if (role === "patient") return "/portal";
  return "/dashboard";
};

const AppRouter = () => {
  const location = useLocation();
  // CRITICAL: Detect session_id synchronously to prevent race conditions
  if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/onboarding" element={<RoleSelect />} />
      <Route path="/portal/join" element={<PortalJoin />} />

      <Route
        element={
          <Protected roles={["doctor", "secretary"]}>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patients" element={<Patients />} />
        <Route path="/patients/:id" element={<PatientDetail />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/activities" element={<Activities />} />
        <Route path="/prontuario" element={<Prontuario />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/copilot" element={<Copilot />} />
        <Route path="/packages" element={<Packages />} />
      </Route>

      <Route
        path="/checkout/success"
        element={
          <Protected roles={["doctor"]}>
            <CheckoutSuccess />
          </Protected>
        }
      />

      <Route
        path="/portal"
        element={
          <Protected roles={["patient"]}>
            <PatientPortal />
          </Protected>
        }
      />

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
