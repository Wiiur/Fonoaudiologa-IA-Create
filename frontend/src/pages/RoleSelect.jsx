import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import api from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLES = [
  { id: "doctor", icon: "fa-user-doctor", title: "Sou Fonoaudiólogo(a)", desc: "Acesso completo — requer validação CRFa." },
  { id: "secretary", icon: "fa-headset", title: "Sou Secretária(o)", desc: "Foco em agenda e cadastro de pacientes." },
];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

export default function RoleSelect() {
  const { user, checkAuth, loading } = useAuth();
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [crfa, setCrfa] = useState({ crfa_number: "", crfa_state: "", professional_name: "" });
  const navigate = useNavigate();

  if (loading) return null;
  if (!user) { navigate("/"); return null; }

  const confirm = async () => {
    if (!selected) return;
    if (selected === "doctor") {
      if (!crfa.professional_name || !crfa.crfa_number || !crfa.crfa_state) {
        toast.error("Preencha todos os dados do CRFa");
        return;
      }
    }
    setBusy(true);
    try {
      await api.post("/auth/role", { role: selected, ...(selected === "doctor" ? crfa : {}) });
      await checkAuth();
      toast.success("Perfil configurado");
      navigate("/dashboard");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Falha ao definir perfil");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-10">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Bem-vindo(a), {user.name?.split(" ")[0]}</div>
          <h1 className="font-heading text-3xl sm:text-4xl font-medium tracking-tight mt-3">Como você vai usar o VoxIntelligence?</h1>
          <p className="text-stone-600 mt-3 text-sm">Pacientes acessam somente via <b>convite do doutor</b>.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ROLES.map((r) => (
            <button key={r.id} data-testid={`role-${r.id}`} onClick={() => setSelected(r.id)}
              className={`text-left bg-white border rounded-lg p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${selected === r.id ? "border-[#D46F54] ring-2 ring-[#D46F54]/20" : "border-stone-200"}`}>
              <div className="w-10 h-10 rounded-md bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center mb-4">
                <i className={`fa-solid ${r.icon}`}></i>
              </div>
              <div className="font-heading font-semibold">{r.title}</div>
              <div className="text-xs text-stone-600 mt-2">{r.desc}</div>
            </button>
          ))}
        </div>

        {selected === "doctor" && (
          <div className="mt-8 bg-white border border-stone-200 rounded-lg p-6">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-bold mb-4">Validação profissional CRFa</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <Label className="text-xs">Nome profissional completo</Label>
                <Input data-testid="crfa-name-input" placeholder="Ex.: Dra. Maria Silva" value={crfa.professional_name} onChange={(e) => setCrfa({ ...crfa, professional_name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Número CRFa</Label>
                <Input data-testid="crfa-number-input" placeholder="Ex.: 12345" value={crfa.crfa_number} onChange={(e) => setCrfa({ ...crfa, crfa_number: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">UF</Label>
                <Select value={crfa.crfa_state} onValueChange={(v) => setCrfa({ ...crfa, crfa_state: v })}>
                  <SelectTrigger data-testid="crfa-state-select"><SelectValue placeholder="UF" /></SelectTrigger>
                  <SelectContent>{UFS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[10px] text-stone-500 mt-3">Ao confirmar, você declara sob as penas da lei que os dados profissionais são verdadeiros e passíveis de verificação.</p>
          </div>
        )}

        <div className="mt-10 flex justify-center">
          <button data-testid="confirm-role-btn" disabled={!selected || busy} onClick={confirm}
            className="bg-[#D46F54] hover:bg-[#B75C46] disabled:opacity-40 text-white rounded-md px-8 py-2.5 text-sm font-medium transition-colors">
            {busy ? "Configurando…" : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
