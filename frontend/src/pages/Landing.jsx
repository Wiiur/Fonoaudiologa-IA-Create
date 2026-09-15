import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ShieldCheck, FileText, BrainCircuit, Activity, Calendar, Lock } from "lucide-react";

const IMG = "https://images.unsplash.com/photo-1782397132123-0166b524d6bc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwbW9kZXJuJTIwY2xpbmljJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzgzMTcxNDQwfDA&ixlib=rb-4.1.0&q=85";

export default function Landing() {
  const navigate = useNavigate();

  // Agora, qualquer tentativa de Login leva para a sua tela de Login Unificada
  const handleLogin = () => {
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900 scroll-smooth">
      
      {/* ================= HEADER ================= */}
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#D46F54] flex items-center justify-center text-white">
              <Activity size={18} />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight">VoxIntelligence</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#modulos" className="text-sm font-bold text-stone-500 hover:text-stone-900 hidden md:inline transition-colors">Recursos</a>
            <a href="#como" className="text-sm font-bold text-stone-500 hover:text-stone-900 hidden md:inline transition-colors">Como Funciona</a>
            <a href="#planos" className="text-sm font-bold text-stone-500 hover:text-stone-900 hidden md:inline transition-colors">Planos</a>
            
            <div className="flex items-center gap-2 ml-4">
              <Button onClick={handleLogin} variant="ghost" className="text-sm font-bold text-stone-600 hover:text-[#D46F54] hover:bg-[#F3E7E4]/50">
                Acessar Conta
              </Button>
              <a href="#planos">
                <Button className="bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-xl shadow-sm font-bold">
                  Assinar Agora
                </Button>
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-bold tracking-widest uppercase">
            <SparklesIcon /> Plataforma SaaS Exclusiva
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.1] mt-6 font-bold text-stone-800">
            A clínica do futuro,<br />
            <span className="text-[#D46F54]">movida a inteligência clínica.</span>
          </h1>
          <p className="mt-6 text-stone-500 font-medium max-w-xl text-lg leading-relaxed">
            O VoxIntelligence é o primeiro sistema de gestão de alta performance que escreve prontuários SOAP, audita laudos cientificamente e automatiza todo o seu faturamento.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={handleLogin} size="lg" className="bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-xl px-8 h-14 text-base font-bold shadow-md hover:scale-[1.02] transition-transform">
              Entrar no Sistema
            </Button>
            <a href="#planos">
              <Button variant="outline" size="lg" className="rounded-xl border-stone-300 text-stone-600 font-bold h-14 px-8 hover:bg-stone-50">
                Ver Planos
              </Button>
            </a>
          </div>
          <div className="mt-10 flex items-center gap-6 text-xs font-bold text-stone-400 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><ShieldCheck size={16} className="text-emerald-500"/> LGPD Compliant</span>
            <span className="flex items-center gap-1.5"><BrainCircuit size={16} className="text-indigo-500"/> Copiloto IA</span>
            <span className="flex items-center gap-1.5"><FileText size={16} className="text-rose-500"/> Relatórios IRPF</span>
          </div>
        </div>

        <div className="relative animate-in fade-in zoom-in-95 duration-700 delay-150">
          <div className="absolute -inset-6 bg-gradient-to-br from-[#F3E7E4] to-transparent rounded-3xl -z-10" />
          <img
            src={IMG}
            alt="Consultório clínico moderno"
            className="rounded-2xl border border-stone-200 shadow-xl object-cover w-full h-[520px]"
          />
          
          {/* Card Flutuante Simulando o Sistema */}
          <div className="absolute -bottom-6 -left-6 bg-white border border-stone-200 rounded-2xl p-5 shadow-xl w-72">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Próxima Sessão</div>
              <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 size={10}/> Confirmada</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center font-bold font-heading">
                A
              </div>
              <div>
                <div className="font-heading text-sm font-bold text-stone-800">Ana Pereira</div>
                <div className="text-xs font-medium text-stone-500">Terapia de Disfagia</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================= MÓDULOS ================= */}
      <section id="modulos" className="bg-white border-y border-stone-200 py-24">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="mb-14 text-center max-w-2xl mx-auto">
            <div className="text-xs uppercase tracking-widest text-[#D46F54] font-bold mb-2">Ecossistema Completo</div>
            <h2 className="font-heading text-3xl sm:text-4xl tracking-tight font-bold text-stone-800">
              Tudo o que sua clínica precisa em uma única plataforma.
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Calendar, t: "Gestão de Agenda", d: "Agendamentos, lembretes via WhatsApp gerados por IA e controle de retornos de forma automatizada." },
              { icon: BrainCircuit, t: "Copiloto IA Clínico", d: "Auditoria científica de laudos e extração de histórico clínico cruzando dezenas de evoluções." },
              { icon: FileText, t: "Faturamento & IRPF", d: "Emissão de recibos com validade fiscal, extratos DMED e relatórios de fluxo de caixa automáticos." },
              { icon: Activity, t: "Laboratório Vocal", d: "Análise acústica integrada (Jitter, Shimmer, F0) com geração de gráficos direto no prontuário." },
              { icon: ShieldCheck, t: "Prontuário LGPD", d: "Evoluções SOAP salvas em contêineres criptografados, com separação estrita de acessos para a equipe." },
              { icon: Lock, t: "Controle de Equipe", d: "Cadastre secretárias com acessos limitados e integre profissionais associados em um único ambiente." },
            ].map((f, i) => (
              <div key={i} className="bg-stone-50 border border-stone-200 rounded-2xl p-8 hover:-translate-y-1 hover:border-[#D46F54]/50 hover:bg-white transition-all duration-300 shadow-sm hover:shadow-md group">
                <div className="w-12 h-12 rounded-xl bg-white border border-stone-200 text-stone-400 group-hover:text-[#D46F54] group-hover:border-[#F3E7E4] flex items-center justify-center mb-5 transition-colors">
                  <f.icon size={24} strokeWidth={1.5} />
                </div>
                <div className="font-heading font-bold text-lg text-stone-800 mb-2">{f.t}</div>
                <div className="text-sm font-medium text-stone-500 leading-relaxed">{f.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= COMO FUNCIONA ================= */}
      <section id="como" className="py-24 bg-[#FAF9F6]">
        <div className="max-w-7xl mx-auto px-6 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {[
              { n: "01", t: "Cadastro da Clínica", d: "Após a assinatura, você configura sua identidade visual, logotipo e vincula sua secretária com acessos restritos." },
              { n: "02", t: "Prontuários Inteligentes", d: "Durante o atendimento, a IA estrutura seu raciocínio, sugere referenciais teóricos e compila tudo em PDFs elegantes." },
              { n: "03", t: "Faturamento Automático", d: "Ao receber pagamentos, o sistema gera Recibos IRPF válidos e traça gráficos de rentabilidade por paciente." },
            ].map((s, i) => (
              <div key={s.n} className="relative">
                {i !== 2 && <div className="hidden lg:block absolute top-8 left-16 right-0 h-px bg-stone-300 w-full" />}
                <div className="font-heading text-5xl text-[#D46F54] font-bold opacity-20 relative z-10 bg-[#FAF9F6] w-fit pr-4">{s.n}</div>
                <div className="font-heading text-xl font-bold text-stone-800 mt-4">{s.t}</div>
                <div className="text-sm font-medium text-stone-500 mt-2 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= PLANOS E ASSINATURA ================= */}
      <section id="planos" className="py-24 bg-stone-900 text-white border-y border-stone-800">
        <div className="max-w-5xl mx-auto px-6 md:px-10 text-center">
          <div className="text-xs uppercase tracking-widest text-[#D46F54] font-bold mb-4">Assinatura SaaS</div>
          <h2 className="font-heading text-3xl sm:text-5xl font-bold tracking-tight mb-6">
            Eleve o padrão da sua clínica.
          </h2>
          <p className="text-stone-400 font-medium max-w-xl mx-auto mb-12">
            O VoxIntelligence é disponibilizado em formato de licença mensal para clínicas e consultórios que exigem o melhor padrão tecnológico e segurança LGPD.
          </p>
          
          <div className="bg-stone-800 border border-stone-700 rounded-3xl p-8 max-w-md mx-auto relative shadow-2xl hover:border-stone-600 transition-colors">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#D46F54] text-white text-[10px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full">
              Licença Profissional
            </div>
            
            <div className="mb-6">
              <span className="text-5xl font-heading font-bold">R$ 197</span>
              <span className="text-stone-400 font-medium">/mês</span>
            </div>
            
            <div className="space-y-4 mb-8 text-left">
              {[
                "Prontuários e Pacientes Ilimitados",
                "Copiloto IA Científico Integrado",
                "Emissão de Recibos IRPF e Relatórios",
                "Acesso para Secretária (LGPD)",
                "Suporte Técnico Prioritário"
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3 text-sm font-medium text-stone-300">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
            
            <Button onClick={() => alert("Módulo de Pagamento Stripe/Pagar.me em desenvolvimento.")} className="w-full h-14 bg-white hover:bg-stone-200 text-stone-900 font-bold rounded-xl text-base transition-transform hover:scale-[1.02]">
              Assinar VoxIntelligence
            </Button>
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-4">Cancele quando quiser</p>
          </div>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="bg-stone-950 py-12 text-center text-stone-500 border-t border-stone-900">
        <div className="w-10 h-10 rounded-xl bg-stone-900 flex items-center justify-center text-[#D46F54] mx-auto mb-6">
          <Activity size={20} />
        </div>
        <div className="font-bold text-sm text-stone-400 mb-2">VoxIntelligence System</div>
        <p className="text-xs font-medium max-w-sm mx-auto mb-8">
          A plataforma SaaS definitiva para Fonoaudiólogos de excelência. Alta performance, inteligência artificial e conformidade legal.
        </p>
        <div className="text-[10px] uppercase tracking-widest font-bold border-t border-stone-800 pt-8 mx-12">
          © {new Date().getFullYear()} Todos os direitos reservados.
        </div>
      </footer>
    </div>
  );
}

// Pequeno ícone de faísca para substituir a FontAwesome (que você usava antes)
const SparklesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);