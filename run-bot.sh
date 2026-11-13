#!/usr/bin/env bash
# ==============================================================================
# JobSearchBot - Script de Execução Agendada (Cron) e Watchdog do Listener
# ==============================================================================

set -e

# Determina o diretório onde o script está localizado
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# Garante que os caminhos comuns de Node/NVM/PNPM/Typst estejam no PATH do cron
export PATH="/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin:$HOME/.local/share/pnpm:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

# Se o node ainda não estiver no PATH, tenta carregar o NVM
if ! command -v node &> /dev/null; then
    [ -s "$HOME/.nvm/nvm.sh" ] && \. "$HOME/.nvm/nvm.sh"
fi

LOG_FILE="$PROJECT_DIR/cron.log"
LISTENER_LOG="$PROJECT_DIR/listener.log"

# Função para garantir que o receptor sob demanda (--listen) esteja rodando
ensure_listener() {
    local force_restart="${1:-false}"

    if [ "$force_restart" = "true" ]; then
        pkill -f "dist/main.*--listen" 2>/dev/null || true
        sleep 1
    fi

    if ! pgrep -f "dist/main.*--listen" > /dev/null 2>&1; then
        # Descobre o IP do gateway Docker para a Evolution API conseguir chamar o host
        GATEWAY_IP=$(docker inspect evolution_api --format '{{range .NetworkSettings.Networks}}{{.Gateway}}{{end}}' 2>/dev/null | head -n 1 || true)
        if [ -z "$GATEWAY_IP" ]; then
            GATEWAY_IP="172.17.0.1"
        fi
        export WEBHOOK_HOST_IP="$GATEWAY_IP"

        echo "🎧 [$(date '+%Y-%m-%d %H:%M:%S')] Iniciando listener WhatsApp (/cv) em background (Gateway: $WEBHOOK_HOST_IP)..." >> "$LISTENER_LOG"
        nohup node "$PROJECT_DIR/dist/main.js" --listen >> "$LISTENER_LOG" 2>&1 &
    fi
}

# Se chamado com --restart-listener (ex: pelo deploy do GitHub Actions), apenas reinicia o listener e sai
if [ "${1:-}" = "--restart-listener" ]; then
    ensure_listener "true"
    echo "✅ Listener WhatsApp reiniciado em background."
    exit 0
fi

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

# Garante que o listener de comandos (/cv) esteja rodando na VPS
ensure_listener "false"

# Executa o bot (one-shot cron) e direciona a saída para o log
node "$PROJECT_DIR/dist/main.js" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ [$(date '+%Y-%m-%d %H:%M:%S')] Execução concluída com sucesso." >> "$LOG_FILE"
else
    echo "❌ [$(date '+%Y-%m-%d %H:%M:%S')] Execução finalizada com erro (código: $EXIT_CODE)." >> "$LOG_FILE"
fi

exit $EXIT_CODE
