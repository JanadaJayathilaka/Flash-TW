-- =============================================================================
-- SCRIPT: 02_SP_DTAQ_WRAPPERS.sql
-- PURPOSE: DB2 SQL Stored Procedures wrapping Native QSYS DataQueue APIs for IBM i 7.1
-- TARGET SCHEMA: AHLIBR (or QGPL / KANDY)
-- COMPATIBILITY: IBM i 7.1 Default DB2 (Does NOT use QSYS2 table functions)
-- =============================================================================

-- Set target schema
SET SCHEMA AHLIBR;

-- -----------------------------------------------------------------------------
-- 1. Stored Procedure: AHLIBR.SEND_DATA_QUEUE
-- Calls QSYS.QSNDDTAQ to put a message on a Data Queue
-- -----------------------------------------------------------------------------
DROP PROCEDURE AHLIBR.SEND_DATA_QUEUE;

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

COMMENT ON PROCEDURE AHLIBR.SEND_DATA_QUEUE IS 'Sends message to standard QSYS Data Queue via QSNDDTAQ';


-- -----------------------------------------------------------------------------
-- 2. Stored Procedure: AHLIBR.RECEIVE_DATA_QUEUE
-- Calls QSYS.QRCVDTAQ to read a message from a Data Queue with wait timeout
-- (Pass WAIT_TIME = -1 for infinite wait, 0 for immediate return, >0 for seconds)
-- -----------------------------------------------------------------------------
DROP PROCEDURE AHLIBR.RECEIVE_DATA_QUEUE;

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

COMMENT ON PROCEDURE AHLIBR.RECEIVE_DATA_QUEUE IS 'Receives message from standard QSYS Data Queue via QRCVDTAQ';


-- -----------------------------------------------------------------------------
-- 3. Stored Procedure: AHLIBR.CLEAR_DATA_QUEUE
-- Calls QSYS.QCLRDTAQ to remove all entries from a Data Queue
-- -----------------------------------------------------------------------------
DROP PROCEDURE AHLIBR.CLEAR_DATA_QUEUE;

CREATE PROCEDURE AHLIBR.CLEAR_DATA_QUEUE (
    IN  P_DTAQ_NAME   CHAR(10),
    IN  P_DTAQ_LIB    CHAR(10)
)
LANGUAGE CL
DETERMINISTIC
NO SQL
EXTERNAL NAME 'QSYS/QCLRDTAQ'
PARAMETER STYLE GENERAL;

COMMENT ON PROCEDURE AHLIBR.CLEAR_DATA_QUEUE IS 'Clears all messages from standard QSYS Data Queue via QCLRDTAQ';
