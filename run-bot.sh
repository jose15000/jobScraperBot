#!/usr/bin/env bash
# ==============================================================================
# JobSearchBot - Script de Execução Agendada (Cron)
# ==============================================================================

set -e

# Determina o diretório onde o script está localizado
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Garante que os caminhos comuns de Node/NVM/PNPM estejam no PATH do cron
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

# Se o node ainda não estiver no PATH, tenta carregar o NVM
if ! command -v node &> /dev/null; then
    [ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
fi

LOG_FILE="$PROJECT_DIR/cron.log"

echo "==========================================================" >> "$LOG_FILE"
echo "🕒 [$(date '+%Y-%m-%d %H:%M:%S')] Iniciando JobSearchBot..." >> "$LOG_FILE"
echo "==========================================================" >> "$LOG_FILE"

# Verifica se a build (dist) existe; se não existir, tenta compilar
if [ ! -f "$PROJECT_DIR/dist/main.js" ]; then
    echo "⚠️ Arquivo dist/main.js não encontrado. Compilando projeto..." >> "$LOG_FILE"
    if command -v pnpm &> /dev/null; then
        pnpm run build >> "$LOG_FILE" 2>&1
    elif command -v npm &> /dev/null; then
        npm run build >> "$LOG_FILE" 2>&1
    else
        echo "❌ Nem pnpm nem npm encontrados no PATH." >> "$LOG_FILE"
        exit 1
    fi
fi

# Executa o bot e direciona a saída para o log
node "$PROJECT_DIR/dist/main.js" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] Execução concluída com sucesso." >> "$LOG_FILE"
else
    echo "❌ [$(date '+%Y-%m-%d %H:%M:%S')] Execução finalizada com erro (código: $EXIT_CODE)." >> "$LOG_FILE"
fi

exit $EXIT_CODE
