# Complete Guide: Hosting Flash-TW on Google Cloud Windows VM (PM2 + Caddy + Auto-Recovery Watchdog)

This step-by-step guide covers how to deploy the **Flash-TW** frontend (Port 6001) and backend (Port 6002) onto a **Google Cloud Windows Server VM (Compute Engine)** using **PM2**, **Caddy**, and our native automated recovery watchdog for PUB400's scheduled Sunday reboots.

- **Domain**: `flash-node-no-odbc-db2-mssql.awdspark.com`
- **Frontend Port**: `6001`
- **Backend Port**: `6002`
- **PUB400 Reverse Tunnel Port**: `35005`

---

## Architecture Overview

```
                      +----------------------------------------+
                      |               Internet                 |
                      +----------------------------------------+
                                     |  HTTPS (443) / HTTP (80)
                                     v
+---------------------------------------------------------------------------------+
| Google Cloud Windows VM (Windows Server 2022 / 2025)                            |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   | Caddy Web Server (Port 80 / 443 - Automatic Let's Encrypt SSL)          |   |
|   |                                                                         |   |
|   |   * Route /           -> Reverse Proxy to Frontend (http://127.0.0.1:6001) |
|   |   * Route /api/*      -> Reverse Proxy to Backend  (http://127.0.0.1:6002) |
|   |   * Route /graphql*   -> Reverse Proxy to Backend  (http://127.0.0.1:6002) |
|   +-------------------------------------------------------------------------+   |
|                                     |                                           |
|                   +-----------------+-------------------+                       |
|                   | (Route /)                           | (Route /api, /graphql)|
|                   v                                     v                       |
|   +------------------------------------+   +----------------------------------+ |
|   | flash-sales-frontend (Port 6001)   |   | flash-sales-backend (Port 6002)  | |
|   | (PM2: Native Node.js SPA Server)   |   | (PM2: Express & Apollo Server)   | |
|   +------------------------------------+   +----------------------------------+ |
|                                                             |                   |
|   +------------------------------------+                    | Queries           |
|   | pub400-watchdog (PM2 Daemon)       |                    v                   |
|   | Auto-recovery for Sunday reboots   |           +-----------------------+    |
|   +------------------------------------+           | MS SQL Server         |    |
|                                                    | (site4now.net)        |    |
|                                                    +-----------------------+    |
|                                                             |                   |
|                                                             | Calls             |
|                                                             v                   |
|                                                    +-----------------------+    |
|                                                    | Local Bridge Port     |    |
|                                                    | 127.0.0.1:35005       |    |
|                                                    +-----------------------+    |
|                                                                 ^               |
|                                                                 | Reverse SSH   |
|                                                                 | Tunnel (-R)   |
|   +-------------------------------------------------------------|-----------+   |
|   | Windows OpenSSH Server (sshd service on Port 22)           |           |   |
|   |   Receives reverse tunnel from PUB400 (-R 35005:127.0.0.1:35005)        |   |
|   +-------------------------------------------------------------------------+   |
+-----------------------------------------------------------------|---------------+
                                                                  | Port 2222 (SSH)
                                                                  v
                                              +-----------------------------------+
                                              | IBM i Server (pub400.com:2222)    |
                                              | * node server_odbc.js (Port 35005)|
                                              | * start_all.sh reverse tunnel     |
                                              +-----------------------------------+
```

---

## Step 1: Google Cloud VM & Windows Firewall Setup

