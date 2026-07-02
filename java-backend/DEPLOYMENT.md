# Flash Sales — Java Spring Boot Backend Deployment Guide

Step-by-step instructions for hosting the Java Spring Boot backend on Ubuntu AWS with PM2 + Caddy.

---

## Prerequisites

| What | Status |
|------|--------|
| Ubuntu AWS EC2 instance | ✅ Already running |
| PM2 installed | ✅ Already installed |
| Caddy installed | ✅ Already installed |
| Java 21 JDK | ❌ Need to install |
| Maven | ❌ Need to install (or build locally and transfer JAR) |

---

## Step 1: Install Java 21 on Ubuntu

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
```

Verify:
```bash
java -version
# Expected: openjdk version "21.x.x"
```

---

## Step 2: Install Maven on Ubuntu

```bash
sudo apt install -y maven
```

Verify:
```bash
mvn -version
# Expected: Apache Maven 3.x.x
```

---

## Step 3: Transfer the Project to the Server

### Option A: Git (Recommended)

```bash
cd /home/ubuntu/flash
git pull origin main
```

### Option B: SCP the JAR directly

Build locally first:
```bash
# On your Windows machine
cd d:\Projects\Flash-TW\java-backend
mvn clean package -DskipTests
```

Then transfer:
```bash
scp -i your-key.pem target/flash-backend-1.0.0.jar ubuntu@your-server-ip:/home/ubuntu/flash/java-backend/
```

---

## Step 4: Build the JAR on the Server

> Skip this step if you used Option B above.

```bash
cd /home/ubuntu/flash/java-backend
mvn clean package -DskipTests
```

This creates: `target/flash-backend-1.0.0.jar`

---

## Step 5: Create Production `application.properties`

Create a `config/` folder next to the JAR:

```bash
mkdir -p /home/ubuntu/flash/java-backend/config
nano /home/ubuntu/flash/java-backend/config/application.properties
```

Paste this (update credentials for production):

```properties
# ─── Server ───
server.port=5001

# ─── IBM i (AS/400) via JT400 JDBC ───
ibm.jdbc.url=jdbc:as400://rikas.rikascom.net;naming=system;date format=iso;libraries=AHLIBR,KANDY;prompt=false
ibm.jdbc.username=lal5250d
ibm.jdbc.password=dias2440
ibm.jdbc.pool.max-size=5
ibm.jdbc.pool.min-idle=1
ibm.jdbc.pool.connection-timeout=30000

# ─── SQL Server ───
sqlserver.jdbc.url=jdbc:sqlserver://SQL11156466.site4now.net;databaseName=db_aa3bf2_as400related;encrypt=true;trustServerCertificate=true
sqlserver.jdbc.username=db_aa3bf2_as400related_admin
sqlserver.jdbc.password=K@dba65bf2As400
sqlserver.jdbc.pool.max-size=10
sqlserver.jdbc.pool.connection-timeout=30000

# ─── Cache ───
cache.store-details.ttl=300000

# ─── GraphQL ───
spring.graphql.path=/graphql
spring.graphql.graphiql.enabled=false

# ─── Logging ───
logging.level.com.flash=INFO
```

> **Note:** Spring Boot automatically picks up `config/application.properties` from the working directory. No extra flags needed.

---

## Step 6: Stop the Old Node.js Backend

```bash
# See what's running
pm2 list

# Stop and remove the old Node.js backend
# Replace 'flash-ba' or 'flash-backend' with the actual PM2 process name
pm2 stop flash-ba
pm2 delete flash-ba
```

---

## Step 7: Create PM2 Ecosystem File

```bash
nano /home/ubuntu/flash/java-backend/ecosystem.config.js
```

Paste:

```javascript
module.exports = {
  apps: [
    {
      name: "flash-java",
      script: "java",
      args: "-jar target/flash-backend-1.0.0.jar",
      cwd: "/home/ubuntu/flash/java-backend",
      interpreter: "none",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        SERVER_PORT: 5001,
      },
    },
  ],
};
```

---

## Step 8: Start the Spring Boot Backend

```bash
cd /home/ubuntu/flash/java-backend
pm2 start ecosystem.config.js
```

---

## Step 9: Verify

```bash
# Check PM2 status (should show 'online')
pm2 list

# Check logs
pm2 logs flash-java --lines 50

# Test health endpoint
curl http://localhost:5001/api/health
# Expected: {"status":"ok","timestamp":"2026-..."}

# Test latest-date endpoint
curl http://localhost:5001/api/sales/latest-date
```

---

## Step 10: Save PM2 (Survive Reboots)

```bash
pm2 save
pm2 startup
# Run the command that PM2 outputs (starts with 'sudo env ...')
```

---

## Step 11: Update Caddy (NO Changes Needed!)

Your existing Caddyfile already proxies `/api/*` and `/graphql` to `localhost:5001`:

```
flash.awdspark.com {
    handle /api/* {
        reverse_proxy localhost:5001
    }
    handle /graphql {
        reverse_proxy localhost:5001
    }
    handle {
        root * /home/ubuntu/flash/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```

No changes needed. Optionally reload:
```bash
sudo caddy reload --config /etc/caddy/Caddyfile
```

---

## Step 12: Rebuild Frontend (One-time)

The frontend label was updated to say "Java Spring Boot" instead of "NodeJS":

```bash
cd /home/ubuntu/flash/frontend
git pull origin main
npm run build
```

---

## Step 13: Test the Full App

Open your browser and go to:
```
https://flash.awdspark.com/
```

Everything should work exactly as before — same API, same data, just powered by Java.

---

## Quick Reference — PM2 Commands

| Command | What it does |
|---------|-------------|
| `pm2 list` | Show all processes |
| `pm2 logs flash-java` | View real-time logs |
| `pm2 logs flash-java --lines 200` | View last 200 log lines |
| `pm2 restart flash-java` | Restart backend |
| `pm2 stop flash-java` | Stop backend |
| `pm2 start flash-java` | Start backend |
| `pm2 delete flash-java` | Remove from PM2 |
| `pm2 monit` | Interactive dashboard |

---

## Troubleshooting

### `java: command not found`
```bash
sudo apt install -y openjdk-21-jdk
```

### Port 5001 already in use
```bash
sudo lsof -i :5001
kill -9 <PID>
```

### App keeps restarting in PM2
```bash
pm2 logs flash-java --lines 200
# Common causes:
# - Java version too old (need 17+)
# - Missing config/application.properties
# - Database unreachable (check security groups)
```

### IBM i connection fails
JT400 uses TCP port 449. Ensure your EC2 security group allows **outbound** traffic:
```bash
telnet rikas.rikascom.net 449
```

### SQL Server connection fails
```bash
telnet SQL11156466.site4now.net 1433
```

### Want to switch back to Node.js?
```bash
pm2 stop flash-java
pm2 delete flash-java
cd /home/ubuntu/flash/backend
pm2 start ecosystem.config.js  # or: pm2 start src/server.js --name flash-backend
```
