# VoxIntelligence — PRD & Backlog

## Original Problem Statement
Premium SaaS de Fonoaudiologia com IA "VoxIntelligence" — copiloto para fonoaudiólogos, secretárias e pacientes.
Módulos: Gestão/Agenda, Atividades clínicas por IA, Teleatendimento, Prontuário SOAP, Relatórios PDF, Copiloto científico, **Análise Acústica Vocal (Praat)**, **Desafios Vocais Interativos**.

## User Choices
- IA: **Claude Sonnet 4.5** (via Emergent LLM Key)
- Auth: **Google Social Login (Emergent-managed)**
- Object Storage: **Google Cloud Storage plugável** (fallback local disk)
- Design: **Clean claro premium** (off-white #FAF9F6 + acento Terracota #D46F54)

## Personas
1. **Doutor (Fonoaudiólogo)** — CRUD completo, IA, prontuário SOAP, análise acústica, desafios.
2. **Secretária** — Agenda + Pacientes.
3. **Paciente** — Portal com sessões e atividades home care.

## Implemented

### V1 (Fev 2026)
- Auth Google, cadastro de pacientes, agenda, dashboard, atividades IA, SOAP, relatórios PDF, copiloto, portal paciente.

### V2 — Análise Acústica Vocal (Jul 2026)
- **CORS Hardening**: origens explícitas, regex apenas `*.preview.emergentagent.com`, métodos/headers restritos.
- **Storage abstraction** (`backend/storage.py`): `LocalStorage` (padrão) e `GCSStorage` plugáveis via `GCS_BUCKET_NAME` env.
- **Análise Acústica** (`backend/voice_analysis.py`) com **praat-parselmouth**: F0 médio/desvio, jitter local, shimmer local, HNR, F1/F2/F3, intensidade, CPP, tempo de fonação, duração.
- **Endpoints Voice Lab**: POST `/api/voice/upload`, GET `/api/voice/analyses[/id]`, DELETE `/api/voice/analyses/{id}`, GET `/api/voice/audio/{id}`, POST `/api/voice/analyses/{id}/report` (SSE laudo Claude Sonnet 4.5).
- **Frontend Voice Lab** (`src/pages/VoiceLab.jsx`): gravação MediaRecorder, upload, tabela de métricas com faixas de referência (verde/âmbar), laudo IA streamado em Markdown.

### V3 — Desafios Vocais Interativos (Ago 2026)
- **7 desafios** com instruções + metas: sustained_vowel, mpt (TMF), ddk_pataka, glissando, loudness_range, sz_ratio, reading.
- **Análise por tipo**: cada desafio gera `task_metrics` específicas (ex: `mpt_seconds`, `range_semitones`, `ddk_rate_syll_per_sec`, `sz_ratio`, `intensity_range_db`) + `evaluation.grade` (ok/warn/alert) com mensagem clínica.
- **Endpoints**: GET `/api/voice/challenges/catalog`, POST `/api/voice/challenges/attempt`, GET `/api/voice/challenges/attempts`, DELETE `/api/voice/challenges/attempts/{id}`, GET `/api/voice/challenges/audio/{id}`.
- **Frontend Desafios** (`src/pages/VoiceChallenges.jsx`): cards de desafio, gravador com progresso visual, resultado com badge de grade, histórico.
- **Ownership hardening**: role check explícito em delete + 403 (em vez de 404) para não-owner.
- **Test coverage**: 50 pytest testes (28 iteração 1 + 22 iteração 2), 49 passing (1 flaky xdist).

## Backlog

### P0
- Configurar credenciais GCS reais (usuário informou que virão depois)
- Splittar `server.py` (1300+ linhas) em routers (voice_router, challenges_router, auth_router)

### P1
- Espectrograma visual (imagem PNG) por análise
- Laudo comparativo entre múltiplas tentativas de um mesmo desafio (evolução temporal)
- Área do paciente: exibir desafios agendados home-care + upload de gravações

### P2
- Voice Room ao vivo (WebRTC) para desafios síncronos remotos
- Análise em tempo real (F0 live) durante gravação
- Dashboard analítico de evolução vocal por paciente com gráficos
- Assinatura digital nos laudos

## Test Credentials
Ver `/app/memory/test_credentials.md`.
