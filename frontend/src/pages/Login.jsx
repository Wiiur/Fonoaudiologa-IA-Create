import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Building2, Mail, Lock, Activity, ShieldAlert, Sparkles, Terminal, ArrowLeft } from 'lucide-react';
import api from "@/lib/api"; // IMPORTAÇÃO DA API AQUI!
import { useAuth } from "@/context/AuthContext";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" className="mr-2">
    <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
      <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
      <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
      <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
      <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
    </g>
  </svg>
);

export default function Login() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const { setUser } = useAuth();

  const handleGoogleLogin = () => {
    setIsGoogleLoading(true);
    toast.info("Conectando ao provedor de segurança...");
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  // LOGIN DA EQUIPE CONECTADO AO BANCO DE DADOS
  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Faz a verificação real na API
      const response = await api.post('/team/login', {
        email: formData.email,
        password: formData.password
      });

      setUser(response.data.user);
      
      // Se passar direto pelo try, o login deu certo!
      toast.success(`Bem-vindo(a), ${response.data.user.name}!`);
      
      // Redireciona para o sistema
      navigate("/dashboard"); 

    } catch (error) {
      // Se a senha estiver errada, a API vai mandar o erro aqui
      toast.error("Acesso Negado", { 
        description: error.response?.data?.detail || "Verifique suas credenciais." 
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterClick = () => {
    toast.error("O sistema encontra-se em fase Beta Fechado.", {
      description: "No momento, novas contas de clínicas são criadas apenas mediante convite e liberação interna da administração."
    });
  };

  const handleSecretDevAccess = () => {
    const password = window.prompt("ACESSO RESTRITO - MODO DESENVOLVEDOR\n\nInsira a chave de autorização:");
    if (password === "dev123") {
      toast.success("Acesso de Desenvolvedor Concedido!", { icon: <Terminal size={18} className="text-emerald-500"/> });
      navigate("/dashboard"); 
    } else if (password !== null) {
      toast.error("Chave incorreta. Acesso negado.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F3E7E4] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl overflow-hidden border border-stone-200 animate-in zoom-in-95 duration-500">
        
        <div className="bg-[#D46F54] p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none"></div>
          
          <div 
            className="inline-block cursor-default" 
            onDoubleClick={handleSecretDevAccess} 
            title="Dê um duplo clique para painel Dev"
          >
            <Building2 size={48} className="text-white mx-auto mb-4 relative z-10 drop-shadow-md hover:scale-105 transition-transform" />
          </div>
          
          <h1 className="text-2xl font-heading font-bold text-white relative z-10">VoxIntelligence</h1>
          <p className="text-rose-100 text-sm mt-2 relative z-10">Acesso Restrito ao Sistema</p>
        </div>

        <div className="p-8">
          
          <Button 
            type="button" 
            onClick={handleGoogleLogin} 
            disabled={isGoogleLoading || isLoading} 
            variant="outline" 
            className="w-full h-12 border-stone-300 text-stone-700 font-bold rounded-xl mb-6 hover:bg-stone-50 shadow-sm"
          >
            {isGoogleLoading ? <Activity className="animate-spin mr-2" size={18} /> : <GoogleIcon />}
            Entrar com o Google (Médico)
          </Button>

          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-stone-200"></div>
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Ou acesso para equipe</span>
            <div className="flex-1 h-px bg-stone-200"></div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1"><Mail size={14}/> E-mail</Label>
              <Input required type="email" placeholder="recepcao@clinica.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="h-11 bg-stone-50" />
            </div>
            
            <div>
              <Label className="text-xs font-bold text-stone-500 mb-1.5 flex items-center gap-1"><Lock size={14}/> Senha</Label>
              <Input required type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="h-11 bg-stone-50" />
            </div>

            <Button type="submit" disabled={isLoading || isGoogleLoading} className="w-full h-11 bg-stone-900 hover:bg-black text-white font-bold rounded-xl mt-2 shadow-md transition-transform hover:scale-[1.01]">
              {isLoading ? <Activity className="animate-spin mr-2" size={18} /> : "Entrar como Equipe"}
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-stone-100 bg-stone-50 -mx-8 -mb-8 p-8 flex flex-col items-center text-center">
             <h4 className="text-xs font-bold text-stone-800 mb-2 flex items-center gap-1"><Sparkles size={14} className="text-[#D46F54]"/> Nova Clínica?</h4>
             <p className="text-[11px] text-stone-500 mb-4 leading-relaxed max-w-[250px]">O VoxIntelligence opera no modelo SaaS (Software as a Service) por assinatura mensal.</p>
             <Button variant="outline" onClick={handleRegisterClick} className="w-full h-10 border-stone-200 text-stone-400 bg-white cursor-not-allowed flex items-center justify-center gap-2 text-xs font-bold hover:bg-stone-50">
                <ShieldAlert size={14}/> Criar Conta da Clínica (Bloqueado)
             </Button>
          </div>
          
        </div>
      </div>
      
      <div className="mt-8 text-center">
         <Link to="/" className="text-xs font-bold text-stone-400 hover:text-[#D46F54] transition-colors flex items-center gap-1 justify-center"><ArrowLeft size={14}/> Voltar para a página inicial</Link>
      </div>
    </div>
  );
}