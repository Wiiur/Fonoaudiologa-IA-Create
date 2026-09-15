import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, ShieldCheck, User, Lock, Mail, Activity } from 'lucide-react';
import api from "@/lib/api"; // IMPORTAÇÃO DA API ADICIONADA

export default function TeamSetup() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    cpf: "",
    phone: "",
    password: "",
    confirmPassword: ""
  });

  useEffect(() => {
    if (!token) {
      toast.error("Link inválido ou expirado.");
      navigate("/");
    }
  }, [token, navigate]);

  const handleCompleteSetup = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error("As senhas não conferem!");
    }
    if (formData.password.length < 6) {
      return toast.error("A senha deve ter pelo menos 6 caracteres.");
    }

    setIsLoading(true);
    
    // ENVIANDO PARA O BANCO DE DADOS DE VERDADE
    try {
      await api.post('/team/setup', {
        token: token,
        cpf: formData.cpf,
        phone: formData.phone,
        password: formData.password
      });
      
      toast.success("Conta configurada com sucesso! Faça seu login.");
      navigate("/login"); 
    } catch (error) {
      toast.error(error.response?.data?.detail || "Erro ao ativar conta. Tente novamente.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3E7E4] flex flex-col justify-center items-center p-4">
      
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-stone-200 animate-in slide-in-from-bottom-8 duration-700">
        
        <div className="bg-[#D46F54] p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          <Building2 size={48} className="text-white mx-auto mb-4 relative z-10" />
          <h1 className="text-2xl font-heading font-bold text-white relative z-10">Bem-vindo(a) à Equipe</h1>
          <p className="text-rose-100 text-sm mt-2 relative z-10">Configure seus acessos de segurança para entrar no sistema.</p>
        </div>

        <div className="p-8">
          <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-xs font-medium flex gap-3 mb-6 border border-emerald-100">
            <ShieldCheck size={24} className="shrink-0" />
            <p><strong>Verificação concluída.</strong> Seu convite foi validado. Finalize preenchendo os dados abaixo, eles são obrigatórios por normas de segurança e LGPD.</p>
          </div>

          <form onSubmit={handleCompleteSetup} className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1"><User size={14}/> CPF Pessoal</Label>
              <Input required type="text" placeholder="000.000.000-00" value={formData.cpf} onChange={(e) => setFormData({...formData, cpf: e.target.value})} className="h-12 bg-stone-50" />
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1"><Mail size={14}/> Telefone (WhatsApp)</Label>
              <Input required type="tel" placeholder="(11) 90000-0000" value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="h-12 bg-stone-50" />
            </div>

            <div className="pt-2">
              <Label className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1"><Lock size={14}/> Nova Senha de Acesso</Label>
              <Input required type="password" placeholder="Mínimo 6 caracteres" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="h-12 bg-stone-50" />
            </div>

            <div>
              <Label className="text-xs font-bold text-stone-500 mb-1.5 block">Confirmar Senha</Label>
              <Input required type="password" placeholder="Digite a senha novamente" value={formData.confirmPassword} onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})} className="h-12 bg-stone-50" />
            </div>

            <Button type="submit" disabled={isLoading} className="w-full h-12 bg-stone-900 hover:bg-black text-white font-bold rounded-xl mt-4 text-base transition-transform hover:scale-[1.01]">
              {isLoading ? <Activity className="animate-spin mr-2" size={20} /> : "Ativar Minha Conta"}
            </Button>
          </form>
        </div>
      </div>
      
      <p className="text-stone-400 text-xs mt-6 font-medium">Plataforma Segura • Conformidade LGPD</p>
    </div>
  );
}