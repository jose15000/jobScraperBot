# 🦁 LioApply

**LioApply** é uma plataforma **100% Open-Source e gratuita** desenvolvida em **NestJS** para automatizar a busca de vagas de engenharia de software, filtragem semântica inteligente (**System-One Multi-Provider Classifier**) e **geração sob demanda de currículos otimizados para ATS em PDF (via Typst)** diretamente no seu **WhatsApp**.

---

## ✨ Principais Funcionalidades

- **🔍 Scraping Multi-Plataforma Automatizado:** Coleta vagas em portais como **LinkedIn**, **Glassdoor** e **Remotar** via Playwright Stealth e Apify, totalmente configurável via YAML (`jobs.config.yaml`).
- **🧹 Deduplicação Inteligente (Título + Empresa):** Normaliza títulos e nomes de empresas para nunca enviar a mesma vaga duas vezes, mesmo quando republicada com links diferentes.
- **🧠 Classificador Semântico System-One Multi-Provider (em Lote):**
  - Avalia vagas inéditas em lote usando julgamentos probabilísticos tipados (`noul`: `matches_profile` e `is_actual_job_offer`) com **compressão de rubricas** (~80% de economia de tokens).
  - **Liberdade de Escolha (`CLASSIFIER_PROVIDER`):** Funciona 100% grátis com **OpenRouter** (`openrouter/free`), **Groq** (`llama-3.1-8b-instant`), **Google Gemini** (`gemini-2.5-flash-lite`), **Ollama** local, **Laya**, **Kev** ou **TypeSafe Jev**.
- **📄 Otimização de Currículo ATS Sob Demanda (`/cv` + Typst PDF):**
  - Cada vaga aprovada no resumo do WhatsApp recebe um código `[#ID]`.
  - Basta responder **`/cv 42`** (ou `/cv <link_ou_descrição_da_vaga>`) no WhatsApp para o LioApply reescrever seu currículo base (`cv.base.yaml`) focado nas palavras-chave daquela vaga, compilar um PDF impecável em milissegundos via **Typst** e enviar o documento pronto no seu WhatsApp!

---

## 🛠️ Arquitetura & Fluxo de Execução

```mermaid
flowchart TD
    subgraph Pipeline["1. Busca & Classificação de Vagas (Cron / One-Shot)"]
        A["Cron / CLI (--run-now)"] --> B["TaskService"]
        B --> C["Playwright & Apify Scrapers<br/>(LinkedIn, Glassdoor, Remotar)"]
        C --> D["Deduplicação Título + Empresa<br/>(JobDeduplicationService + PostgreSQL)"]
        D --> E["System-One Batch Classifier<br/>(OpenRouter / Groq / Gemini / Ollama / Laya / Kev / Jev)"]
        E -->|"Aprovadas (score >= 50%)"| F["JobDigestFormatter<br/>(Gera Resumo com Tags [#ID])"]
        F --> G["Evolution API -> WhatsApp Digest"]
    end

    subgraph CV["2. Currículo ATS Sob Demanda (/cv)"]
        H["Usuário envia '/cv 42' no WhatsApp<br/>ou roda 'pnpm cv 42'"] --> I["CvOptimizationService"]
        I --> J["CvLlmService (OpenRouter)<br/>Reescreve Summary, Bullets e Skills"]
        J --> K["Auditoria de Credibilidade & Score ATS"]
        K --> L["TypstCompilerService<br/>Compila PDF em ~50ms"]
        L --> M["Evolution API -> Envia PDF no WhatsApp"]
    end
```

---

## 📂 Estrutura do Projeto

```text
├── .github/workflows/          # Pipeline CI/CD (Build, Testes e Deploy via SSH)
├── jobs.config.yaml            # Configuração declarativa de buscas, perfil e classificador
├── cv.base.example.yaml        # Template de currículo base em YAML para otimização ATS
├── src/
│   ├── config/
│   │   ├── job-config.service.ts # Carregador de configuração YAML / ENV
│   │   └── providers.ts          # Seletores e URLs dos portais (LinkedIn, Glassdoor, Remotar)
│   ├── controllers/
│   │   └── whatsapp-webhook.controller.ts # Webhook da Evolution API para comandos '/cv'
│   ├── database/
│   │   └── schema.ts             # Tabelas Drizzle ORM (sent_jobs)
│   ├── repositories/
│   │   └── job-history.repository.ts # Persistência e consulta de vagas no PostgreSQL
│   ├── services/
│   │   ├── cv/                   # Motor de otimização ATS (OpenRouter + Typst PDF)
│   │   ├── jev/                  # Classificador System-One Multi-Provider (Batch + Rubric Compression)
│   │   ├── task-service/         # Orquestrador do pipeline e formatador de Digest
│   │   └── whatsapp-service/     # Integração com a Evolution API (texto e documentos PDF)
│   ├── utils/
│   │   ├── deduplication.ts      # Normalização e deduplicação por título + empresa
│   │   └── jev.ts                # Primitivas System-One ('noul', avaliação individual e em lote)
│   └── main.ts                   # Entrypoint CLI (--run-now, --listen, --cv)
└── docker-compose.yml            # PostgreSQL, Evolution API e PgAdmin
```

