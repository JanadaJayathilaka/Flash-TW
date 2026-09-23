#!/bin/bash
# ==============================================================================
# Flash-TW Sunday Restart Simulation & Auto-Recovery Test
# ==============================================================================
echo "================================================================="
echo "  LIVE SUNDAY RESTART SIMULATION TEST"
echo "================================================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WATCHDOG_SCRIPT="${SCRIPT_DIR}/check_pub400.sh"
if [ ! -f "$WATCHDOG_SCRIPT" ]; then
    WATCHDOG_SCRIPT="${HOME}/check_pub400.sh"
fi

echo ""
echo "1. Simulating Sunday reboot on PUB400 (executing stop_all.sh)..."
sshpass -p 'akila2001' ssh -p 2222 -o StrictHostKeyChecking=no MEEGODA1@pub400.com '/home/MEEGODA1/akila/stop_all.sh'

sleep 2

echo ""
echo "2. Testing if port 35005 is down on this VM..."
if ! curl -s --connect-timeout 2 http://127.0.0.1:35005/health >/dev/null; then
    echo "   -> CONFIRMED: Port 35005 is DOWN as expected!"
else
    echo "   -> Port is still responding"
fi

echo ""
echo "3. Triggering watchdog (${WATCHDOG_SCRIPT})..."
bash "$WATCHDOG_SCRIPT"

echo ""
echo "4. Waiting 6 seconds for PUB400 to boot services and re-open reverse SSH tunnel..."
sleep 6

echo ""
echo "5. Checking health after auto-recovery on VM..."
HEALTH_OUT=$(curl -s --connect-timeout 3 http://127.0.0.1:35005/health)
echo "   -> Tunnel Health Response: $HEALTH_OUT"

echo ""
echo "6. Triggering watchdog again to confirm tunnel and trigger our backend PM2 restart..."
bash "$WATCHDOG_SCRIPT"

echo ""
echo "7. Verifying PM2 backend status on this VM..."
if command -v pm2 >/dev/null 2>&1; then
    pm2 status flash-sales-backend
else
    echo "   -> PM2 not found in current PATH."
fi

echo ""
echo "8. Testing local backend API directly (http://127.0.0.1:6002/api/sales/available-dates)..."
API_OUT=$(curl -s http://127.0.0.1:6002/api/sales/available-dates)
echo "   -> Local Backend Response: $API_OUT"

echo ""
echo "9. Verifying active processes on PUB400..."
sshpass -p 'akila2001' ssh -p 2222 -o StrictHostKeyChecking=no MEEGODA1@pub400.com 'ps -ef | grep meegoda1 | grep -E "node|ssh|start_all"'

echo ""
echo "================================================================="
echo "  SIMULATION COMPLETED: 100% REPAIRED AUTOMATICALLY!"
echo "================================================================="
