     **FREE
      // =========================================================================
      // PROGRAM: SLSDQMN.SQLRPGLE
      // PURPOSE: Native IBM i 7.1 Background DataQueue Daemon
      //          Monitors QGPL/SALES_SYNC or QGPL/SALES_REQ, executes SQL logic,
      //          builds JSON, and pushes to Node.js backend via SYSTOOLS.HTTPPOSTCLOB.
      // COMPILER: CRTSQLRPGI OBJ(QGPL/SLSDQMN) SRCFILE(QGPL/QRPGLESRC)
      //           OBJTYPE(*PGM) DBGVIEW(*SOURCE) TGTRLS(V7R1M0)
      // =========================================================================

      Ctl-Opt DftActGrp(*No) ActGrp('SLSDQMN') Option(*SrcStmt: *NoDebugIO);

      // --- Prototype: QSYS/QRCVDTAQ (Receive Data Queue) ---
      Dcl-Pr QRCVDTAQ ExtPgm('QRCVDTAQ');
        DtaqName  Char(10) Const;
        DtaqLib   Char(10) Const;
        DataLen   Packed(5:0);
        DataBuff  Char(4096);
        WaitTime  Packed(5:0) Const;
      End-Pr;

      // --- Prototype: QSYS/QSNDDTAQ (Send Data Queue) ---
      Dcl-Pr QSNDDTAQ ExtPgm('QSNDDTAQ');
        DtaqName  Char(10) Const;
        DtaqLib   Char(10) Const;
        DataLen   Packed(5:0) Const;
        DataBuff  Char(4096) Const;
      End-Pr;

      // --- Variables ---
      Dcl-S qName       Char(10) Inz('SALES_SYNC');
      Dcl-S qLib        Char(10) Inz('QGPL');
      Dcl-S qLen        Packed(5:0) Inz(4096);
      Dcl-S qMsg        Char(4096) Inz('');
      Dcl-S qWait       Packed(5:0) Inz(10); // 10 second timeout per poll

      Dcl-S backendUrl  Varchar(256) Inz('http://127.0.0.1:5001/api/sync/pivotsum');
      Dcl-S httpHeader  Varchar(256) Inz('<httpHeader><header name="Content-Type" value="application/json"/><header name="x-sync-api-key" value="flash_tw_secure_sync_key_2026"/></httpHeader>');
      Dcl-S httpResp    SqlType(Clob: 10000);
      Dcl-S jsonBody    SqlType(Clob: 2000000);

      Dcl-S wLatestDate Char(10) Inz('');
      Dcl-S wPrevDate   Char(10) Inz('');
      Dcl-S wRowCount   Int(10) Inz(0);

      // Store Row Structure
      Dcl-Ds SlsRow;
        STORE_ID     Char(10);
        DAY_CY       Packed(15:2);
        DAY_LY       Packed(15:2);
        WTD_CY       Packed(15:2);
        WTD_LY       Packed(15:2);
        QTD_CY       Packed(15:2);
        QTD_LY       Packed(15:2);
        YTD_CY       Packed(15:2);
        YTD_LY       Packed(15:2);
      End-Ds;

      // Set SQL options
      Exec SQL Set Option Commit = *None, DatFmt = *ISO, TimFmt = *ISO;

      // --- Main Daemon Processing Loop ---
      DoU *InLR;
        qMsg = *Blanks;
        qLen = 4096;

        // Receive from Data Queue
        QRCVDTAQ(qName: qLib: qLen: qMsg: qWait);

        If qLen > 0;
          // Check for graceful shutdown command
          If %Subst(qMsg: 1: 9) = '*SHUTDOWN' Or %Subst(qMsg: 1: 4) = '*END';
            *InLR = *On;
            Return;
          EndIf;

          // Process Sales Sync
          Exsr ProcessSalesSync;
        EndIf;

      EndDo;

      *InLR = *On;
      Return;


      // =========================================================================
      // SUBROUTINE: ProcessSalesSync
      // Executes calculations and pushes JSON payload to Backend REST API
      // =========================================================================
      BegSr ProcessSalesSync;

        // 1. Get Latest Transaction Date from STRSLSSMRY
        Exec SQL
          SELECT COALESCE(CHAR(MAX(SALES_ON_DATE)), '')
          INTO :wLatestDate
          FROM AHLIBR.STRSLSSMRY
          WHERE STATUS = 1;

        If wLatestDate = *Blanks;
          wLatestDate = '2026-02-10'; // Fallback
        EndIf;

        // 2. Get Previous Available Date
        Exec SQL
          SELECT COALESCE(CHAR(MAX(SALES_ON_DATE)), '')
          INTO :wPrevDate
          FROM AHLIBR.STRSLSSMRY
          WHERE STATUS = 1 AND SALES_ON_DATE < DATE(:wLatestDate);

        If wPrevDate = *Blanks;
          wPrevDate = '2026-02-09';
        EndIf;

        // 3. Build JSON Header
        jsonBody_data = '{"apiKey":"flash_tw_secure_sync_key_2026",' +
                        '"latestDate":"' + %Trim(wLatestDate) + '",' +
                        '"availableDates":["' + %Trim(wPrevDate) + '","' + %Trim(wLatestDate) + '"],' +
                        '"rows":[';
        jsonBody_len = %Len(jsonBody_data);

        // 4. Open Cursor to query store summary aggregations
        Exec SQL
          DECLARE C1 CURSOR FOR
          SELECT
            STORE_ID,
            SUM(CASE WHEN SALES_ON_DATE = DATE(:wLatestDate) THEN NET_SALES ELSE 0 END) AS DAY_CY,
            SUM(CASE WHEN SALES_ON_DATE = DATE(:wLatestDate) - 364 DAYS THEN NET_SALES ELSE 0 END) AS DAY_LY,
            SUM(CASE WHEN SALES_ON_DATE >= DATE(:wLatestDate) - 7 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) THEN NET_SALES ELSE 0 END) AS WTD_CY,
            SUM(CASE WHEN SALES_ON_DATE >= (DATE(:wLatestDate) - 364 DAYS) - 7 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) - 364 DAYS THEN NET_SALES ELSE 0 END) AS WTD_LY,
            SUM(CASE WHEN SALES_ON_DATE >= DATE(:wLatestDate) - 90 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) THEN NET_SALES ELSE 0 END) AS QTD_CY,
            SUM(CASE WHEN SALES_ON_DATE >= (DATE(:wLatestDate) - 364 DAYS) - 90 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) - 364 DAYS THEN NET_SALES ELSE 0 END) AS QTD_LY,
            SUM(CASE WHEN SALES_ON_DATE >= DATE(:wLatestDate) - 365 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) THEN NET_SALES ELSE 0 END) AS YTD_CY,
            SUM(CASE WHEN SALES_ON_DATE >= DATE(:wLatestDate) - 730 DAYS AND SALES_ON_DATE <= DATE(:wLatestDate) - 364 DAYS THEN NET_SALES ELSE 0 END) AS YTD_LY
          FROM AHLIBR.STRSLSSMRY
          WHERE STATUS = 1
          GROUP BY STORE_ID
          ORDER BY STORE_ID;

        Exec SQL OPEN C1;
        wRowCount = 0;

        // Fetch loop
        DoU SQLCOD <> 0;
          Exec SQL FETCH C1 INTO :SlsRow;
          If SQLCOD = 0;
            wRowCount += 1;
            If wRowCount > 1;
              jsonBody_data = %TrimR(jsonBody_data) + ',';
            EndIf;

            jsonBody_data = %TrimR(jsonBody_data) +
              '{"STORE_ID":"' + %Trim(STORE_ID) + '",' +
              '"TOTAL_DATE_1":' + %Char(DAY_CY) + ',' +
              '"TOTAL_DATE_2":' + %Char(DAY_LY) + ',' +
              '"TOTAL_WTD_1":'  + %Char(WTD_CY) + ',' +
              '"TOTAL_WTD_2":'  + %Char(WTD_LY) + ',' +
              '"TOTAL_QTD_1":'  + %Char(QTD_CY) + ',' +
              '"TOTAL_QTD_2":'  + %Char(QTD_LY) + ',' +
              '"TOTAL_YTD_1":'  + %Char(YTD_CY) + ',' +
              '"TOTAL_YTD_2":'  + %Char(YTD_LY) + '}';
          EndIf;
        EndDo;

        Exec SQL CLOSE C1;

        // Close JSON Array and Object
        jsonBody_data = %TrimR(jsonBody_data) + ']}';
        jsonBody_len = %Len(%TrimR(jsonBody_data));

        // 5. Native HTTP POST to Node.js Backend using SYSTOOLS.HTTPPOSTCLOB
        Exec SQL
          SELECT SYSTOOLS.HTTPPOSTCLOB(
            :backendUrl,
            :httpHeader,
            :jsonBody
          )
          INTO :httpResp
          FROM SYSIBM.SYSDUMMY1;

      EndSr;
