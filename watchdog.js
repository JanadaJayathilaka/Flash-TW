/**
 * Flash-TW PUB400 Connection Watchdog (Node.js - Windows & Linux Native)
 * 
 * Works 100% natively on Windows without needing sshpass or bash.
 * Uses ssh2 (already included in backend/node_modules) to connect to PUB400.
 * 
 * Usage:
 *   node watchdog.js            -> Runs continuous monitoring loop (every 60s)
 *   node watchdog.js --once     -> Runs a single check cycle
 * 
 * In PM2 on Windows:
 *   pm2 start watchdog.js --name "pub400-watchdog"
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// Locate ssh2 (check local node_modules or backend/node_modules)
let Client;
try {
  Client = require('ssh2').Client;
} catch {
  try {
    Client = require(path.join(__dirname, 'backend', 'node_modules', 'ssh2')).Client;
  } catch {
    console.error('❌ Could not locate ssh2. Please run "npm install ssh2" or "cd backend && npm install"');
    process.exit(1);
  }
}

const LOG_FILE = path.join(__dirname, 'pub400_watchdog.log');
const RESTART_FLAG = path.join(__dirname, 'pub400_restarted.flag');
const CHECK_INTERVAL_MS = 60 * 1000;
const PM2_BACKEND_NAME = 'flash-sales-backend';

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch (err) {
    console.error('Failed to write to log file:', err.message);
  }
}

/**
 * Checks if PUB400 ODBC service & reverse SSH tunnel are UP on local port 35005
 */
function checkTunnelHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:35005/health', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.status === 'UP');
        } catch {
          resolve(false);
        }
      });
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * SSH into PUB400 and run start_all.sh
 */
function triggerPub400Restart() {
  return new Promise((resolve, reject) => {
    const conn = new Client();

    conn.on('ready', () => {
      conn.exec("cd /home/MEEGODA1/akila && nohup ./start_all.sh > start_all.log 2>&1 &", (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on('close', () => {
          conn.end();
          resolve();
        });

        stream.on('data', () => {});
        stream.stderr.on('data', () => {});
      });
    });

    conn.on('error', (err) => {
      reject(err);
    });

    conn.connect({
      host: 'pub400.com',
      port: 2222,
      username: 'MEEGODA1',
      password: 'akila2001',
      readyTimeout: 20000
    });
  });
}

/**
 * Restart our PM2 backend process to clear stale connection pools and sockets
 */
function restartBackendPm2() {
  return new Promise((resolve) => {
    log(`PUB400 recovered! Restarting our PM2 backend (${PM2_BACKEND_NAME})...`);
    exec(`pm2 restart ${PM2_BACKEND_NAME}`, (err, stdout, stderr) => {
      if (err) {
        log(`⚠️ PM2 restart error: ${err.message}`);
      } else {
        log(`✅ Backend restarted successfully via PM2: ${(stdout || '').trim().split('\n')[0]}`);
      }
      resolve();
    });
  });
}

/**
 * Single watchdog check cycle
 */
async function checkOnce() {
  const isHealthy = await checkTunnelHealth();

  if (isHealthy) {
    if (fs.existsSync(RESTART_FLAG)) {
      await restartBackendPm2();
      try {
        fs.unlinkSync(RESTART_FLAG);
      } catch {}
    }
    return true;
  }

  // Tunnel is DOWN
  log('⚠️ PUB400 tunnel is DOWN (Port 35005 not responding). Triggering start_all.sh on PUB400...');
  try {
    fs.writeFileSync(RESTART_FLAG, new Date().toISOString());
  } catch {}

  try {
    await triggerPub400Restart();
    log('🚀 Successfully dispatched start_all.sh to PUB400.');
  } catch (err) {
    log(`❌ SSH to PUB400 failed: ${err.message} (PUB400 may still be rebooting)`);
  }

  return false;
}

// ── Main Execution ──
if (process.argv.includes('--once')) {
  checkOnce().then(up => {
    console.log(`Tunnel Status: ${up ? 'UP' : 'DOWN'}`);
    process.exit(up ? 0 : 1);
  });
} else {
  log('======================================================');
  log(' PUB400 Watchdog Daemon Started (Interval: 60s)       ');
  log(' Operating System: Windows / Node.js                  ');
  log(' Target Port: 127.0.0.1:35005                         ');
  log('======================================================');

  checkOnce();
  setInterval(checkOnce, CHECK_INTERVAL_MS);
}
