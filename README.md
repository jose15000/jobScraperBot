# 🚀 JobSearchBot

Um bot automatizado e inteligente desenvolvido em **NestJS** para buscar, filtrar e notificar vagas de desenvolvimento de software diretamente no seu WhatsApp. Ele combina raspagem de sites tradicionais de vagas (web scraping) com a captura de posts informais de recrutadores no feed do LinkedIn (via API do Apify), aplicando heurísticas de pontuação e deduplicação automática.

---

## 🛠️ Arquitetura & Como Funciona

```mermaid
graph TD
    A[Cron Schedule] --> B[TaskService]
    B --> C[Scrape Web Providers<br/>Playwright / HTML Parsing]
    B --> D[Scrape LinkedIn Feed<br/>Apify Actor Sync API]
    C --> E[Raw Posts Array]
    D --> E
    E --> F[Deduplicação<br/>PostgreSQL HistoryRepository]
    F --> G[Filtro Heurístico<br/>BotService / heuristics.ts]
    G -->|Aprovadas| H[Formatação Digest<br/>JobDigestFormatter]
    H --> I[Evolution API]
    I --> J[WhatsApp Digest Message]
```

O bot executa em ciclos programados (controlados por cron local ou da nuvem) realizando as seguintes etapas:

1. **Coleta de Vagas (Browser Scraping)**:
   Acessa os portais de vagas configurados (`Glassdoor`, `Remotar`, `Indeed`, `LinkedIn Jobs`) usando seletores dinâmicos de HTML carregados com o Playwright para extrair títulos, empresas e links.
2. **Coleta de Feed (LinkedIn Posts)**:
   Invoca o actor do Apify `harvestapi/linkedin-post-search` de forma síncrona. Ele envia queries booleanas otimizadas e traz o texto cru das publicações recentes no feed do LinkedIn (onde recrutadores divulgam vagas sem registrá-las na aba de vagas tradicional).
3. **Deduplicação**:
   Cada vaga/post passa pelo banco de dados PostgreSQL. Se o link da vaga já foi enviado em execuções passadas, ele é descartado imediatamente.
4. **Filtro Heurístico**:
   O texto da vaga é analisado contra um dicionário de termos:
   - **Pontuação Positiva**: Tecnologias desejadas (React, Node.js, TypeScript, NestJS, Tailwind, etc.) e níveis corretos (Júnior, Pleno, Entry, Mid).
   - **Filtro Exclusivo (Rejeição imediata)**: Termos de regime presencial, híbrido, vagas de nível Sênior/Lead, ou posts que indicam busca de emprego por candidatos (ex: "estou à procura", "open to work").
   - **Nota de Corte**: Apenas vagas com pontuação final $\ge 25$ são aprovadas.
5. **Digest e Notificação**:
   As vagas aprovadas são consolidadas em um único resumo legível e disparadas no WhatsApp do usuário através da **Evolution API**, minimizando o spam e respeitando os limites da API.

---

## 📂 Estrutura do Projeto

```bash
├── .agents/                    # Workflows do agente autônomo
├── context/                    # Grafos de Contexto e Raciocínio (ContextAtlas)
├── src/
│   ├── config/
│   │   └── providers.ts        # Definição dos seletores e URLs de plataformas (Glassdoor, Indeed, Remotar, etc.)
│   ├── interfaces/
│   │   └── isearch/            # Definições de contratos e interfaces de scraping
│   ├── repositories/
│   │   └── job-history.repository.ts # Repositório PostgreSQL para deduplicação
│   ├── services/
│   │   ├── bot/                # Agrupa requisições Playwright e chamadas Evolution API
│   │   ├── scrapservice/       # Motor genérico de scraping e integração com Apify
│   │   ├── task-service/       # Orquestrador principal do pipeline (SRP)
│   │   └── whatsapp-service/   # Serviço de comunicação direta com a Evolution API
│   ├── utils/
│   │   └── heuristics.ts       # Algoritmo de filtragem e dicionários de tecnologia/rejeição
│   ├── app.module.ts           # Módulo raiz do NestJS
│   └── main.ts                 # Ponto de entrada do aplicativo
├── docker-compose.yml          # Definição do ambiente completo (Postgres, PgAdmin, Evolution API, NestJS)
└── package.json
```

---

## 🚀 Como Rodar na Própria Máquina

Você pode optar por rodar o projeto inteiramente via **Docker Compose** (que já inclui a Evolution API, Postgres, PgAdmin e a aplicação) ou rodar a aplicação **localmente** utilizando serviços Docker de apoio.

