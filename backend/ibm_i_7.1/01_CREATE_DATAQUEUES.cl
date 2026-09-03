/* ========================================================================= */
/* SCRIPT: 01_CREATE_DATAQUEUES.cl                                           */
/* PURPOSE: Create Native QSYS Standard Data Queues on IBM i 7.1 (Rikas)      */
/* TARGET LIBRARY: QGPL (or replace with AHLIBR / KANDY)                     */
/* COMPATIBILITY: IBM i 7.1 Standard OS Default Libraries                   */
/* ========================================================================= */

/* 1. Create Sales Request Data Queue (Input trigger queue for requests) */
DLTDTAQ DTAQ(QGPL/SALES_REQ)
MONMSG MSGID(CPF2105) /* Ignore error if object does not exist */

CRTDTAQ DTAQ(QGPL/SALES_REQ) +
        TYPE(*STD) +
        MAXLEN(4096) +
        FORCE(*NO) +
        SEQ(*FIFO) +
        TEXT('Flash Sales API Request Queue') +
        AUT(*ALL)

/* 2. Create Sales Response Data Queue (Output queue for responses) */
DLTDTAQ DTAQ(QGPL/SALES_RESP)
MONMSG MSGID(CPF2105)

CRTDTAQ DTAQ(QGPL/SALES_RESP) +
        TYPE(*STD) +
        MAXLEN(65535) +
        FORCE(*NO) +
        SEQ(*FIFO) +
        TEXT('Flash Sales API Response Queue') +
        AUT(*ALL)

/* 3. Create Sales Event Sync Data Queue (Background trigger/event queue) */
DLTDTAQ DTAQ(QGPL/SALES_SYNC)
MONMSG MSGID(CPF2105)

CRTDTAQ DTAQ(QGPL/SALES_SYNC) +
        TYPE(*STD) +
        MAXLEN(8192) +
        FORCE(*NO) +
        SEQ(*FIFO) +
        TEXT('Flash Sales Batch Ingestion Queue') +
        AUT(*ALL)

/* Verify Queues were created */
DSPOBJD OBJ(QGPL/SALES_*) OBJTYPE(*DTAQ)