### 1.1 Reserve a Static External IP Address in GCP Console
PUB400 connects directly back to your Windows VM IP to create the reverse SSH tunnel. A static IP is **mandatory**:
1. Go to [GCP Console](https://console.cloud.google.com/) -> **VPC network** -> **IP addresses**.
2. Find your Windows VM external IP and select **Reserve static address**.
3. Note this IP: `YOUR_GCP_VM_STATIC_IP`.

### 1.2 GCP Firewall Rules
Ensure GCP allows inbound traffic on ports 80, 443, and 22:
1. In **VPC network** -> **Firewall**:
   - **default-allow-http**: TCP port `80`, Source `0.0.0.0/0`.
   - **default-allow-https**: TCP port `443`, Source `0.0.0.0/0`.
   - **default-allow-ssh**: TCP port `22`, Source `0.0.0.0/0` (or PUB400's IP `185.113.5.134`).
2. In **Compute Engine** -> **VM instances** -> Edit your VM -> Check:
   - [x] **Allow HTTP traffic**
   - [x] **Allow HTTPS traffic**

### 1.3 Windows Defender Firewall Rules
Open **PowerShell as Administrator** on your Windows VM and allow ports 80, 443, and 22:
```powershell
New-NetFirewallRule -Name 'Caddy-HTTP' -DisplayName 'Caddy HTTP (80)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 80
New-NetFirewallRule -Name 'Caddy-HTTPS' -DisplayName 'Caddy HTTPS (443)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 443
New-NetFirewallRule -Name 'OpenSSH-Server' -DisplayName 'OpenSSH Server (22)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
```

---

## Step 2: Install OpenSSH Server on Windows (For Reverse Tunnel)

PUB400 opens a reverse SSH tunnel to your Windows machine (`ssh -N -R 35005:127.0.0.1:35005 ...`). This requires Windows OpenSSH Server:

### 2.1 Enable and Start OpenSSH Server
Run in **PowerShell as Administrator**:
```powershell
# 1. Install OpenSSH Server capability
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0

# 2. Start SSHD and set to Automatic startup
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

# 3. Verify it is Running
Get-Service sshd
```

### 2.2 Authorize PUB400's SSH Key on Windows
PUB400 must connect without a password prompt.

1. **On PUB400**, generate an SSH key (if not already done) and print it:
   ```bash
   ssh -p 2222 MEEGODA1@pub400.com
   # Run on PUB400:
   ssh-keygen -t rsa -b 2048 -N "" -f ~/.ssh/id_rsa
   cat ~/.ssh/id_rsa.pub
   ```
   *(Copy the entire line starting with `ssh-rsa ...`)*

2. **On your Windows VM** (PowerShell as Administrator):
   > [!IMPORTANT]
   > On Windows Server, accounts in the Administrator group use `C:\ProgramData\ssh\administrators_authorized_keys` with strict permissions.
   ```powershell
   # Create administrators_authorized_keys with PUB400's key
   $pubKey = "PASTE_PUB400_PUBLIC_KEY_HERE"
   Set-Content -Path "C:\ProgramData\ssh\administrators_authorized_keys" -Value $pubKey

   # Apply required strict Windows ACL permissions
   icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
   Restart-Service sshd
   ```

3. **Test connection from PUB400**:
   ```bash
   ssh -o StrictHostKeyChecking=no YOUR_WINDOWS_USER@YOUR_GCP_VM_STATIC_IP "whoami"
   ```
   If it outputs your Windows username without prompting for a password, your SSH Server is configured!

---

## Step 3: Clone & Place the Repository

We recommend placing the project at `C:\Flash-TW`:

Open PowerShell or Command Prompt:
```cmd
cd C:\
git clone https://github.com/JanadaJayathilaka/Flash-TW.git Flash-TW
cd C:\Flash-TW
git checkout cache-clear
```

---

## Step 4: Configure and Build Frontend (Port 6001)

The frontend is a Vite + React SPA that runs on **Port 6001**:

```cmd
cd C:\Flash-TW\frontend

:: 1. Install dependencies
npm install

:: 2. Build the production bundle
npm run build
```

The production assets are built into `C:\Flash-TW\frontend\dist\`.
A lightweight, zero-dependency production server (`frontend/server.js`) is included to serve this SPA on port **6001**.

---

## Step 5: Configure Backend (Port 6002) & PM2 on Windows

### 5.1 Configure `backend\.env`
Open or edit `C:\Flash-TW\backend\.env`:
```env
# SQL Server Connection
SQL_SERVER=SQL11156466.site4now.net
SQL_DATABASE=db_aa3bf2_as400relatedtmp
SQL_USER=db_aa3bf2_as400relatedtmp_admin
SQL_PASSWORD=K@dba65bf2As400

# IBM i Schema & DSN
IBM_ODBC_DSN=Driver={IBM i Access ODBC Driver};System=pub400.com;Naming=system;KeepAlive=600;IsoLanguage=ENU;EnableScrollableCursors=0;Uid=LMDIAS;Pwd=avanka1;Pooling=true;Max Pool Size=50;
IBM_DB_SCHEMA=MEEGODA11

# Server Port (Backend runs on Port 6002)
PORT=6002

# IBM i REST API via Reverse SSH Tunnel
USE_IBMI_API=true
IBMI_API_URL=http://127.0.0.1:35005
```

### 5.2 Install Dependencies & Start PM2
PM2 on Windows runs via Node.js (`npm install -g pm2`):

```cmd
cd C:\Flash-TW\backend
npm install --omit=dev

:: Go back to project root
cd C:\Flash-TW

:: Launch Frontend (6001), Backend (6002), and Watchdog via root ecosystem.config.js
pm2 start ecosystem.config.js

:: Check status
pm2 status
```

You will see all three services running online:
1. **`flash-sales-backend`** (Port 6002)
2. **`flash-sales-frontend`** (Port 6001)
3. **`pub400-watchdog`** (Background auto-recovery loop)

### 5.3 Configure PM2 to Auto-Start on Windows Boot
To ensure PM2 launches all services automatically if the Windows VM reboots:
```cmd
npm install -g pm2-windows-startup
pm2-startup install
pm2 save
```

---

## Step 6: Configure Caddy on Windows

Caddy automatically handles HTTPS SSL certificates for your domain and routes traffic to the respective ports.

### 6.1 Edit `C:\Flash-TW\Caddyfile`
Open `C:\Flash-TW\Caddyfile`:
```caddy
flash-node-no-odbc-db2-mssql.awdspark.com {
    # 1. Reverse Proxy for Backend Express API (Port 6002)
    handle /api/* {
        reverse_proxy 127.0.0.1:6002 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # 2. Reverse Proxy for GraphQL (Port 6002)
    handle /graphql* {
        reverse_proxy 127.0.0.1:6002 {
            header_up Host {host}
            header_up X-Real-IP {remote_host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # 3. Reverse Proxy for Frontend React App (Port 6001)
    handle {
        reverse_proxy 127.0.0.1:6001
    }

    # 4. Modern Compression
    encode zstd gzip

    # 5. Access Logs
    log {
        output file C:/Flash-TW/caddy_access.log {
            roll_size 50mb
            roll_keep 5
        }
    }
}
```

### 6.2 Run Caddy
In PowerShell or Command Prompt:
```cmd
cd C:\Flash-TW

:: Validate configuration
caddy validate --config Caddyfile

:: Start Caddy in background
caddy start --config Caddyfile
```
> **Tip**: To reload Caddy after making changes, run `caddy reload --config Caddyfile`.

---

## Step 7: Update `start_all.sh` on PUB400 (IBM i)

SSH into PUB400:
```bash
ssh -p 2222 MEEGODA1@pub400.com
# Password: akila2001
```

Edit `start_all.sh`:
```bash
cd /home/MEEGODA1/akila
nano start_all.sh
```
Find the reverse tunnel loop around lines 22-26 and set your **Windows VM Static IP** and Windows username:
```bash
while true; do
  echo "[$(date)] Opening reverse SSH tunnel to Windows GCP VM (YOUR_GCP_VM_STATIC_IP:35005)..." >> tunnel.log
  ssh -p 22 -o StrictHostKeyChecking=no -o TCPKeepAlive=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -N -R 35005:127.0.0.1:35005 YOUR_WINDOWS_USER@YOUR_GCP_VM_STATIC_IP >> tunnel.log 2>&1
  echo "[$(date)] Tunnel dropped. Reconnecting in 3s..." >> tunnel.log
  sleep 3
done
```
Save and exit (`Ctrl + O`, `Enter`, `Ctrl + X`).

Start the PUB400 services:
```bash
nohup ./start_all.sh > start_all.log 2>&1 &
exit
```

---

## Step 8: The Sunday IBM i Restart & Watchdog Setup

### Why This Is Needed:
Every Sunday morning, the PUB400 server undergoes scheduled system reboot/maintenance.
- During the reboot, the reverse SSH tunnel breaks and local port `35005` dies.
- Without a watchdog, queries to IBM i will fail indefinitely until someone manually logs into PUB400.
- When PUB400 recovers, the Node.js backend on our side might still hold stale or hung HTTP connections. **Therefore, our backend (Port 6002) must be restarted once the tunnel recovers**.

### How `watchdog.js` Solves This on Windows:
We built an intelligent Node.js native watchdog daemon (`watchdog.js`):
1. **Self-Healing Bridge**: It connects directly **outbound** to `pub400.com:2222` over SSH and opens a local bridge on `http://127.0.0.1:35005`.
   - **Zero Tunnelmole**: You never have to deal with expired Tunnelmole links or 404 errors!
   - **Zero Firewall Hassle**: Outbound traffic is 100% open by default on Google Cloud.
2. **Sunday Auto-Recovery**:
   - Every Sunday morning when PUB400 reboots, the connection closes and `watchdog.js` automatically retries every 5 seconds until PUB400 is back.
   - Once PUB400 boots, `watchdog.js` re-establishes the tunnel to port 35005.
   - It automatically runs `pm2 restart flash-sales-backend` to ensure all database connection pools reset.
   - 100% automated with zero human intervention.

### Running the Watchdog:
The watchdog runs continuously under PM2 alongside your backend and frontend.

To check its logs at any time on Windows:
```cmd
pm2 logs pub400-watchdog
```

---

## Step 9: Verify & Simulate the Sunday Restart

We created `simulate_restart.js` to let you test the entire recovery process on your Windows machine:

```cmd
cd C:\Flash-TW
node simulate_restart.js
```

### What this test does:
1. SSHes into PUB400 and calls `stop_all.sh` (simulating the Sunday reboot).
2. Verifies port 35005 is DOWN on your Windows VM.
3. Triggers the watchdog recovery cycle (`watchdog.js`).
4. Waits for PUB400 to restart and reconnect the reverse tunnel.
5. Verifies port 35005 is back UP (`{"status":"UP"}`).
6. Confirms that PM2 backend (`flash-sales-backend`) automatically restarts.
7. Calls `http://127.0.0.1:6002/api/sales/available-dates` (backend port 6002).
8. Calls `http://127.0.0.1:6001` (frontend port 6001).
9. Calls `https://flash-node-no-odbc-db2-mssql.awdspark.com/api/sales/available-dates` (public HTTPS via Caddy).

You can also test directly in your browser:
- **Frontend App**: [https://flash-node-no-odbc-db2-mssql.awdspark.com](https://flash-node-no-odbc-db2-mssql.awdspark.com)
- **Backend Health**: [https://flash-node-no-odbc-db2-mssql.awdspark.com/api/health](https://flash-node-no-odbc-db2-mssql.awdspark.com/api/health)
- **Direct Frontend**: `http://localhost:6001`
- **Direct Backend**: `http://localhost:6002/api/health`

---

## Step 10: Day-to-Day Maintenance Commands on Windows

| Task | Command |
|---|---|
| View PM2 status | `pm2 status` |
| View backend logs (Port 6002) | `pm2 logs flash-sales-backend` |
| View frontend logs (Port 6001) | `pm2 logs flash-sales-frontend` |
| View watchdog logs | `pm2 logs pub400-watchdog` |
| Restart backend manually | `pm2 restart flash-sales-backend` |
| Restart frontend manually | `pm2 restart flash-sales-frontend` |
| Restart all services | `pm2 restart all` |
| Test port 35005 | `curl http://127.0.0.1:35005/health` |
| Reload Caddy | `caddy reload --config Caddyfile` |
| Stop Caddy | `caddy stop` |
| Update frontend code | `cd C:\Flash-TW\frontend && git pull && npm run build && pm2 restart flash-sales-frontend` |
| Update backend code | `cd C:\Flash-TW\backend && git pull && npm install && pm2 restart flash-sales-backend` |
