import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link2, LogIn } from "lucide-react";

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
    const redirectUrl = `${window.location.origin}/portal/join?token=${token}`;
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const acceptInvite = async () => {
    setBusy(true);
    try {
      await api.post("/patients/link", { token });
      await checkAuth();
      toast.success("Vinculação concluída! Bem-vindo(a) ao Portal.");
      navigate("/portal");
    } catch {
      toast.error("Convite inválido ou já utilizado.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-sm text-stone-500 animate-pulse">Carregando convite…</div>;

  return (
    <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center px-6">
      <div className="bg-white border border-stone-200 rounded-3xl p-10 max-w-md w-full text-center shadow-sm">
        <div className="w-14 h-14 rounded-2xl bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center mx-auto mb-4">
          <Link2 size={24} />
        </div>
        <h1 className="font-heading text-2xl font-bold text-stone-800 tracking-tight">Convite VoxIntelligence</h1>
        <p className="text-stone-600 text-sm mt-3 leading-relaxed">
          Você foi convidado(a) pelo seu fonoaudiólogo(a) para acessar seus treinos vocais e diários no Portal do Paciente.
        </p>
        {user ? (
          <>
            <p className="text-xs text-stone-500 mt-4 bg-stone-50 py-2 px-3 rounded-lg border border-stone-100">
              Autenticado como <b>{user.email}</b>
            </p>
            <Button data-testid="accept-invite-btn" onClick={acceptInvite} disabled={busy} className="mt-6 w-full h-12 rounded-xl font-bold bg-[#D46F54] hover:bg-[#B75C46] text-white">
              {busy ? "Vinculando…" : "Aceitar e Entrar no Portal"}
            </Button>
          </>
        ) : (
          <Button data-testid="portal-join-login-btn" onClick={loginAndJoin} className="mt-6 w-full h-12 rounded-xl font-bold bg-[#D46F54] hover:bg-[#B75C46] text-white">
            <LogIn size={16} className="mr-2" /> Entrar com Google
          </Button>
        )}
      </div>
    </div>
  );
}