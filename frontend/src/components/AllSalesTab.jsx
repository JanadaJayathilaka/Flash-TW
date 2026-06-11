import React, { useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { formatNumber, formatPercent } from '../utils/dateUtils';

export default function AllSalesTab({
  data,
  loading,
  weekNumber,
  dayNumber,
  quarterNumber,
  calendarDayOfMonth = 0,
  calendarMonthNumber = 0,
  calendarMode,
  search,
  onBindExportActions,
}) {
  
  // Parse variables
  const cyYear = new Date().getFullYear();
  const lyYear = cyYear - 1;
  const wk = String(weekNumber).padStart(2, '0');
  const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
  const isCalendar = calendarMode === 'calendar';
  const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
  const monthStr = String(calendarMonthNumber).padStart(2, '0');

  // Parse data and groups
  const { territories, grandTotal } = useMemo(() => {
    const territories = {};
    let grandTotal = null;

    data.forEach((r) => {
      if (r.IS_GRAND_TOTAL) {
        grandTotal = r;
        return;
      }
      if (r.IS_TERRITORY_TOTAL) {
        return; // We will recalculate territory totals based on filtered stores or show the pre-computed totals
      }
      const t = r.TERRITORY || 'Unknown';
      if (!territories[t]) territories[t] = [];
      territories[t].push(r);
    });

    Object.keys(territories).forEach((t) => {
      territories[t].sort((a, b) => (a.STORE_NAME ?? '').localeCompare(b.STORE_NAME ?? ''));
    });

    // Apply search filter
    const terms = search.toLowerCase().split('++').map((s) => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      Object.keys(territories).forEach((t) => {
        const territoryMatched = terms.some((q) => t.toLowerCase().includes(q));
        if (territoryMatched) return; // Keep all stores in this territory
        
        territories[t] = territories[t].filter((r) =>
          terms.some(
            (q) =>
              (r.STORE_NAME ?? '').toLowerCase().includes(q) ||
              (r.STORE_ID ?? '').toString().includes(q)
          )
        );
      });
    }

    return { territories, grandTotal };
  }, [data, search]);

  const sortedTerritories = useMemo(() => {
    return Object.entries(territories)
      .filter(([, stores]) => stores.length > 0)
      .sort(([nameA, storesA], [nameB, storesB]) => {
        const regA = Number(storesA[0]?.REGION_ID) || 0;
        const regB = Number(storesB[0]?.REGION_ID) || 0;
        if (regA !== regB) {
          return regA - regB;
        }
        return nameA.localeCompare(nameB);
      });
  }, [territories]);

  // Recalculate territory totals dynamically based on filtered stores (or just use precalculated if unfiltered)
  const computeTerritoryTotal = (territoryName, stores) => {
    const sum = (field) => stores.reduce((acc, s) => acc + (s[field] ?? 0), 0);
    const cyDay = sum('DAY_SALES_CY');
    const lyDay = sum('DAY_SALES_LY');
    const cyWtd = sum('WTD_SALES_CY');
    const lyWtd = sum('WTD_SALES_LY');
    const cyQtd = sum('QTD_SALES_CY');
    const lyQtd = sum('QTD_SALES_LY');
    const cyYtd = sum('YTD_SALES_CY');
    const lyYtd = sum('YTD_SALES_LY');

    const calcComp = (cy, ly) => {
      if (cy === 0 || ly === 0) return 0;
      return ((cy - ly) / ly) * 100;
    };

    const regionPrefix = stores[0]?.REGION_ID ? `${stores[0].REGION_ID} ` : '';

    return {
      STORE_NAME: `${regionPrefix}${territoryName} Total`,
      IS_TERRITORY_TOTAL: true,
      DAY_SALES_LY: lyDay,
      DAY_SALES_CY: cyDay,
      DAY_SALES_COMP: calcComp(cyDay, lyDay),
      WTD_SALES_LY: lyWtd,
      WTD_SALES_CY: cyWtd,
      WTD_SALES_COMP: calcComp(cyWtd, lyWtd),
      QTD_SALES_LY: lyQtd,
      QTD_SALES_CY: cyQtd,
      QTD_SALES_COMP: calcComp(cyQtd, lyQtd),
      YTD_SALES_LY: lyYtd,
      YTD_SALES_CY: cyYtd,
      YTD_SALES_COMP: calcComp(cyYtd, lyYtd),
    };
  };

  // Build rows array representing current table display order
  const displayRows = useMemo(() => {
    const rows = [];
    sortedTerritories.forEach(([territoryName, stores]) => {
      rows.push(...stores);
      rows.push(computeTerritoryTotal(territoryName, stores));
    });
    if (grandTotal) {
      rows.push(grandTotal);
    }
    return rows;
  }, [sortedTerritories, grandTotal]);

  const DT_1_Str = useCallback(() => {
    if (data.length > 0) {
      const cyRow = data.find(r => r.DAY_SALES_CY > 0 || r.WTD_SALES_CY > 0);
      if (cyRow && cyRow.DATE_OPENED) return cyRow.DATE_OPENED;
    }
    return new Date().toISOString().split('T')[0];
  }, [data]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const headers = [
      'Store / Territory',
      `${lyYear} Wk ${wk} Day ${dayDisplay} Net`,
      `${cyYear} Wk ${wk} Day ${dayDisplay} Net`,
      '1 Day Sales Comp',
      `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`} ${isCalendar ? 'MTD' : 'WTD'} Net`,
      `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`} ${isCalendar ? 'MTD' : 'WTD'} Net`,
      `${isCalendar ? 'MTD' : 'WTD'} Sales Comp`,
      `${lyYear} Q${q} QTD Net`,
      `${cyYear} Q${q} QTD Net`,
      'QTD Sales Comp',
      `${lyYear} YTD Net`,
      `${cyYear} YTD Net`,
      'YTD Sales Comp',
    ];

    const rows = displayRows.map((r) => [
      r.IS_GRAND_TOTAL ? 'Grand Total' : r.STORE_NAME,
      Math.round(r.DAY_SALES_LY ?? 0),
      Math.round(r.DAY_SALES_CY ?? 0),
      `${(r.DAY_SALES_COMP ?? 0).toFixed(2)}%`,
      Math.round(r.WTD_SALES_LY ?? 0),
      Math.round(r.WTD_SALES_CY ?? 0),
      `${(r.WTD_SALES_COMP ?? 0).toFixed(2)}%`,
      Math.round(r.QTD_SALES_LY ?? 0),
      Math.round(r.QTD_SALES_CY ?? 0),
      `${(r.QTD_SALES_COMP ?? 0).toFixed(2)}%`,
      Math.round(r.YTD_SALES_LY ?? 0),
      Math.round(r.YTD_SALES_CY ?? 0),
      `${(r.YTD_SALES_COMP ?? 0).toFixed(2)}%`,
    ]);

    const csvContent =
      '\uFEFF' +
      [headers, ...rows]
        .map((r) => r.map((val) => {
          const s = String(val ?? '');
          return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(','))
        .join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `FlashSales_${calendarMode}_${DT_1_Str()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [displayRows, lyYear, wk, dayDisplay, cyYear, isCalendar, monthStr, q, calendarMode, DT_1_Str]);

  // Export Excel
  const handleExportExcel = useCallback(() => {
    const COLS = [
      { header: 'Store / Territory', align: 'left', numFmt: null, isComp: false, isCY: false },
      { header: `${lyYear} Wk ${wk} Day ${dayDisplay}\nNet Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} Wk ${wk} Day ${dayDisplay}\nNet Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: '1 Day\nSales Comp', align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}\n${isCalendar ? 'MTD' : 'WTD'} Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}\n${isCalendar ? 'MTD' : 'WTD'} Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: `${isCalendar ? 'MTD' : 'WTD'}\nSales Comp`, align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear} Q${q}\nQTD Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} Q${q}\nQTD Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: 'QTD\nSales Comp', align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear}\nYTD Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear}\nYTD Net Sales`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: 'YTD\nSales Comp', align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
    ];

    const RIGHT_BORDER_COLS = new Set([0, 3, 6, 9, 12]);
    const BORDER_SIDE = { style: 'thin', color: { rgb: '808080' } };

    const makeBorder = (top, bottom, right) => {
      const b = {};
      if (top) b.top = BORDER_SIDE;
      if (bottom) b.bottom = BORDER_SIDE;
      if (right) b.right = BORDER_SIDE;
      return b;
    };

    const aoa = [COLS.map((c) => c.header)];
    displayRows.forEach((row) => {
      aoa.push([
        row.IS_GRAND_TOTAL ? 'Grand Total' : row.STORE_NAME,
        row.DAY_SALES_LY ?? 0,
        row.DAY_SALES_CY ?? 0,
        (row.DAY_SALES_COMP ?? 0) / 100,
        row.WTD_SALES_LY ?? 0,
        row.WTD_SALES_CY ?? 0,
        (row.WTD_SALES_COMP ?? 0) / 100,
        row.QTD_SALES_LY ?? 0,
        row.QTD_SALES_CY ?? 0,
        (row.QTD_SALES_COMP ?? 0) / 100,
        row.YTD_SALES_LY ?? 0,
        row.YTD_SALES_CY ?? 0,
        (row.YTD_SALES_COMP ?? 0) / 100,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const totalRowsCount = aoa.length;

    for (let r = 0; r < totalRowsCount; r++) {
      const isHeader = r === 0;
      const dataRow = displayRows[r - 1];
      const isGrandTotal = !isHeader && !!dataRow?.IS_GRAND_TOTAL;
      const isTerr = !isHeader && !!dataRow?.IS_TERRITORY_TOTAL;
      const isBoldRow = isHeader || isGrandTotal || isTerr;

      for (let c = 0; c < COLS.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: '', t: 's' };

        const col = COLS[c];
        const hasRightBdr = RIGHT_BORDER_COLS.has(c);

        const border = makeBorder(
          isGrandTotal,
          isHeader || isGrandTotal || isTerr,
          hasRightBdr
        );

        let fill;
        if (isHeader) fill = { fgColor: { rgb: 'D9E1F2' }, patternType: 'solid' };
        else if (isGrandTotal) fill = { fgColor: { rgb: 'E4EAF2' }, patternType: 'solid' };
        else if (isTerr) fill = { fgColor: { rgb: 'EBF3FB' }, patternType: 'solid' };

        let fontColor;
        if (!isHeader && col.isComp) {
          const v = aoa[r][c];
          fontColor = v >= 0 ? '15803D' : 'DC2626';
        }

        const cellStyle = {
          font: {
            name: 'Arial',
            sz: 9,
            bold: isBoldRow,
            italic: !isHeader && col.isCY,
            ...(fontColor ? { color: { rgb: fontColor } } : {}),
          },
          alignment: {
            horizontal: col.align,
            vertical: 'center',
            wrapText: true,
          },
          border,
          ...(fill ? { fill } : {}),
        };

        if (!isHeader && col.numFmt) {
          cellStyle.numFmt = col.numFmt;
          ws[addr].t = 'n';
        }

        ws[addr].s = cellStyle;
      }
    }

    ws['!sheetViews'] = [{
      workbookViewId: 0,
      pane: { ySplit: 1, topLeftCell: 'B2', activePane: 'bottomLeft', state: 'frozen' },
    }];

    ws['!cols'] = [
      { wch: 30 }, // Store
      { wch: 12 }, { wch: 12 }, { wch: 11 },
      { wch: 12 }, { wch: 12 }, { wch: 11 },
      { wch: 12 }, { wch: 12 }, { wch: 11 },
      { wch: 12 }, { wch: 12 }, { wch: 11 },
    ];

    ws['!rows'] = [{ hpt: 35 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Flash Sales');
    
    // Write and trigger download
    XLSX.writeFile(wb, `FlashSales_${calendarMode}_${DT_1_Str()}.xlsx`);
  }, [displayRows, lyYear, wk, dayDisplay, cyYear, isCalendar, monthStr, q, calendarMode, DT_1_Str]);

  // Bind export triggers to parent
  React.useEffect(() => {
    if (onBindExportActions) {
      onBindExportActions({
        exportExcel: handleExportExcel,
        exportCSV: handleExportCSV,
        printPDF: () => window.print(),
      });
    }
  }, [onBindExportActions, handleExportExcel, handleExportCSV]);

  if (loading) {
    return <div className="loading-view">Loading sales data...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div className="table-wrapper">
      <table className="sales-table">
        <thead>
          <tr>
            <th className="border-right"><br />LOCATION/TERRITORY</th>
            <th>{lyYear} Wk {wk},<br />Day {dayDisplay} Net $</th>
            <th>{cyYear} Wk {wk},<br />Day {dayDisplay} Net $</th>
            <th className="border-right">1 Day Comp<br />{lyYear} to {cyYear}</th>
            <th>{lyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`},<br />{isCalendar ? 'MTD' : 'WTD'} Net $</th>
            <th>{cyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`},<br />{isCalendar ? 'MTD' : 'WTD'} Net $</th>
            <th className="border-right">{isCalendar ? 'MTD' : 'WTD'} Comp<br />{lyYear} to {cyYear}</th>
            <th>{lyYear} Q{q},<br />QTD Net $</th>
            <th>{cyYear} Q{q},<br />QTD Net $</th>
            <th className="border-right">QTD Comp<br />{lyYear} to {cyYear}</th>
            <th>{lyYear},<br />YTD Net $</th>
            <th>{cyYear},<br />YTD Net $</th>
            <th className="border-right">YTD Comp<br />{lyYear} to {cyYear}</th>
          </tr>
        </thead>
        <tbody>
          {sortedTerritories.map(([territoryName, stores]) => {
            const rows = [];
            
            // Store Rows
            stores.forEach((store) => {
              rows.push(
                <tr key={store.STORE_ID}>
                  <td className="border-right store-name-cell">
                    <span className="store-name-text">
                      <strong>{store.STORE_ID}</strong> {store.STORE_NAME}
                    </span>
                    {store.DATE_OPENED && (
                      <span className="store-opened">First Sale {store.DATE_OPENED.length >= 10 ? store.DATE_OPENED.substring(2) : store.DATE_OPENED}</span>
                    )}
                  </td>
                  <td>{formatNumber(store.DAY_SALES_LY)}</td>
                  <td>{formatNumber(store.DAY_SALES_CY)}</td>
                  <td className={`border-right ${store.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {formatPercent(store.DAY_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.WTD_SALES_LY)}</td>
                  <td>{formatNumber(store.WTD_SALES_CY)}</td>
                  <td className={`border-right ${store.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {formatPercent(store.WTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.QTD_SALES_LY)}</td>
                  <td>{formatNumber(store.QTD_SALES_CY)}</td>
                  <td className={`border-right ${store.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {formatPercent(store.QTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.YTD_SALES_LY)}</td>
                  <td>{formatNumber(store.YTD_SALES_CY)}</td>
                  <td className={`border-right ${store.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {formatPercent(store.YTD_SALES_COMP)}
                  </td>
                </tr>
              );
            });

            // Territory Total Row
            const tTotal = computeTerritoryTotal(territoryName, stores);
            rows.push(
              <tr key={`${territoryName}-Total`} className="territory-row">
                <td className="border-right">{tTotal.STORE_NAME}</td>
                <td>{formatNumber(tTotal.DAY_SALES_LY)}</td>
                <td>{formatNumber(tTotal.DAY_SALES_CY)}</td>
                <td className={`border-right ${tTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {formatPercent(tTotal.DAY_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.WTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.WTD_SALES_CY)}</td>
                <td className={`border-right ${tTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {formatPercent(tTotal.WTD_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.QTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.QTD_SALES_CY)}</td>
                <td className={`border-right ${tTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {formatPercent(tTotal.QTD_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.YTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.YTD_SALES_CY)}</td>
                <td className={`border-right ${tTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {formatPercent(tTotal.YTD_SALES_COMP)}
                </td>
              </tr>
            );

            return rows;
          })}
        </tbody>
        {grandTotal && (
          <tfoot>
            <tr className="grand-total-row">
              <td className="border-right">
                GRAND TOTAL
                <span className="grand-total-sub">0 Locations yet to report day's sales</span>
              </td>
              <td>{formatNumber(grandTotal.DAY_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.DAY_SALES_CY)}</td>
              <td className={`border-right ${grandTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {formatPercent(grandTotal.DAY_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.WTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.WTD_SALES_CY)}</td>
              <td className={`border-right ${grandTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {formatPercent(grandTotal.WTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.QTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.QTD_SALES_CY)}</td>
              <td className={`border-right ${grandTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {formatPercent(grandTotal.QTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.YTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.YTD_SALES_CY)}</td>
              <td className={`border-right ${grandTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {formatPercent(grandTotal.YTD_SALES_COMP)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
