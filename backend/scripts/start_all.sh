#!/QOpenSys/usr/bin/sh
PATH=/QOpenSys/pkgs/bin:/QOpenSys/usr/bin:$PATH
export PATH
cd /home/MEEGODA1/akila

echo "=== [$(date)] Starting PUB400 Services (PID: $$) ===" >> start_all.log

# 1. Stop any older background start_all loops (except this current process)
kill -9 `ps -ef | grep "start_all.sh" | grep -v grep | awk '{print $2}' | grep -v "^$$$"` 2>/dev/null

# 2. Stop existing node servers, tunnelmole, and old ssh tunnels
kill -9 `ps -ef | grep "node server_odbc.js" | grep -v grep | awk '{print $2}'` 2>/dev/null
kill -9 `ps -ef | grep "node tmole_bridge.js" | grep -v grep | awk '{print $2}'` 2>/dev/null
kill -9 `ps -ef | grep "ssh -p 22" | grep -v grep | awk '{print $2}'` 2>/dev/null
sleep 1

# 3. Start Node.js ODBC Server
nohup node server_odbc.js > server_odbc.log 2>&1 &
sleep 1

# 4. Auto-reconnecting Reverse SSH tunnel to Ubuntu using 127.0.0.1
while true; do
  echo "[$(date)] Opening reverse SSH tunnel to Ubuntu (18.224.61.182:35005)..." >> tunnel.log
  ssh -p 22 -o StrictHostKeyChecking=no -o TCPKeepAlive=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -R 35005:127.0.0.1:35005 ubuntu@18.224.61.182 >> tunnel.log 2>&1
  echo "[$(date)] Tunnel dropped. Reconnecting in 3s..." >> tunnel.log
  sleep 3
done
