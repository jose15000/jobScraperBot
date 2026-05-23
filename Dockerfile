# Imagem base com suporte a Node.js 22 e Alpine Linux (leve e segura)
FROM node:22-alpine AS base

# Habilita o Corepack para termos suporte nativo ao pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /usr/src/app

# --- Estágio 1: Instalação de dependências e compilação do projeto ---
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Instala todas as dependências (incluindo devDependencies para build)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# --- Estágio 2: Instalação de dependências exclusivas de produção ---
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

# --- Estágio 3: Runner final de produção ultra leve ---
FROM base AS runner
ENV NODE_ENV=production

# Copia apenas o código transpilado e as dependências de produção necessárias
COPY --from=prod-deps /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/package.json ./package.json

# Porta da aplicação exposta internamente no container
EXPOSE 3000

CMD ["node", "dist/main"]
