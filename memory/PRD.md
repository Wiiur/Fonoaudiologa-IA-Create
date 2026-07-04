# VoxIntelligence — PRD & Backlog

## Original Problem Statement
Premium SaaS de Fonoaudiologia com IA "VoxIntelligence" — copiloto para fonoaudiólogos, secretárias e pacientes.
Módulos: Gestão/Agenda, Atividades clínicas por IA, Teleatendimento, Prontuário SOAP, Relatórios PDF, Copiloto científico.

## User Choices
- IA: **Claude Sonnet 4.5** (via Emergent LLM Key)
- Auth: **Google Social Login (Emergent-managed)**
- MVP scope: Dashboard + Gestão de Pacientes + Agenda + Atividades IA + Prontuário SOAP + Relatórios PDF
- Personas: Doutor + Secretária + Paciente (portais separados)
- Design: **Clean claro premium** (off-white #FAF9F6 + acento Terracota #D46F54, tipografia Outfit/Manrope)

## Personas
1. **Doutor (Fonoaudiólogo)** — CRUD completo, IA para atividades/relatórios, prontuário SOAP.
2. **Secretária** — Agenda + Pacientes (view/create), sem IA/prontuário.
3. **Paciente** — Portal com próximas sessões e atividades home care.

## Implemented (V1 · Fev 2026)
- Auth Google (Emergent) + role selection (doctor/secretary/patient)
- Cadastro/edição de pacientes (diagnóstico, idade, interesses, notas)
- Agenda semanal com criação/exclusão de sessões
- Dashboard executivo (KPIs + próximas sessões + ações rápidas)
- Geração de atividades por IA (Claude Sonnet 4.5) por diagnóstico/idade/ambiente
- Prontuário SOAP estruturado + histórico
- Geração de relatórios profissionais (IA) com Print → PDF
- Portal do Paciente (próximas sessões + home care)

## Backlog
- **P0**: Copiloto clínico (chat livre para doutor) — módulo 5
- **P0**: Vinculação paciente ↔ user (convite por e-mail)
- **P1**: Módulo teleatendimento com checklists ao vivo
- **P1**: Mensagens humanizadas rascunhadas pela IA (WhatsApp/e-mail)
- **P1**: Remanejamento inteligente automático em cancelamentos
- **P2**: Assinatura digital / carimbo no relatório
- **P2**: Faturamento e recibos
- **P2**: Dashboards analíticos de evolução por paciente