---

## 🚀 Como Rodar (Quick Start)

### Pré-requisitos
- **Node.js 20+** e **pnpm**
- **Docker & Docker Compose** (para PostgreSQL e Evolution API)
- **Typst CLI** instalado no sistema (para compilação de currículos em PDF):
  ```bash
  curl -fsSL https://typst.community/typst-install/install.sh | sh
  ```

### 1. Clonar e Instalar Dependências

```bash
git clone https://github.com/LioApply/LioApply.git
cd LioApply
pnpm install
```

### 2. Configurar seu Currículo Base e Preferências de Vagas

1. Crie seu arquivo `cv.base.yaml` a partir do exemplo (o `cv.base.yaml` fica no `.gitignore` para proteger seus dados pessoais):
   ```bash
   cp cv.base.example.yaml cv.base.yaml
   ```
2. Edite o arquivo `jobs.config.yaml` com os cargos (`queries`), localidades (`locations`) e tecnologias do seu perfil (`profile`).

### 3. Configurar o `.env`

Copie o `.env.example` para `.env`:

```bash
cp .env.example .env
```

Preencha suas variáveis no `.env`:

```env
# Banco de Dados PostgreSQL
DATABASE_CONNECTION_URI=postgresql://postgres:PASSWORD@localhost:5432/postgres?schema=public

# Evolution API (WhatsApp)
EVOLUTION_API_URL=http://localhost:8080
apiKey=sua-chave-evolution
INSTANCE_NAME=lioapply
WHATSAPP_NUMBER=5511999999999

# Classificador Semântico System-One & Otimização de Currículo (100% Gratuito)
# Opções de CLASSIFIER_PROVIDER: auto | openrouter | groq | gemini | ollama | laya | kev | jev
CLASSIFIER_PROVIDER=auto
OPEN_ROUTER_API_KEY=sk-or-v1-...
# GROQ_API_KEY=gsk_...
# GEMINI_API_KEY=AIza...
# JEV_API_KEY=...
```

> [!TIP]
> Deixando `CLASSIFIER_PROVIDER=auto`, o LioApply usa automaticamente a chave gratuita que você tiver configurada (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPEN_ROUTER_API_KEY` ou `JEV_API_KEY`) tanto para classificar vagas em lote quanto para gerar currículos sob demanda.

### 4. Subir Serviços Auxiliares e Executar

1. Suba o PostgreSQL e a Evolution API via Docker:
   ```bash
   docker compose up -d postgres evolution-api
   ```
2. Compile o projeto:
   ```bash
   pnpm run build
   ```
3. **Comandos disponíveis:**
   - **Executar busca e filtragem de vagas agora (One-Shot):**
     ```bash
     node dist/main.js --run-now
     ```
   - **Iniciar o servidor de escuta para comandos `/cv` do WhatsApp:**
     ```bash
     pnpm run listen
     ```
   - **Gerar um currículo otimizado via terminal (por ID da vaga, link ou texto):**
     ```bash
     pnpm run cv 42
     ```
   - **Iniciar o Servidor MCP oficial (`@lioapply/mcp` via stdio para Claude / Cursor / Antigravity):**
     ```bash
     pnpm run mcp
     ```

---

## 📦 Uso como SDK / Pacotes Injetáveis (`@lioapply/*`)

Você também pode importar os pacotes modulares diretamente em código TypeScript ou no seu próprio módulo NestJS:

```typescript
import { createLioApply } from '@lioapply/core';
import { createLinkedinProvider } from '@lioapply/providers/linkedin';
import { createGlassdoorProvider } from '@lioapply/providers/glassdoor';
import { createRemotarProvider } from '@lioapply/providers/remotar';

const lio = createLioApply({
  providers: [
    createLinkedinProvider(),
    createGlassdoorProvider(),
    createRemotarProvider(),
  ],
  classifier: {
    provider: 'auto', // 'openrouter' | 'groq' | 'gemini' | 'ollama' | 'laya' | 'kev' | 'jev'
  },
});

// 1. Buscar, deduplicar e classificar vagas em lote
const { approvedJobs, digestText } = await lio.searchAndClassify();

// 2. Gerar currículo em PDF via Typst sob demanda
const { pdfBuffer, fileName, evaluation } = await lio.cv.optimizeForJob({
  title: approvedJobs[0].title,
  company: approvedJobs[0].company,
  description: approvedJobs[0].previewText,
});
```

---

## 🧪 Testes Automatizados

Para rodar toda a suíte de testes unitários e de integração (incluindo o classificador System-One Multi-Provider e o compilador Typst):

```bash
pnpm test
```

---

## 📄 Licença

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.
