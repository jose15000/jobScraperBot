---
description: Use essa skill para gerar as queries pra busca do linkedin.
---

# LinkedIn Job Search Skill

Estratégia de busca avançada de vagas no LinkedIn com operadores booleanos, usando o
Apify Actor `harvestapi/linkedin-post-search` para encontrar posts de recrutadores com
vagas recém-publicadas e menos concorrência.

## Por que esta abordagem funciona

A aba "Vagas" do LinkedIn concentra toda a concorrência. Os melhores recrutadores
publicam vagas como **posts no feed** — e esses posts chegam a candidatos minutos
após a publicação. Aplicar nas primeiras 2 horas aumenta drasticamente as chances de
resposta (elas caem ~58% após 24h).

---

## Workflow padrão

### 1. Coletar o perfil do usuário

Antes de buscar, extraia (da conversa ou do currículo já carregado):

- **Stack principal**: ex. React, Node.js, TypeScript, NestJS
- **Nível**: junior, jr, trainee, estágio, pleno
- **Modalidade**: remoto, híbrido, presencial
- **Restrição de IA**: o usuário quer vagas com foco em IA ou sem IA?
- **Idioma preferido**: pt-BR ou inglês (para vagas internacionais)

### 2. Montar as queries com operadores booleanos

Use a seguinte estrutura base e adapte para o perfil do usuário:

```
vaga (junior OR jr OR trainee) ("STACK_A" OR "STACK_B") (remoto OR "home office") -sênior -senior -lead
```

**Exemplos prontos por perfil:**

| Perfil | Query |
|---|---|
| Full Stack React/Node JR | `vaga (junior OR jr) (React OR Node OR TypeScript) (remoto OR "home office") -sênior -senior` |
| Dev IA JR | `vaga (junior OR jr) (LLM OR RAG OR "inteligência artificial" OR "IA") (Node OR TypeScript OR Python) remoto` |
| Frontend React JR | `vaga (junior OR jr) (React OR "Next.js" OR TypeScript) frontend (remoto OR "home office") -sênior` |
| Full Stack com foco em IA | `vaga (junior OR jr) (LLM OR MCP OR RAG OR automação) (React OR Node OR TypeScript) remoto` |
| Trainee Tech | `(trainee OR estágio OR "recém-formado") (desenvolvedor OR developer OR programador) (React OR Node OR Python) remoto` |

**Regras para construir queries:**
- Sempre inclua o nível: `(junior OR jr OR trainee)`
- Use `OR` entre tecnologias alternativas do stack do usuário
- Adicione `-sênior -senior -lead -tech lead` para excluir vagas seniores
- Inclua `remoto` ou `"home office"` se o usuário quiser trabalho remoto
- Para vagas internacionais, use inglês: `(hiring OR "we're hiring") (junior OR jr) (React OR Node) remote -senior -lead`

### 3. Configurar o Apify Actor

```python
Apify:harvestapi-slash-linkedin-post-search(
    searchQueries=[query1, query2, query3],  # máx 3 queries por chamada
    maxPosts=10,                              # 10 por query
    postedLimit="24h",                        # SEMPRE começar com 24h
    sortBy="date"                             # mais recentes primeiro
)
```

**Estratégia de `postedLimit`:**
- `24h` → vagas de hoje (menos concorrência, candidatar AGORA)
- `week` → se 24h retornar < 3 resultados
- `month` → fallback final

**Se retornar 0 resultados:** Simplificar a query removendo um operador por vez,
começando pelo mais restritivo.

### 4. Filtrar e apresentar os resultados

Ao exibir as vagas, para cada resultado relevante mostre:

```
### [Emoji de urgência] Título da vaga — Empresa (Modalidade)
**Publicado:** X horas/dias atrás
**Stack:** tecnologias mencionadas no post
**Regime:** CLT / PJ / não informado
**Como se candidatar:** [link direto ou instrução do post]
**Post original:** [link do LinkedIn]
```

**Emojis de urgência por tempo:**
- 🔥 publicado há menos de 6h
- ⚡ publicado hoje (6h–24h)
- 🟢 publicado esta semana
- 🟡 publicado há mais de 1 semana

**Filtros de qualidade ao exibir:**
- ❌ Ignorar posts com "VAGA ENCERRADA" ou "CLOSED"
- ❌ Ignorar vagas seniores que passaram pelo filtro
- ✅ Priorizar posts com link direto para candidatura
- ✅ Destacar vagas que mencionam o stack exato do usuário

### 5. Dica de timing ao candidatar

Sempre lembrar o usuário no final da listagem:

> 💡 **Aplique nas primeiras 2 horas** após a publicação. Vagas com < 5 aplicações
> aparecem frequentemente nessas buscas — as chances de resposta caem ~58% após 24h.

---

## Queries para vagas internacionais (inglês)

Para devs com inglês B2+ que querem vagas remotas internacionais:

```
(hiring OR "we're hiring") (junior OR jr OR "entry level") (React OR Node OR TypeScript) remote -senior -lead -"5 years"
```

```
(job OR opportunity) (junior OR jr) ("full stack" OR fullstack) (React OR Node) remote Brazil -senior
```

---

## Perfis do LinkedIn para seguir (fontes diárias de vagas)

Sugerir ao usuário que siga estes perfis que postam curadorias diárias de vagas:

- **ADRIANA VAGAS** → foco em Jr/Pleno tech, posta diariamente
- **Code Vagas** (`code-vagas-dev`) → curadoria remota, atualiza várias vezes ao dia
- **Remotar** (`remotar-jobs`) → vagas remotas nacionais e internacionais
- **Felvieira.DEV** → vagas Jr/trainee com links diretos

---

## Notas de comportamento

- **Sempre ordenar por data** (`sortBy: "date"`) — relevância traz resultados antigos
- **Máximo 3 queries por chamada** para não sobrecarregar o Actor
- **Se o usuário já tem currículo carregado**, extrair stack automaticamente sem perguntar
- **Se o usuário pede "vagas de hoje"**, usar `postedLimit: "24h"` obrigatoriamente
- **Se retornar poucos resultados**, tentar uma segunda chamada com queries mais simples
  antes de dizer que não encontrou nada