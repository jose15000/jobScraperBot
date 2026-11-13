# =========================================================
# Base com Node.js e Playwright
# =========================================================
FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /usr/src/app

# Instala o pnpm via npm para evitar erro de verificação de chave do corepack
RUN npm install -g pnpm@10 && \
    ARCH=$(uname -m) && \
    curl -fsSL "https://github.com/typst/typst/releases/latest/download/typst-${ARCH}-unknown-linux-musl.tar.xz" | tar -xJ --strip-components=1 -C /usr/local/bin "typst-${ARCH}-unknown-linux-musl/typst" && \
    chmod +x /usr/local/bin/typst

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
COPY --from=build /usr/src/app/jobs.config*.yaml ./
COPY --from=build /usr/src/app/cv.base*.yaml ./

EXPOSE 3000

CMD ["node", "dist/main"]