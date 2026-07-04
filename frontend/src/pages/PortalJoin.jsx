import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function PortalJoin() {
  const loc = useLocation();
  const navigate = useNavigate();
  const { user, loading, checkAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(loc.search).get("token");

  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);

  const loginAndJoin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = `${window.location.origin}/portal/join?token=${token}`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const acceptInvite = async () => {
    setBusy(true);
    try {
      await api.post("/patients/link", { token });
      await checkAuth();
      toast.success("Vinculação concluída!");
      navigate("/portal");
    } catch {
      toast.error("Convite inválido ou já utilizado");
    }
    setBusy(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-stone-500">Carregando…</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-6">
      <div className="bg-white border border-stone-200 rounded-lg p-10 max-w-md text-center">
        <div className="w-14 h-14 rounded-full bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center mx-auto mb-4">
          <i className="fa-solid fa-link text-xl"></i>
        </div>
        <h1 className="font-heading text-2xl font-medium tracking-tight">Convite VoxIntelligence</h1>
        <p className="text-stone-600 text-sm mt-3">
          Você foi convidado(a) por seu fonoaudiólogo(a) para acessar o portal do paciente.
        </p>
        {user ? (
          <>
            <p className="text-xs text-stone-500 mt-4">Autenticado como <b>{user.email}</b></p>
            <Button data-testid="accept-invite-btn" onClick={acceptInvite} disabled={busy} className="mt-6 w-full bg-[#D46F54] hover:bg-[#B75C46] text-white">
              {busy ? "Vinculando…" : "Aceitar e entrar no portal"}
            </Button>
          </>
        ) : (
          <Button data-testid="portal-join-login-btn" onClick={loginAndJoin} className="mt-6 w-full bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <i className="fa-brands fa-google mr-2"></i> Entrar com Google
          </Button>
        )}
      </div>
    </div>
  );
}
