# IBM i 7.1 Driverless Backend Architecture & QSYS DataQueue Integration Guide

## 1. Overview & System Architecture

The **Flash-TW** backend uses a **Driverless Dual-Engine Architecture** specifically designed for **IBM i 7.1 (Rikas)** and Microsoft SQL Server:
- **Zero Client Driver Dependency**: Eliminates the IBM i Access ODBC Driver / `odbc` npm package requirement on the Node.js backend.
- **Native IBM i 7.1 QSYS Data Queues**: Uses standard OS system APIs (`QSYS/QSNDDTAQ`, `QSYS/QRCVDTAQ`) rather than incompatible `QSYS2` table functions.
- **Pure Native IBM i Technologies**: No Python, no Node.js, and no external package managers are required on the IBM i partition (Rikas).
- **HTTP REST Sync Engine**: Communicates with the Node backend via standard HTTP REST payloads using DB2's built-in `SYSTOOLS.HTTPPOSTCLOB` and ILE RPGLE / CLLE programs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             Frontend Client                                 │
│                 (React / Vite Web Application & Sales App)                  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST API / GraphQL
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Node.js Express Backend (Driverless)                   │
│                     (Apollo Server GraphQL + Express)                       │
│                                                                             │
│   ┌────────────────────────────────┐     ┌──────────────────────────────┐   │
│   │      IBM Sync Store & API      │     │    MSSQL Connection Pool     │   │
│   │   (In-Memory + Disk Storage)   │     │      (mssql npm package)     │   │
│   │  /api/sync/* & /api/sales/*    │     └──────────────┬───────────────┘   │
│   └────────────────▲───────────────┘                    │                   │
└────────────────────┼────────────────────────────────────┼───────────────────┘
                     │ Pure JSON over HTTP                │
                     │ (No IBM Driver Required!)          ▼
                     │                          ┌───────────────────────────┐
                     │                          │   Microsoft SQL Server    │
                     │                          │  Host: SQL11156466        │
                     │                          │  DB: db_aa3bf2_as400...   │
                     │                          └───────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   IBM i 7.1 (Rikas - Host: rikas.rikascom.net)              │
│                     (No Python / No NPM / OS Version 7.1)                   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                QSYS Native Data Queues (QGPL)                       │   │
│   │  - SALES_REQ (CRTDTAQ MAXLEN 4096)                                  │   │
│   │  - SALES_RESP (CRTDTAQ MAXLEN 65535)                                │   │
│   │  - SALES_SYNC (CRTDTAQ MAXLEN 8192)                                 │   │
│   └──────────────────────┬──────────────────────▲───────────────────────┘   │
│                          │                      │                           │
│              CALL QRCVDTAQ                      CALL QSNDDTAQ               │
│                          ▼                      │                           │
│   ┌─────────────────────────────────────────────┴───────────────────────┐   │
│   │                   RPGLE Background Daemon (SLSDQMN)                 │   │
│   │   1. Reads trigger/request from Data Queue via QRCVDTAQ             │   │
│   │   2. Calls Stored Procedure: AHLIBR.GET_SALES_PVT_SUMRY             │   │
│   │   3. Extracts Latest Date / Transaction summaries                   │   │
│   │   4. Formats JSON payload natively                                  │   │
│   │   5. Pushes to Backend API via SYSTOOLS.HTTPPOSTCLOB                │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Backend Configuration (`backend/.env`)

The backend environment file is configured as follows:

```ini
# SQL Server Connection (Metadata, Calendar, Currency Rates)
SQL_SERVER=SQL11156466.site4now.net
SQL_DATABASE=db_aa3bf2_as400related
SQL_USER=db_aa3bf2_as400related_admin
SQL_PASSWORD=K@dba65bf2As400

# IBM i HTTP Sync & DataQueue Integration (Driverless - No ODBC Needed)
SYNC_SECRET_KEY=flash_tw_secure_sync_key_2026
AUTO_SAVE_SYNC_DATA=true

# Server Port
PORT=5001
```

---

## 3. IBM i Sync Endpoints

The Node.js backend exposes dedicated ingestion endpoints for IBM i 7.1:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/sync/pivotsum` | Ingests pre-computed sales pivot summary rows from IBM i 7.1 RPGLE / SP. |
| `POST` | `/api/sync/latest-date` | Updates current latest sales date and available dates. |
| `POST` | `/api/sync/sales-daily` | Ingests daily sales time-series for chart & SMA analytics. |
| `POST` | `/api/sync/dtaq-event` | Receives raw DataQueue event messages. |
| `GET` | `/api/sync/status` | Returns sync status, row counts, and last push timestamp. |

---

## 4. IBM i 7.1 Native Source Codes

All source files are located in [`backend/ibm_i_7.1/`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1):

1. **[`01_CREATE_DATAQUEUES.cl`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/01_CREATE_DATAQUEUES.cl)**: Creates `SALES_REQ`, `SALES_RESP`, and `SALES_SYNC` in `QGPL`.
2. **[`02_SP_DTAQ_WRAPPERS.sql`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/02_SP_DTAQ_WRAPPERS.sql)**: SQL stored procedure wrappers calling `QSYS/QSNDDTAQ` and `QSYS/QRCVDTAQ`.
3. **[`03_SLSDQMN.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/03_SLSDQMN.sqlrpgle)**: ILE RPGLE daemon that polls Data Queue, queries `AHLIBR.STRSLSSMRY`, and pushes JSON via `SYSTOOLS.HTTPPOSTCLOB`.
4. **[`04_SNDSLSEVT.sqlrpgle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/04_SNDSLSEVT.sqlrpgle)**: Utility to put sync triggers onto the Data Queue.
5. **[`05_STRSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/05_STRSLSDMN.clle)** & **[`06_ENDSLSDMN.clle`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/06_ENDSLSDMN.clle)**: CL programs to start and stop background worker in `QBATCH`.
6. **[`DEPLOYMENT_GUIDE_7.1.md`](file:///d:/Projects/Flash-TW/backend/ibm_i_7.1/DEPLOYMENT_GUIDE_7.1.md)**: Full deployment and compilation guide for Rikas server.
