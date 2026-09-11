#!/bin/bash
# Watchdog for PUB400 Node.js ODBC server and reverse SSH tunnel

# If port 35005 is answering health check cleanly, everything is UP!
if curl -s --connect-timeout 3 http://127.0.0.1:35005/health | grep -q '"status":"UP"'; then
    exit 0
fi

# If already in the middle of an SSH connection to PUB400, wait for it
if pgrep -f "MEEGODA1@pub400.com" > /dev/null; then
    exit 0
fi

echo "[$(date)] PUB400 tunnel is DOWN. Triggering restart on PUB400..." >> /home/ubuntu/pub400_watchdog.log

# Log into PUB400 and launch start_all.sh
sshpass -p 'akila2001' ssh -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=15 MEEGODA1@pub400.com 'cd /home/MEEGODA1/akila && nohup ./start_all.sh > start_all.log 2>&1 &'
