import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("pending");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const sid = params.get("session_id");
    if (!sid) { navigate("/dashboard"); return; }
    let cancelled = false;
    const poll = async (n = 0) => {
      if (cancelled || n >= 8) return;
      try {
        const { data } = await api.get(`/packages/checkout/status/${sid}`);
        setStatus(data.payment_status);
        setAttempts(n);
        if (data.payment_status === "paid") return;
        if (data.status === "expired") { setStatus("expired"); return; }
      } catch {}
      setTimeout(() => poll(n + 1), 2000);
    };
    poll();
    return () => { cancelled = true; };
  }, [loc.search, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6]">
      <div className="bg-white border border-stone-200 rounded-lg p-10 max-w-md text-center">
        {status === "paid" ? (
          <>
            <div className="w-14 h-14 rounded-full bg-[#6B8E7C]/10 text-[#6B8E7C] flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-check text-2xl"></i>
            </div>
            <h1 className="font-heading text-2xl font-medium">Pagamento confirmado!</h1>
            <p className="text-stone-600 text-sm mt-2">O pacote foi ativado com sucesso.</p>
          </>
        ) : status === "expired" ? (
          <>
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
              <i className="fa-solid fa-xmark text-2xl"></i>
            </div>
            <h1 className="font-heading text-2xl font-medium">Sessão expirada</h1>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-stone-200 border-t-[#D46F54] animate-spin mx-auto mb-4"></div>
            <h1 className="font-heading text-xl">Confirmando pagamento…</h1>
            <p className="text-stone-500 text-xs mt-2">Verificação {attempts + 1}/8</p>
          </>
        )}
        <Button onClick={() => navigate("/packages")} variant="outline" className="mt-6" data-testid="back-packages">
          Voltar aos pacotes
        </Button>
      </div>
    </div>
  );
}
