import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle } from "lucide-react";

export default function CheckoutSuccess() {
  const loc = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState("pending");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(loc.search);
    const sid = params.get("session_id");
    if (!sid) {
      navigate("/dashboard");
      return;
    }
    let cancelled = false;
    const poll = async (n = 0) => {
      if (cancelled || n >= 8) return;
      try {
        const { data } = await api.get(`/packages/checkout/status/${sid}`);
        setStatus(data.payment_status);
        setAttempts(n);
        if (data.payment_status === "paid") return;
        if (data.status === "expired") {
          setStatus("expired");
          return;
        }
      } catch {}
      setTimeout(() => poll(n + 1), 2000);
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [loc.search, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] px-4">
      <div className="bg-white border border-stone-200 rounded-3xl p-10 max-w-md w-full text-center shadow-sm">
        {status === "paid" ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={28} />
            </div>
            <h1 className="font-heading text-2xl font-bold text-stone-800">Pagamento confirmado!</h1>
            <p className="text-stone-600 text-sm mt-2">O pacote foi quitado e contabilizado com sucesso.</p>
          </>
        ) : status === "expired" ? (
          <>
            <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <XCircle size={28} />
            </div>
            <h1 className="font-heading text-2xl font-bold text-stone-800">Sessão expirada</h1>
          </>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full border-2 border-stone-200 border-t-[#D46F54] animate-spin mx-auto mb-4" />
            <h1 className="font-heading text-xl font-bold text-stone-800">Confirmando pagamento…</h1>
            <p className="text-stone-500 text-xs mt-2">Verificação {attempts + 1}/8</p>
          </>
        )}
        <Button onClick={() => navigate("/packages")} variant="outline" className="mt-6 rounded-xl font-bold" data-testid="back-packages">
          Voltar para Gestão Financeira
        </Button>
      </div>
    </div>
  );
}