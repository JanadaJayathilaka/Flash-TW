#!/bin/bash
# ==============================================================================
# Flash-TW PUB400 Watchdog & Auto-Recovery Script
# ==============================================================================
# 1. Checks if the IBM i ODBC reverse SSH tunnel (port 35005) is healthy.
# 2. If down (e.g. after Sunday PUB400 reboot), triggers start_all.sh on PUB400.
# 3. Once the tunnel recovers, automatically restarts our PM2 backend to refresh
#    stale connection pools and sockets.
# ==============================================================================

# Ensure common PATHs (including node/pm2) are available in non-interactive/cron shells
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$HOME/.npm-global/bin:$PATH"

LOG_FILE="${HOME}/pub400_watchdog.log"
RESTART_FLAG="/tmp/pub400_restarted"
PM2_APP_NAME="flash-sales-backend"

# 1. Check if port 35005 is answering health check cleanly
if curl -s --connect-timeout 3 http://127.0.0.1:35005/health | grep -q '"status":"UP"'; then
    # If the tunnel just recovered from a previous restart, restart our backend
    if [ -f "$RESTART_FLAG" ]; then
        echo "[$(date)] PUB400 tunnel is back UP! Restarting our backend (${PM2_APP_NAME})..." >> "$LOG_FILE"
        if command -v pm2 >/dev/null 2>&1; then
            pm2 restart "$PM2_APP_NAME" >> "$LOG_FILE" 2>&1
            echo "[$(date)] Backend restarted successfully via PM2." >> "$LOG_FILE"
        else
            echo "[$(date)] WARNING: pm2 command not found in PATH." >> "$LOG_FILE"
        fi
        rm -f "$RESTART_FLAG"
    fi
    exit 0
fi

# 2. If already in the middle of an SSH connection to PUB400, wait for it
if pgrep -f "MEEGODA1@pub400.com" > /dev/null; then
    exit 0
fi

# 3. Port 35005 is down -> Mark restart flag and trigger PUB400 start_all.sh
echo "[$(date)] PUB400 tunnel is DOWN. Triggering restart on PUB400..." >> "$LOG_FILE"
touch "$RESTART_FLAG"

# Log into PUB400 and launch start_all.sh
if command -v sshpass >/dev/null 2>&1; then
    sshpass -p 'akila2001' ssh -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=15 MEEGODA1@pub400.com 'cd /home/MEEGODA1/akila && nohup ./start_all.sh > start_all.log 2>&1 &'
else
    echo "[$(date)] ERROR: sshpass is not installed! Run: sudo apt-get install -y sshpass" >> "$LOG_FILE"
fi
