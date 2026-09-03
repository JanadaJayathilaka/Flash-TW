# IBM i 7.1 (Rikas) Native Deployment & Operations Guide

## Driverless Architecture: QSYS DataQueues + Stored Procedures + HTTP REST Sync

This document is the definitive, step-by-step guide for deploying and operating the Flash Sales backend integration on **IBM i 7.1 (iSeries / AS400)** without requiring:

- ❌ No IBM ODBC Driver on backend host
- ❌ No Python on IBM i
- ❌ No Node.js / NPM on IBM i
- ❌ No QSYS2 DataQueue functions (incompatible with 7.1)
- ✅ Pure native QSYS standard APIs (`QSNDDTAQ`, `QRCVDTAQ`)
- ✅ Pure native DB2 for i Stored Procedures
- ✅ Built-in OS 7.1 HTTP utilities (`SYSTOOLS.HTTPPOSTCLOB`) and ILE RPGLE / CLLE

---

## 1. Directory & Source Member Structure

All IBM i 7.1 source code is organized in [`backend/ibm_i_7.1/`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1):

| File Name                                                                                           | Object Type       | Purpose                                                                                            |
| :-------------------------------------------------------------------------------------------------- | :---------------- | :------------------------------------------------------------------------------------------------- |
| [`01_CREATE_DATAQUEUES.cl`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/01_CREATE_DATAQUEUES.cl) | `*CL` Script      | Creates native Data Queues (`SALES_REQ`, `SALES_RESP`, `SALES_SYNC`) in `QGPL`.                    |
| [`02_SP_DTAQ_WRAPPERS.sql`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/02_SP_DTAQ_WRAPPERS.sql) | `*SP` (SQL)       | Stored procedures wrapping `QSYS/QSNDDTAQ` and `QSYS/QRCVDTAQ` without `QSYS2`.                    |
| [`03_SLSDQMN.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/03_SLSDQMN.sqlrpgle)         | `*PGM` (SQLRPGLE) | Background daemon that reads Data Queue, runs SQL calculations, and POSTs JSON to Node.js backend. |
| [`04_SNDSLSEVT.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/04_SNDSLSEVT.sqlrpgle)     | `*PGM` (SQLRPGLE) | Producer program / trigger to write events to Data Queue.                                          |
| [`05_STRSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/05_STRSLSDMN.clle)             | `*PGM` (CLLE)     | Submits the background daemon job (`SLSDQMN`) to `QBATCH`.                                         |
| [`06_ENDSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/06_ENDSLSDMN.clle)             | `*PGM` (CLLE)     | Sends graceful `*SHUTDOWN` signal to Data Queue.                                                   |
| [`07_DIRECT_HTTP_PUSH.sql`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/07_DIRECT_HTTP_PUSH.sql) | SQL Script        | Direct ad-hoc testing script to test DB2 `SYSTOOLS.HTTPPOSTCLOB`.                                  |

---

## 2. Step-by-Step Deployment on IBM i (Rikas Server)

### Step 2.1: Create Source Physical Files (5250 Green Screen)

Log in to your 5250 terminal session as a user with authority (`QSECOFR` or `LAL5250D`):

```cl
CRTSRCPF FILE(QGPL/QCLLESRC) RCDLEN(112) TEXT('CLLE Source Files')
CRTSRCPF FILE(QGPL/QRPGLESRC) RCDLEN(112) TEXT('RPGLE / SQLRPGLE Source Files')
CRTSRCPF FILE(QGPL/QSQLSRC) RCDLEN(112) TEXT('SQL Scripts Source Files')
```

---

### Step 2.2: Create QSYS Data Queues

Run the following CL commands from 5250 command line or paste into a CL program:

```cl
/* 1. Request Data Queue */
CRTDTAQ DTAQ(QGPL/SALES_REQ) TYPE(*STD) MAXLEN(4096) FORCE(*NO) SEQ(*FIFO) TEXT('Flash Sales API Request Queue') AUT(*ALL)

/* 2. Response Data Queue */
CRTDTAQ DTAQ(QGPL/SALES_RESP) TYPE(*STD) MAXLEN(65535) FORCE(*NO) SEQ(*FIFO) TEXT('Flash Sales API Response Queue') AUT(*ALL)

/* 3. Batch Sync Event Data Queue */
CRTDTAQ DTAQ(QGPL/SALES_SYNC) TYPE(*STD) MAXLEN(8192) FORCE(*NO) SEQ(*FIFO) TEXT('Flash Sales Batch Ingestion Queue') AUT(*ALL)
```

---

### Step 2.3: Create SQL Stored Procedure Wrappers

Open **IBM i Access Client Solutions (ACS) -> Run SQL Scripts** (or run via `STRSQL` / `RUNSQLSTM`):

Run the contents of [`02_SP_DTAQ_WRAPPERS.sql`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/02_SP_DTAQ_WRAPPERS.sql):

