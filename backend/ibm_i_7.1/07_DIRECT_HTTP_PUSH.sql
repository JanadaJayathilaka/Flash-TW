-- =============================================================================
-- SCRIPT: 07_DIRECT_HTTP_PUSH.sql
-- PURPOSE: Direct SQL Test on IBM i 7.1 to verify network connectivity and
--          SYSTOOLS.HTTPPOSTCLOB pushing JSON directly to Node.js backend.
-- RUN VIA: IBM i Access Client Solutions (ACS) Run SQL Scripts or STRSQL
-- =============================================================================

-- Step 1: Push Latest Date to Node.js Backend API
SELECT SYSTOOLS.HTTPPOSTCLOB(
    'http://<BACKEND_HOST_OR_IP>:5001/api/sync/latest-date',
    '<httpHeader><header name="Content-Type" value="application/json"/><header name="x-sync-api-key" value="flash_tw_secure_sync_key_2026"/></httpHeader>',
    '{"apiKey":"flash_tw_secure_sync_key_2026","latestDate":"2026-02-10","availableDates":["2026-02-09","2026-02-10"]}'
) AS HTTP_RESPONSE
FROM SYSIBM.SYSDUMMY1;


-- Step 2: Trigger a Data Queue Event from SQL using our SP Wrapper
CALL AHLIBR.SEND_DATA_QUEUE(
    'SALES_SYNC',
    'QGPL',
    15,
    'SYNC_ALL_LATEST'
);


-- Step 3: Verify Data Queue status (Record count)
-- Note: In IBM i 7.1, to check if entries exist, we can call QRCVDTAQ with 0 wait time:
-- CALL AHLIBR.RECEIVE_DATA_QUEUE('SALES_SYNC', 'QGPL', ?, ?, 0);