### Pré-requisitos
* **Node.js** (versão 20 ou superior recomendada)
* **pnpm** (gerenciador de pacotes recomendado)
* **Docker & Docker Compose**
* Uma conta na **Apify** (com token da API para o LinkedIn Scraper)

---

### Passo 1: Configurar Variáveis de Ambiente
Copie ou crie um arquivo `.env` na raiz do projeto com as seguintes variáveis de configuração:

```env
# URL de execução síncrona do Actor do Apify (LinkedIn Post Search)
APIFY_URL=https://api.apify.com/v2/actors/harvestapi~linkedin-post-search/runs?token=SEU_TOKEN_APIFY

# Configurações do Banco de Dados PostgreSQL
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://postgres:PASSWORD@localhost:5432/postgres?schema=public

# Configurações da Evolution API (WhatsApp)
EVOLUTION_API_URL=http://localhost:8080
AUTHENTICATION_API_KEY=mude-me # Token para segurança da Evolution API
apiKey=mude-me                  # Mesmo token para comunicação interna
WHATSAPP_NUMBER=55XXXXXXXXXXX   # Seu número do WhatsApp completo (com DDD)
INSTANCE_NAME=job-bot           # Nome da instância WhatsApp a ser criada/utilizada

# Configurações Adicionais da Evolution API (Salvar dados no DB se necessário)
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true
CACHE_LOCAL_ENABLED=true
```

---

### Passo 2: Inicializar Serviços Auxiliares (Postgres, Evolution API)
Antes de rodar a aplicação NestJS localmente, suba os containers do PostgreSQL e da Evolution API:

```bash
docker compose up -d postgres evolution-api pgadmin
```

> [!NOTE]
> * **PostgreSQL**: Rodará na porta `5432` com usuário `postgres` e senha `PASSWORD`.
> * **Evolution API**: Rodará na porta `8080`. Você precisará escanear o QR Code para conectar seu WhatsApp à instância criada pelo bot.
> * **PgAdmin**: Disponível na porta `4000` (email: `admin@admin.com` / senha: `PASSWORD`) para inspecionar o banco de dados.

---

### Passo 3: Instalar as Dependências e Rodar o NestJS

1. **Instale os pacotes**:
   ```bash
   pnpm install
   ```

2. **Execute o projeto em modo desenvolvimento (Live Watch)**:
   ```bash
   pnpm run start:dev
   ```

3. **Crie a build de produção (caso queira rodar otimizado)**:
   ```bash
   pnpm run build
   pnpm run start:prod
   ```

---

### Passo 4: Conectar seu WhatsApp (Evolution API)
Uma vez que a Evolution API esteja rodando no Docker:
1. Acesse o painel ou use a própria requisição do Bot para gerar o QR Code da instância `job-bot`.
2. Abra o WhatsApp no seu celular, vá em **Aparelhos Conectados** -> **Conectar um Aparelho** e escaneie o código.
3. A partir deste momento, sempre que o bot for executado, os alertas de vagas qualificadas chegarão diretamente no seu número do WhatsApp configurado em `WHATSAPP_NUMBER`.

---

## 🧩 Adicionando Novos Portais de Vaga (Providers)

Para incluir novos sites ao pipeline de Playwright:
1. Abra o arquivo `src/config/providers.ts`.
2. Crie e exporte uma nova constante do tipo `IProviderConfig`. Exemplo:
   ```typescript
   export const meuNovoProvider: IProviderConfig = {
       name: 'nome_do_site',
       buildSearchUrl: (query: string) => `https://site.com/busca?q=${encodeURIComponent(query)}`,
       selectors: {
           container: '.classe-card-vaga',
           jobTitle: 'h2.titulo',
           companyName: '.nome-empresa',
           jobLink: 'a.link-vaga',
           waitSelector: '.lista-vagas',
           baseUrl: 'https://site.com'
       }
   }
   ```
3. Importe e adicione o provider ao array de providers em `src/services/task-service/task-service.service.ts` no método `scrapeWebProviders`.

---

## 🧠 ContextAtlas Graph
O projeto conta com o **ContextAtlas** integrado para registrar e preservar o grafo de decisões arquiteturais e mudanças no código de maneira otimizada. Os arquivos gerados de histórico ficam localizados na pasta `/context`.

* Para rodar o MCP Server correspondente:
  ```bash
  npx mcp-atlas
  ```
