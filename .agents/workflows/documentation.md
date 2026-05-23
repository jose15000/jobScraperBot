---
description: Project specs for context maintenance
---

# Project Documentation & Specifications

> **Project Goal:** [Briefly describe what this project or module does and the main problem it solves.]

---

## 1. Architecture & Design Patterns

[Describe the core architecture pattern adopted by this project. e.g., Clean Architecture, MVC, Layered, Hexagonal.]

**Directory Structure:**
```text
src/
  ├── core/        # [Domain logic, Entities, Interfaces, Use Cases]
  ├── shared/      # [Shared utilities, constants, exceptions]
  └── infra/       # [Database access, external services, frameworks]
```

**Required Patterns:**
- **[Pattern 1]:** [Example: Dependency Injection must be used for all services.]
- **[Pattern 2]:** [Example: Use DTOs for communication between external layers and domain.]
- **[Pattern 3]:** [Example: Controllers should only handle HTTP logic and delegate to Use Cases.]

---

## 2. Business Rules

[List the critical business constraints that must *never* be violated. This is essential for AI agents and human developers to avoid introducing structural bugs.]

1. **[Rule 1]:** [Example: User passwords must be hashed before saving.]
2. **[Rule 2]:** [Example: Use soft-delete instead of hard-delete for core entities.]
3. **[Rule 3]:** [Example: Only admin roles can access financial endpoints.]

---

## 3. Contextual Awareness

[Describe code conventions, existing utilities that must be reused, and overall technical context.]

- **Stack & Setup:** [Example: TypeScript strict mode, Node.js, React]
- **Core Libraries:** [Example: Prisma for ORM, Zod for schema validation]
- **Code Reuse:** [Example: Always use `src/shared/logger` instead of native `console.log`.]
- **Naming Conventions:** [Example: Prefix interfaces with `I`, use `camelCase` for variables and `PascalCase` for classes.]

---

## 4. Workflows & Maintenance

[Day-to-day commands and developer instructions.]

- **Testing:** [Example: Run `npm run test` ensuring all specs pass before committing.]
- **Running Locally:** [Example: Run `npm run dev` to start the local environment.]
- **Documentation:** When the architecture or business rules change, please ensure this document is kept up-to-date.
