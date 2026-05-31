# =========================================================
# Base com Playwright pronto
# =========================================================
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /usr/src/app

RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# =========================================================
# Dependencies
# =========================================================
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm fetch --frozen-lockfile

# =========================================================
# Build
# =========================================================
FROM base AS build

COPY --from=deps /pnpm /pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --offline --frozen-lockfile

COPY . .

RUN pnpm build

# =========================================================
# Production deps
# =========================================================
FROM base AS prod-deps

COPY --from=deps /pnpm /pnpm

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --prod --offline --frozen-lockfile

# =========================================================
# Runner
# =========================================================
FROM base AS runner

ENV NODE_ENV=production

COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package.json ./package.json

EXPOSE 3000

CMD ["node", "dist/main"]