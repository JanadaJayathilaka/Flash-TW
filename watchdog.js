/**
 * Flash-TW PUB400 Self-Healing Tunnel & Watchdog Daemon
 * 
 * Creates an OUTBOUND SSH tunnel to PUB400:
 *   Local http://127.0.0.1:35005 -> PUB400 port 35005 (server_odbc.js)
 * 
 * Advantages:
 *   1. Zero Tunnelmole dependency (no 404s, no changing URLs, no rate limits).
 *   2. Zero incoming firewall rules needed on GCP (outbound is 100% open).
 *   3. Zero Windows OpenSSH Server needed.
 *   4. Handles Sunday reboots automatically: reconnects and restarts PM2 backend.
 * 
 * Usage:
 *   node watchdog.js
 * Or in PM2:
 *   pm2 start ecosystem.config.js
 */

const net = require('net');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let Client;
try {
  Client = require('ssh2').Client;
} catch {
  try {
    Client = require(path.join(__dirname, 'backend', 'node_modules', 'ssh2')).Client;
  } catch {
    console.error('❌ Could not locate ssh2. Please run "cd backend && npm install"');
    process.exit(1);
  }
}

const LOCAL_PORT = 35005;
const REMOTE_PORT = 35005;
const PUB400_HOST = 'pub400.com';
const PUB400_PORT = 2222;
const PUB400_USER = 'MEEGODA1';
const PUB400_PASS = 'akila2001';
const PM2_BACKEND_NAME = 'flash-sales-backend';
const LOG_FILE = path.join(__dirname, 'pub400_watchdog.log');

let localServer = null;
let sshClient = null;
let isConnected = false;
let isReconnecting = false;
let needsBackendRestart = false;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

function startLocalBridge() {
  if (localServer) return;

  localServer = net.createServer((socket) => {
    if (!isConnected || !sshClient) {
      socket.destroy();
      return;
    }

    sshClient.forwardOut('127.0.0.1', socket.remotePort, '127.0.0.1', REMOTE_PORT, (err, stream) => {
      if (err) {
        socket.destroy();
        return;
      }
      socket.pipe(stream).pipe(socket);
      stream.on('error', () => socket.destroy());
      socket.on('error', () => stream.destroy());
    });
  });

  localServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log(`⚠️ Port ${LOCAL_PORT} is already in use by another process.`);
    } else {
      log(`⚠️ Bridge error: ${err.message}`);
    }
  });

  localServer.listen(LOCAL_PORT, '127.0.0.1', () => {
    log(`🚀 Local Bridge ready on http://127.0.0.1:${LOCAL_PORT} -> PUB400:${REMOTE_PORT}`);
  });
}

function connectToPub400() {
  if (isReconnecting) return;
  isReconnecting = true;

  log(`🔄 Connecting outbound SSH tunnel to ${PUB400_HOST}:${PUB400_PORT}...`);
  sshClient = new Client();

  sshClient.on('ready', () => {
    isConnected = true;
    isReconnecting = false;
    log('✅ Outbound SSH tunnel to PUB400 established successfully!');
    startLocalBridge();

    // Verify and launch server_odbc.js if not running on PUB400
    sshClient.exec("ps -ef | grep 'node server_odbc.js' | grep -v grep || (cd /home/MEEGODA1/akila && nohup ./start_all.sh > start_all.log 2>&1 &)", () => {});

    // If recovering after Sunday reboot, restart PM2 backend to refresh connection pools
    if (needsBackendRestart) {
      needsBackendRestart = false;
      log(`PUB400 recovered. Restarting backend PM2 process (${PM2_BACKEND_NAME})...`);
      exec(`pm2 restart ${PM2_BACKEND_NAME}`, (err, stdout) => {
        if (!err) {
          log(`✅ Backend restarted successfully: ${(stdout || '').trim().split('\n')[0]}`);
        }
      });
    }
  });

  sshClient.on('error', (err) => {
    isConnected = false;
    needsBackendRestart = true;
    log(`⚠️ SSH connection failed: ${err.message} (PUB400 may be rebooting). Retrying in 5s...`);
  });

  sshClient.on('close', () => {
    isConnected = false;
    isReconnecting = false;
    needsBackendRestart = true;
    log('⚠️ Tunnel dropped. Reconnecting in 5s...');
    setTimeout(connectToPub400, 5000);
  });

  sshClient.connect({
    host: PUB400_HOST,
    port: PUB400_PORT,
    username: PUB400_USER,
    password: PUB400_PASS,
    readyTimeout: 20000,
    keepaliveInterval: 15000,
    keepaliveCountMax: 3
  });
}

// ── Health Check Probe ──
setInterval(() => {
  if (!isConnected) return;
  http.get(`http://127.0.0.1:${LOCAL_PORT}/health`, { timeout: 3000 }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.status !== 'UP') {
          log(`⚠️ Health check returned non-UP status: ${data}`);
        }
      } catch {}
    });
  }).on('error', () => {
    // Port not responding
  });
}, 30000);

// ── Start Daemon ──
log('======================================================');
log(' PUB400 Outbound Tunnel & Watchdog Daemon Started     ');
log(' Target Port: http://127.0.0.1:35005                  ');
log(' Destination: pub400.com:2222 (Port 35005)           ');
log('======================================================');

connectToPub400();
