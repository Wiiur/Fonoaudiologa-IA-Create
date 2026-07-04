import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const run = async () => {
      const hash = window.location.hash || "";
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const session_id = params.get("session_id");
      if (!session_id) {
        navigate("/", { replace: true });
        return;
      }
      try {
        const { data } = await api.post("/auth/session", { session_id });
        setUser(data.user);
        window.history.replaceState({}, "", "/");
        if (data.user.role === "unassigned") {
          navigate("/onboarding", { replace: true, state: { user: data.user } });
        } else if (data.user.role === "patient") {
          navigate("/portal", { replace: true, state: { user: data.user } });
        } else {
          navigate("/dashboard", { replace: true, state: { user: data.user } });
        }
      } catch (e) {
        console.error("auth callback failed", e);
        navigate("/", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full border-2 border-stone-200 border-t-[#D46F54] animate-spin mx-auto mb-4" />
        <div className="text-sm text-stone-500">Estabelecendo sessão segura…</div>
      </div>
    </div>
  );
}
