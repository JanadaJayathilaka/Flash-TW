     **FREE
      // =========================================================================
      // PROGRAM: SNDSLSEVT.SQLRPGLE
      // PURPOSE: Send Sales Sync Event to QSYS Data Queue QGPL/SALES_SYNC
      //          Can be called from CL, Job Scheduler, or Database Triggers.
      // COMPILER: CRTSQLRPGI OBJ(QGPL/SNDSLSEVT) SRCFILE(QGPL/QRPGLESRC)
      //           OBJTYPE(*PGM) DBGVIEW(*SOURCE) TGTRLS(V7R1M0)
      // =========================================================================

      Ctl-Opt DftActGrp(*No) ActGrp('SNDSLSEVT') Option(*SrcStmt: *NoDebugIO);

      // --- Prototype: QSYS/QSNDDTAQ ---
      Dcl-Pr QSNDDTAQ ExtPgm('QSNDDTAQ');
        DtaqName  Char(10) Const;
        DtaqLib   Char(10) Const;
        DataLen   Packed(5:0) Const;
        DataBuff  Char(4096) Const;
      End-Pr;

      // Program Entry Parameters (Optional custom date override)
      Dcl-Pi SNDSLSEVT;
        InDate1 Char(10) Options(*Nopass);
        InDate2 Char(10) Options(*Nopass);
      End-Pi;

      Dcl-S qName Char(10) Inz('SALES_SYNC');
      Dcl-S qLib  Char(10) Inz('QGPL');
      Dcl-S qLen  Packed(5:0) Inz(0);
      Dcl-S qMsg  Char(4096) Inz('');

      // Build Message
      If %Parms >= 2;
        qMsg = 'SYNC_DATES:' + %Trim(InDate1) + ':' + %Trim(InDate2);
      ElseIf %Parms = 1;
        qMsg = 'SYNC_DATE:' + %Trim(InDate1);
      Else;
        qMsg = 'SYNC_ALL_LATEST';
      EndIf;

      qLen = %Len(%Trim(qMsg));

      // Call Native QSNDDTAQ API
      QSNDDTAQ(qName: qLib: qLen: qMsg);

      *InLR = *On;
      Return;
