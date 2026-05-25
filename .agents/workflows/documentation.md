---
description: Project specs for context maintenance
---

# Project Documentation & Specifications — JobSearchBot

> **Project Goal:** Automated NestJS **one-shot pipeline** designed to scrape job opportunities from major platforms (LinkedIn, Indeed, Glassdoor) via Apify, process listings through a custom local heuristic/scoring engine, deduplicate processed links, and batch notify qualified junior/mid developer positions to WhatsApp via the Evolution API in a clean digest format. The container is scheduled externally by **Railway Cron** (every 1h) and exits after each run.

---

## 1. Architecture & Design Patterns

The project is built on **NestJS** and follows a **Clean Architecture / Service-Repository** modular pattern to ensure decoupling of data persistence, message formatting, business rules, and scraping orchestration.

### Directory Structure:
```text
src/
  ├── interfaces/
  │     ├── isearch/             # LinkedIn search query definitions and shapes
  │     └── glassdoor-search/    # Glassdoor search query definitions and shapes
  ├── services/
  │     ├── bot/                 # Orchestrator interface linking heuristics and API requests
  │     ├── scrapservice/        # Low-level HTTP integrations with Apify (LinkedIn)
  │     ├── glassdoor/           # Low-level HTTP integrations with Apify (Glassdoor)
  │     ├── whatsapp-service/    # Low-level integrations with the Evolution API
  │     └── task-service/        # One-shot pipeline execution & delegates
  │           ├── job-digest.formatter.ts   # Formatting (Presentation Layer)
  │           ├── job-history.repository.ts # PostgreSQL persistent repository (Data Layer)
  │           └── task-service.service.ts   # Pipeline Orchestration (Application Layer)
  ├── main.ts                    # One-shot bootstrap: runs pipeline and exits
  └── utils/
        └── heuristics.ts        # Custom logic engine (Rules & Heuristics)
```

### Core Architecture & SOLID Principles:
1. **Single Responsibility Principle (SRP):**
   - **`TaskService`**: Solely responsible for orchestrating the one-shot pipeline.
   - **`JobHistoryRepository`**: Solely handles job link persistence and deduplication check.
   - **`JobDigestFormatter`**: Solely formats and styles the WhatsApp alert messages.
   - **`ScrapserviceService`**: Handles low-level LinkedIn scraper HTTP request logic.
   - **`GlassdoorService`**: Handles low-level Glassdoor scraper HTTP request logic.
   - **`Heuristics Engine`**: Evaluates job descriptions to classify them.
2. **Open-Closed Principle (OCP):**
   - Adding new scrapers (e.g. Indeed) can be done by creating a new service (like `GlassdoorService`) and adding it to `TaskService` without modifying the core deduplication repository or formatting logic.
3. **Dependency Injection (DI):**
   - All modules, services, and repositories are decoupled and resolved natively through NestJS IoC Container (`app.module.ts`).
4. **One-Shot Execution Model:**
   - `main.ts` uses `NestFactory.createApplicationContext()` (no HTTP server) to bootstrap DI, runs `TaskService.runScrapeJob()`, and calls `process.exit()` when done. Railway Cron handles the schedule externally (`0 * * * *` = every hour).

---

## 2. Business Rules

These core constraints govern the application's behavior and must **never** be violated:

1. **Persistent Deduplication:** 
   - A job posting URL must **never** be notified to WhatsApp more than once. All successfully notified links must be registered in the PostgreSQL `sent_jobs` table via `JobHistoryRepository`.
   - Before evaluating a posting through the heuristic engine, the URL must be matched against the repository. If it exists, it must be skipped immediately.
2. **Anti-Spam / Batch Notification (Digest):**
   - Individual WhatsApp message alerts are strictly prohibited to prevent WhatsApp number bans.
   - All qualified jobs within a single cron run must be consolidated into a single digest message.
   - If no new qualified jobs are found in a run, no message should be sent.
3. **Keyword-Based Heuristic Scoring:**
   - Jobs are evaluated by checking the occurrence of junior vs. senior/managerial keywords.
   - The engine must filter out internships and strictly penalize senior positions to ensure accurate junior/mid-level developer matches.

---

## 3. Contextual Awareness

Technical context, libraries, and coding guidelines:

- **Stack & Setup:** TypeScript (Strict mode), NestJS v11, Node.js (Fetch API), Docker & Docker Compose, Railway Cron.
- **Execution Model:** One-shot standalone (no HTTP server). Railway schedules the container every 1h.
- **Environment Management:** 
   - The application loads configuration via NestJS `ConfigModule.forRoot()`.
   - Local development uses `.env` in the project root.
   - Key variables include `APIFY_URL` (LinkedIn, MUST point to a síncrono endpoint like `/run-sync-get-dataset-items`), `GLASSDOOR_APIFY_URL` (Glassdoor Apify actor), `EVOLUTION_API_URL`, `WHATSAPP_NUMBER` and `DATABASE_CONNECTION_URI` (PostgreSQL connection string).
- **Naming Conventions:**
   - Use `camelCase` for variable and function names.
   - Use `PascalCase` for class names, components, and controllers.
   - Suffix interfaces with `Dto` or `Interface` depending on their domain scope.

---

## 4. Workflows & Maintenance

Common commands and pipeline validation tasks:

- **Running Locally (one-shot):** 
  ```bash
  pnpm start:dev
  ```
  This will run the full pipeline once and exit.
- **Local Testing (manual trigger):**
  ```bash
  npx ts-node src/main.ts
  ```
- **Docker Production Deploy:**
  ```bash
  sudo docker compose up -d --build api
  ```
- **Railway Cron Deploy:**
  Push to the connected branch — Railway will build the Docker image and schedule it via `railway.json` (`cronSchedule: "0 * * * *"`).
- **Documentation Rule:** Any new integrations (e.g. Indeed) or database changes must be immediately recorded here to preserve context for future pair programmers.
