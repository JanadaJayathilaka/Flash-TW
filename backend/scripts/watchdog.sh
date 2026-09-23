#!/bin/bash
# ==============================================================================
# Flash-TW PUB400 Watchdog Daemon Loop
# ==============================================================================
# Continuously executes check_pub400.sh every 60 seconds.
# Can be run via PM2:
#   pm2 start watchdog.sh --name pub400-watchdog
# Or in the background via nohup:
#   nohup ./watchdog.sh > watchdog.log 2>&1 &
# ==============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_SCRIPT="${SCRIPT_DIR}/check_pub400.sh"

echo "[$(date)] Starting PUB400 Watchdog Daemon Loop (Interval: 60s)..."

while true; do
    if [ -f "$CHECK_SCRIPT" ]; then
        bash "$CHECK_SCRIPT"
    elif [ -f "${HOME}/check_pub400.sh" ]; then
        bash "${HOME}/check_pub400.sh"
    else
        echo "[$(date)] ERROR: check_pub400.sh not found in ${SCRIPT_DIR} or ${HOME}"
    fi
    sleep 60
done
