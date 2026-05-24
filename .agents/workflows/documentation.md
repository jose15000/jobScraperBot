---
description: Project specs for context maintenance
---

# Project Documentation & Specifications — JobSearchBot

> **Project Goal:** Automated NestJS pipeline designed to scrape job opportunities from major platforms (LinkedIn, Indeed, Glassdoor) via Apify, process listings through a custom local heuristic/scoring engine, deduplicate processed links, and batch notify qualified junior/mid developer positions to WhatsApp via the Evolution API in a clean digest format.

---

## 1. Architecture & Design Patterns

The project is built on **NestJS** and follows a **Clean Architecture / Service-Repository** modular pattern to ensure decoupling of data persistence, message formatting, business rules, and scraping orchestration.

### Directory Structure:
```text
src/
  ├── interfaces/
  │     └── isearch/             # Search query definitions and shapes
  ├── services/
  │     ├── bot/                 # Orchestrator interface linking heuristics and API requests
  │     ├── scrapservice/        # Low-level HTTP integrations with Apify scrapers
  │     ├── whatsapp-service/    # Low-level integrations with the Evolution API
  │     └── task-service/        # Sequential cron-job scheduler & delegates
  │           ├── job-digest.formatter.ts   # Formatting (Presentation Layer)
  │           ├── job-history.repository.ts # Local persistent file storage (Data Layer)
  │           └── task-service.service.ts   # Pipeline Orchestration (Application Layer)
  └── utils/
        └── heuristics.ts        # Custom logic engine (Rules & Heuristics)
```

### Core Architecture & SOLID Principles:
1. **Single Responsibility Principle (SRP):**
   - **`TaskService`**: Solely responsible for orchestrating the cron-job pipeline.
   - **`JobHistoryRepository`**: Solely handles job link persistence and deduplication check.
   - **`JobDigestFormatter`**: Solely formats and styles the WhatsApp alert messages.
   - **`ScrapserviceService`**: Handles low-level scraper HTTP request logic.
   - **`Heuristics Engine`**: Evaluates job descriptions to classify them.
2. **Open-Closed Principle (OCP):**
   - Adding new scrapers (e.g. Indeed, Glassdoor) can be done by extending `ScrapserviceService` methods and adding them to `TaskService` without modifying the core deduplication repository or formatting logic.
3. **Dependency Injection (DI):**
   - All modules, services, and repositories are decoupled and resolved natively through NestJS IoC Container (`app.module.ts`).

---

## 2. Business Rules

These core constraints govern the application's behavior and must **never** be violated:

1. **Persistent Deduplication:** 
   - A job posting URL must **never** be notified to WhatsApp more than once. All successfully notified links must be registered in the `vagas-enviadas.json` repository.
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

- **Stack & Setup:** TypeScript (Strict mode), NestJS v11, Node.js (Fetch API), Docker & Docker Compose.
- **Environment Management:** 
   - The application loads configuration via NestJS `ConfigModule.forRoot()`.
   - Local development uses `.env` in the project root.
   - Key variables include `APIFY_URL` (which MUST point to a síncrono endpoint like `/run-sync-get-dataset-items` to fetch dataset arrays directly), `EVOLUTION_API_URL` and `WHATSAPP_NUMBER`.
- **Naming Conventions:**
   - Use `camelCase` for variable and function names.
   - Use `PascalCase` for class names, components, and controllers.
   - Suffix interfaces with `Dto` or `Interface` depending on their domain scope.

---

## 4. Workflows & Maintenance

Common commands and pipeline validation tasks:

- **Running Locally:** 
  ```bash
  pnpm start:dev
  ```
- **Local Testing:**
  Trigger execution manually through the local API test routes:
  ```bash
  curl http://localhost:3000/test-cron
  ```
- **Docker Production Deploy:**
  ```bash
  sudo docker compose up -d --build api
  ```
- **Documentation Rule:** Any new integrations (e.g. Indeed, Glassdoor) or database changes must be immediately recorded here to preserve context for future pair programmers.