```sql
SET SCHEMA AHLIBR;

-- Send Data Queue wrapper
CREATE PROCEDURE AHLIBR.SEND_DATA_QUEUE (
    IN  P_DTAQ_NAME   CHAR(10),
    IN  P_DTAQ_LIB    CHAR(10),
    IN  P_DATA_LEN    DECIMAL(5, 0),
    IN  P_DATA_BUFF   VARCHAR(4096)
)
LANGUAGE CL
DETERMINISTIC
NO SQL
EXTERNAL NAME 'QSYS/QSNDDTAQ'
PARAMETER STYLE GENERAL;

-- Receive Data Queue wrapper
CREATE PROCEDURE AHLIBR.RECEIVE_DATA_QUEUE (
    IN    P_DTAQ_NAME   CHAR(10),
    IN    P_DTAQ_LIB    CHAR(10),
    INOUT P_DATA_LEN    DECIMAL(5, 0),
    OUT   P_DATA_BUFF   VARCHAR(4096),
    IN    P_WAIT_TIME   DECIMAL(5, 0)
)
LANGUAGE CL
DETERMINISTIC
NO SQL
EXTERNAL NAME 'QSYS/QRCVDTAQ'
PARAMETER STYLE GENERAL;
```

---

### Step 2.4: Upload & Compile RPGLE & CL Programs

#### 1. Compile Daemon Program (`SLSDQMN`):

Upload [`03_SLSDQMN.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/03_SLSDQMN.sqlrpgle) to `QGPL/QRPGLESRC(SLSDQMN)`:

> **Important**: Edit the `backendUrl` line in `SLSDQMN` to point to your Node.js backend IP/hostname (e.g. `http://192.168.1.100:5001/api/sync/pivotsum` or your cloud domain).

Compile using `CRTSQLRPGI`:

```cl
CRTSQLRPGI OBJ(QGPL/SLSDQMN) +
           SRCFILE(QGPL/QRPGLESRC) +
           SRCMBR(SLSDQMN) +
           OBJTYPE(*PGM) +
           REPLACE(*YES) +
           DBGVIEW(*SOURCE) +
           CLOSQLCSR(*ENDMOD) +
           TGTRLS(V7R1M0)
```

#### 2. Compile Producer Program (`SNDSLSEVT`):

Upload [`04_SNDSLSEVT.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/04_SNDSLSEVT.sqlrpgle) to `QGPL/QRPGLESRC(SNDSLSEVT)`.

Compile using `CRTSQLRPGI`:

```cl
CRTSQLRPGI OBJ(QGPL/SNDSLSEVT) +
           SRCFILE(QGPL/QRPGLESRC) +
           SRCMBR(SNDSLSEVT) +
           OBJTYPE(*PGM) +
           REPLACE(*YES) +
           DBGVIEW(*SOURCE) +
           TGTRLS(V7R1M0)
```

#### 3. Compile CL Control Programs:

Upload [`05_STRSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/05_STRSLSDMN.clle) to `QGPL/QCLLESRC(STRSLSDMN)` and [`06_ENDSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/06_ENDSLSDMN.clle) to `QGPL/QCLLESRC(ENDSLSDMN)`.

Compile using `CRTBNDCL`:

```cl
CRTBNDCL PGM(QGPL/STRSLSDMN) SRCFILE(QGPL/QCLLESRC) SRCMBR(STRSLSDMN) REPLACE(*YES)
CRTBNDCL PGM(QGPL/ENDSLSDMN) SRCFILE(QGPL/QCLLESRC) SRCMBR(ENDSLSDMN) REPLACE(*YES)
```

---

## 3. Operational Commands (Green Screen)

### Starting the Background Daemon

To launch the worker daemon in `QBATCH`:

```cl
CALL PGM(QGPL/STRSLSDMN)
```

Check active job status:

```cl
WRKACTJOB JOB(SLSDQMN)
```

### Triggering a Manual Data Sync

To trigger a calculation and push to Node.js backend on-demand:

```cl
CALL PGM(QGPL/SNDSLSEVT)
```

### Stopping the Background Daemon Gracefully

```cl
CALL PGM(QGPL/ENDSLSDMN)
```

---

## 4. Automating Daily Synchronization (IBM i Job Scheduler)

To automatically push updated sales pivot data to the Node backend every night after daily batches complete (e.g. at 23:30):

```cl
ADDJOBSCDE JOB(SLS_SYNCDQ) +
           CMD(CALL PGM(QGPL/SNDSLSEVT)) +
           FRQ(*WEEKLY) +
           SCDDATE(*NONE) +
           SCDDAYS(*ALL) +
           SCDTIME('23:30:00') +
           TEXT('Flash Sales Nightly DataQueue Push')
```

---

## 5. Troubleshooting & Verification

| Issue                             | Cause                                                 | Solution                                                                                                                 |
| :-------------------------------- | :---------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| `HTTP Error / Connection Refused` | Node.js backend port unreachable from IBM i partition | Ensure firewall on backend server allows inbound TCP traffic on port `5001`. Test from 5250 using `PING '<BACKEND_IP>'`. |
| `SYSTOOLS.HTTPPOSTCLOB not found` | DB2 XML/HTTP SYSTOOLS functions not initialized       | Run `CALL QSYS2.RESTORE_SYSTOOLS()` or ensure standard IBM i 7.1 Database PTFs are installed.                            |
| `DataQueue locked or full`        | Max length exceeded                                   | Clear queue using `CALL AHLIBR.CLEAR_DATA_QUEUE('SALES_SYNC', 'QGPL')` or delete and recreate with larger `MAXLEN`.      |
