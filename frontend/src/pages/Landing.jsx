import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const IMG = "https://images.unsplash.com/photo-1782397132123-0166b524d6bc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1OTV8MHwxfHNlYXJjaHwyfHxtaW5pbWFsaXN0JTIwbW9kZXJuJTIwY2xpbmljJTIwaW50ZXJpb3J8ZW58MHx8fHwxNzgzMTcxNDQwfDA&ixlib=rb-4.1.0&q=85";

export default function Landing() {
  const handleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-stone-900">
      <header className="border-b border-stone-200 bg-white/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 md:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#D46F54] flex items-center justify-center text-white">
              <i className="fa-solid fa-waveform-lines text-sm"></i>
            </div>
            <span className="font-heading text-lg font-semibold tracking-tight">VoxIntelligence</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#modulos" className="text-sm text-stone-600 hover:text-stone-900 px-3 hidden md:inline">Módulos</a>
            <a href="#como" className="text-sm text-stone-600 hover:text-stone-900 px-3 hidden md:inline">Como funciona</a>
            <Button
              data-testid="landing-login-btn"
              onClick={handleLogin}
              className="bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-md"
            >
              Entrar com Google
            </Button>
          </div>
        </div>
      </header>

      <section className="max-w-7xl mx-auto px-6 md:px-10 py-16 md:py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F3E7E4] text-[#B75C46] text-xs font-medium tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D46F54]" /> Copiloto premium para Fonoaudiologia
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl tracking-tight leading-[1.02] mt-6 font-medium">
            Clínica de alta performance,<br />
            <span className="text-[#D46F54]">movida por inteligência clínica.</span>
          </h1>
          <p className="mt-6 text-stone-600 max-w-xl text-base leading-relaxed">
            VoxIntelligence organiza sua agenda, escreve prontuários SOAP, gera planos terapêuticos personalizados e produz relatórios impecáveis — para você focar 100% no paciente.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button
              data-testid="hero-cta-btn"
              onClick={handleLogin}
              size="lg"
              className="bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-md px-7"
            >
              Começar com Google <i className="fa-brands fa-google ml-2"></i>
            </Button>
            <a href="#modulos">
              <Button variant="outline" size="lg" className="rounded-md border-stone-300">
                Ver módulos
              </Button>
            </a>
          </div>
          <div className="mt-10 flex items-center gap-6 text-xs text-stone-500">
            <span className="flex items-center gap-2"><i className="fa-solid fa-shield-halved"></i> LGPD compliant</span>
            <span className="flex items-center gap-2"><i className="fa-solid fa-brain"></i> Baseado em Evidências</span>
            <span className="flex items-center gap-2"><i className="fa-solid fa-file-lines"></i> Relatórios PDF</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-6 bg-gradient-to-br from-[#F3E7E4] to-transparent rounded-3xl -z-10" />
          <img
            src={IMG}
            alt="Consultório clínico moderno"
            className="rounded-2xl border border-stone-200 shadow-sm object-cover w-full h-[520px]"
          />
          <div className="absolute -bottom-6 -left-6 bg-white border border-stone-200 rounded-lg p-4 shadow-sm w-64">
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-1">Próxima sessão</div>
            <div className="font-heading text-sm font-semibold">Ana P. — Disfagia</div>
            <div className="text-xs text-stone-500 mt-1">Hoje · 14h30 · Presencial</div>
          </div>
        </div>
      </section>

      <section id="modulos" className="max-w-7xl mx-auto px-6 md:px-10 py-16">
        <div className="mb-10">
          <div className="text-xs uppercase tracking-[0.2em] text-stone-500 font-bold">Módulos</div>
          <h2 className="font-heading text-3xl sm:text-4xl tracking-tight mt-2 font-medium">
            Cinco competências. Um só copiloto.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: "fa-calendar-check", t: "Gestão & Agenda", d: "Remanejamentos inteligentes, mensagens humanizadas para pacientes." },
            { icon: "fa-brain", t: "Atividades Personalizadas", d: "Planos por diagnóstico, idade e interesse — clínica ou home care." },
            { icon: "fa-video", t: "Teleatendimento", d: "Checklists de observação e adaptações digitais dinâmicas." },
            { icon: "fa-notes-medical", t: "Prontuário SOAP", d: "Registro clínico estruturado em segundos." },
            { icon: "fa-file-signature", t: "Relatórios PDF-ready", d: "Documentos premium prontos para médicos e convênios." },
            { icon: "fa-microscope", t: "Copiloto Científico", d: "Raciocínio clínico factual, baseado em evidências." },
          ].map((f) => (
            <div
              key={f.t}
              data-testid={`module-card-${f.t.toLowerCase().replace(/\s+/g, "-")}`}
              className="bg-white border border-stone-200 rounded-lg p-6 hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-md bg-[#F3E7E4] text-[#B75C46] flex items-center justify-center mb-4">
                <i className={`fa-solid ${f.icon}`}></i>
              </div>
              <div className="font-heading font-semibold text-lg">{f.t}</div>
              <div className="text-sm text-stone-600 mt-1.5 leading-relaxed">{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="como" className="bg-white border-y border-stone-200 py-16">
        <div className="max-w-7xl mx-auto px-6 md:px-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
          {[
            { n: "01", t: "Entre com Google", d: "Autenticação segura em um clique. Escolha seu perfil: Doutor, Secretária ou Paciente." },
            { n: "02", t: "Cadastre seus pacientes", d: "Ficha completa com diagnóstico, histórico e interesses." },
            { n: "03", t: "Deixe a IA trabalhar", d: "Atividades, relatórios e prontuários gerados em instantes." },
          ].map((s) => (
            <div key={s.n}>
              <div className="font-heading text-4xl text-[#D46F54] font-medium">{s.n}</div>
              <div className="font-heading text-lg font-semibold mt-2">{s.t}</div>
              <div className="text-sm text-stone-600 mt-1.5">{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="font-heading text-3xl sm:text-4xl font-medium tracking-tight">Pronto para elevar sua prática clínica?</h2>
        <p className="text-stone-600 mt-4">Comece grátis. Configure sua clínica em minutos.</p>
        <Button
          data-testid="footer-cta-btn"
          onClick={handleLogin}
          size="lg"
          className="mt-8 bg-[#D46F54] hover:bg-[#B75C46] text-white rounded-md px-8"
        >
          Entrar com Google
        </Button>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-xs text-stone-500">
        © {new Date().getFullYear()} VoxIntelligence · Feito para Fonoaudiólogos de excelência.
      </footer>
    </div>
  );
}
