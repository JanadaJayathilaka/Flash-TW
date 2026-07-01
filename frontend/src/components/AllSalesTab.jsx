import React, { useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { formatNumber, formatPercent } from '../utils/dateUtils';
import { highlightText } from '../utils/highlightUtils';

function getSearchableRowStrings(r) {
  const dateStr = r.DATE_OPENED
    ? (r.DATE_OPENED.length >= 10 ? r.DATE_OPENED.substring(2) : r.DATE_OPENED)
    : '';
  const firstSaleStr = dateStr ? `First Sale ${dateStr}` : '';
  return [
    r.STORE_ID != null ? String(r.STORE_ID) : '',
    r.STORE_NAME || '',
    dateStr,
    firstSaleStr,
    r.REGION_ID != null ? String(r.REGION_ID) : '',
    r.TERRITORY || '',
    // Formatted values (with commas)
    formatNumber(r.DAY_SALES_LY),
    formatNumber(r.DAY_SALES_CY),
    formatPercent(r.DAY_SALES_COMP),
    formatNumber(r.WTD_SALES_LY),
    formatNumber(r.WTD_SALES_CY),
    formatPercent(r.WTD_SALES_COMP),
    formatNumber(r.QTD_SALES_LY),
    formatNumber(r.QTD_SALES_CY),
    formatPercent(r.QTD_SALES_COMP),
    formatNumber(r.YTD_SALES_LY),
    formatNumber(r.YTD_SALES_CY),
    formatPercent(r.YTD_SALES_COMP),
    // Unformatted values (without commas)
    r.DAY_SALES_LY != null ? String(Math.round(r.DAY_SALES_LY)) : '',
    r.DAY_SALES_CY != null ? String(Math.round(r.DAY_SALES_CY)) : '',
    r.WTD_SALES_LY != null ? String(Math.round(r.WTD_SALES_LY)) : '',
    r.WTD_SALES_CY != null ? String(Math.round(r.WTD_SALES_CY)) : '',
    r.QTD_SALES_LY != null ? String(Math.round(r.QTD_SALES_LY)) : '',
    r.QTD_SALES_CY != null ? String(Math.round(r.QTD_SALES_CY)) : '',
    r.YTD_SALES_LY != null ? String(Math.round(r.YTD_SALES_LY)) : '',
    r.YTD_SALES_CY != null ? String(Math.round(r.YTD_SALES_CY)) : '',
  ];
}

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
          terms.some((q) => {
            const searchableStrings = getSearchableRowStrings(r);
            return searchableStrings.some((str) => str.toLowerCase().includes(q));
          })
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
      'LOCATION/TERRITORY',
      'First Sale',
      `${lyYear} Wk ${wk}, Day ${dayDisplay} Net $`,
      `${cyYear} Wk ${wk}, Day ${dayDisplay} Net $`,
      `1 Day Comp ${lyYear} to ${cyYear}`,
      `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? 'MTD' : 'WTD'} Net $`,
      `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? 'MTD' : 'WTD'} Net $`,
      `${isCalendar ? 'MTD' : 'WTD'} Comp ${lyYear} to ${cyYear}`,
      `${lyYear} Q${q}, QTD Net $`,
      `${cyYear} Q${q}, QTD Net $`,
      `QTD Comp ${lyYear} to ${cyYear}`,
      `${lyYear}, YTD Net $`,
      `${cyYear}, YTD Net $`,
      `YTD Comp ${lyYear} to ${cyYear}`,
    ];

    const rows = displayRows.map((r) => {
      const isGt = !!r.IS_GRAND_TOTAL;
      const isTerr = !!r.IS_TERRITORY_TOTAL;
      const storeName = isGt 
        ? 'GRAND TOTAL' 
        : isTerr 
          ? r.STORE_NAME 
          : `${r.STORE_ID != null ? `${r.STORE_ID} ` : ''}${r.STORE_NAME || ''}`;
      const firstSale = (isGt || isTerr)
        ? ''
        : r.DATE_OPENED ? (r.DATE_OPENED.length >= 10 ? r.DATE_OPENED.substring(2) : r.DATE_OPENED) : '';

      return [
        storeName,
        firstSale,
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
      ];
    });

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
      { header: 'LOCATION/TERRITORY', align: 'left', numFmt: null, isComp: false, isCY: false },
      { header: 'First Sale', align: 'center', numFmt: null, isComp: false, isCY: false },
      { header: `${lyYear} Wk ${wk}, Day ${dayDisplay} Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} Wk ${wk}, Day ${dayDisplay} Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: `1 Day Comp ${lyYear} to ${cyYear}`, align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? 'MTD' : 'WTD'} Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? 'MTD' : 'WTD'} Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: `${isCalendar ? 'MTD' : 'WTD'} Comp ${lyYear} to ${cyYear}`, align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear} Q${q}, QTD Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear} Q${q}, QTD Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: `QTD Comp ${lyYear} to ${cyYear}`, align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
      { header: `${lyYear}, YTD Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: false },
      { header: `${cyYear}, YTD Net $`, align: 'right', numFmt: '#,##0', isComp: false, isCY: true },
      { header: `YTD Comp ${lyYear} to ${cyYear}`, align: 'center', numFmt: '0.00%', isComp: true, isCY: false },
    ];

    const RIGHT_BORDER_COLS = new Set([1, 4, 7, 10, 13]);
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
      const isGt = !!row.IS_GRAND_TOTAL;
      const isTerr = !!row.IS_TERRITORY_TOTAL;
      const storeName = isGt 
        ? 'GRAND TOTAL' 
        : isTerr 
          ? row.STORE_NAME 
          : `${row.STORE_ID != null ? `${row.STORE_ID} ` : ''}${row.STORE_NAME || ''}`;
      const firstSale = (isGt || isTerr)
        ? ''
        : row.DATE_OPENED ? (row.DATE_OPENED.length >= 10 ? row.DATE_OPENED.substring(2) : row.DATE_OPENED) : '';

      aoa.push([
        storeName,
        firstSale,
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
          isHeader || isGrandTotal,
          hasRightBdr
        );

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
            horizontal: isHeader ? 'left' : col.align,
            vertical: 'center',
            wrapText: !isHeader,
          },
          border,
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
      pane: { ySplit: 1, xSplit: 2, topLeftCell: 'C2', activePane: 'bottomRight', state: 'frozen' },
    }];

    ws['!cols'] = [
      { wch: 30 }, // LOCATION/TERRITORY
      { wch: 12 }, // First Sale
      { wch: 12 }, { wch: 12 }, { wch: 24 },
      { wch: 12 }, { wch: 12 }, { wch: 24 },
      { wch: 12 }, { wch: 12 }, { wch: 24 },
      { wch: 12 }, { wch: 12 }, { wch: 24 },
    ];

    ws['!rows'] = [{ hpt: 20 }];

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
        exportPDF: () => window.print(),
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
      {/* Screen view table (13 columns, UI remains unchanged) */}
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
                      <strong>{highlightText(store.STORE_ID, search)}</strong> {highlightText(store.STORE_NAME, search)}
                    </span>
                    {store.DATE_OPENED && (
                      <span className="store-opened">
                        {highlightText(`First Sale ${store.DATE_OPENED.length >= 10 ? store.DATE_OPENED.substring(2) : store.DATE_OPENED}`, search)}
                      </span>
                    )}
                  </td>
                  <td>{highlightText(formatNumber(store.DAY_SALES_LY), search)}</td>
                  <td>{highlightText(formatNumber(store.DAY_SALES_CY), search)}</td>
                  <td className={`border-right ${store.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {highlightText(formatPercent(store.DAY_SALES_COMP), search)}
                  </td>
                  <td>{highlightText(formatNumber(store.WTD_SALES_LY), search)}</td>
                  <td>{highlightText(formatNumber(store.WTD_SALES_CY), search)}</td>
                  <td className={`border-right ${store.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {highlightText(formatPercent(store.WTD_SALES_COMP), search)}
                  </td>
                  <td>{highlightText(formatNumber(store.QTD_SALES_LY), search)}</td>
                  <td>{highlightText(formatNumber(store.QTD_SALES_CY), search)}</td>
                  <td className={`border-right ${store.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {highlightText(formatPercent(store.QTD_SALES_COMP), search)}
                  </td>
                  <td>{highlightText(formatNumber(store.YTD_SALES_LY), search)}</td>
                  <td>{highlightText(formatNumber(store.YTD_SALES_CY), search)}</td>
                  <td className={`border-right ${store.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                    {highlightText(formatPercent(store.YTD_SALES_COMP), search)}
                  </td>
                </tr>
              );
            });

            // Territory Total Row
            const tTotal = computeTerritoryTotal(territoryName, stores);
            rows.push(
              <tr key={`${territoryName}-Total`} className="territory-row">
                <td className="border-right">{highlightText(tTotal.STORE_NAME, search)}</td>
                <td>{highlightText(formatNumber(tTotal.DAY_SALES_LY), search)}</td>
                <td>{highlightText(formatNumber(tTotal.DAY_SALES_CY), search)}</td>
                <td className={`border-right ${tTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {highlightText(formatPercent(tTotal.DAY_SALES_COMP), search)}
                </td>
                <td>{highlightText(formatNumber(tTotal.WTD_SALES_LY), search)}</td>
                <td>{highlightText(formatNumber(tTotal.WTD_SALES_CY), search)}</td>
                <td className={`border-right ${tTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {highlightText(formatPercent(tTotal.WTD_SALES_COMP), search)}
                </td>
                <td>{highlightText(formatNumber(tTotal.QTD_SALES_LY), search)}</td>
                <td>{highlightText(formatNumber(tTotal.QTD_SALES_CY), search)}</td>
                <td className={`border-right ${tTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {highlightText(formatPercent(tTotal.QTD_SALES_COMP), search)}
                </td>
                <td>{highlightText(formatNumber(tTotal.YTD_SALES_LY), search)}</td>
                <td>{highlightText(formatNumber(tTotal.YTD_SALES_CY), search)}</td>
                <td className={`border-right ${tTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                  {highlightText(formatPercent(tTotal.YTD_SALES_COMP), search)}
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
                {highlightText('GRAND TOTAL', search)}
                <span className="grand-total-sub">0 Locations yet to report day's sales</span>
              </td>
              <td>{highlightText(formatNumber(grandTotal.DAY_SALES_LY), search)}</td>
              <td>{highlightText(formatNumber(grandTotal.DAY_SALES_CY), search)}</td>
              <td className={`border-right ${grandTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {highlightText(formatPercent(grandTotal.DAY_SALES_COMP), search)}
              </td>
              <td>{highlightText(formatNumber(grandTotal.WTD_SALES_LY), search)}</td>
              <td>{highlightText(formatNumber(grandTotal.WTD_SALES_CY), search)}</td>
              <td className={`border-right ${grandTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {highlightText(formatPercent(grandTotal.WTD_SALES_COMP), search)}
              </td>
              <td>{highlightText(formatNumber(grandTotal.QTD_SALES_LY), search)}</td>
              <td>{highlightText(formatNumber(grandTotal.QTD_SALES_CY), search)}</td>
              <td className={`border-right ${grandTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {highlightText(formatPercent(grandTotal.QTD_SALES_COMP), search)}
              </td>
              <td>{highlightText(formatNumber(grandTotal.YTD_SALES_LY), search)}</td>
              <td>{highlightText(formatNumber(grandTotal.YTD_SALES_CY), search)}</td>
              <td className={`border-right ${grandTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}`}>
                {highlightText(formatPercent(grandTotal.YTD_SALES_COMP), search)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* Print/PDF only table (14 columns, active in print media query) */}
      <table className="sales-table-print">
        <thead>
          <tr>
            <th>LOCATION/TERRITORY</th>
            <th>First Sale</th>
            <th>{lyYear} Wk {wk}, Day {dayDisplay} Net $</th>
            <th>{cyYear} Wk {wk}, Day {dayDisplay} Net $</th>
            <th>1 Day Comp {lyYear} to {cyYear}</th>
            <th>{lyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, {isCalendar ? 'MTD' : 'WTD'} Net $</th>
            <th>{cyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, {isCalendar ? 'MTD' : 'WTD'} Net $</th>
            <th>{isCalendar ? 'MTD' : 'WTD'} Comp {lyYear} to {cyYear}</th>
            <th>{lyYear} Q{q}, QTD Net $</th>
            <th>{cyYear} Q{q}, QTD Net $</th>
            <th>QTD Comp {lyYear} to {cyYear}</th>
            <th>{lyYear}, YTD Net $</th>
            <th>{cyYear}, YTD Net $</th>
            <th>YTD Comp {lyYear} to {cyYear}</th>
          </tr>
        </thead>
        <tbody>
          {sortedTerritories.map(([territoryName, stores]) => {
            const rows = [];
            
            // Store rows
            stores.forEach((store) => {
              const storeName = `${store.STORE_ID != null ? `${store.STORE_ID} ` : ''}${store.STORE_NAME || ''}`;
              const firstSale = store.DATE_OPENED 
                ? (store.DATE_OPENED.length >= 10 ? store.DATE_OPENED.substring(2) : store.DATE_OPENED) 
                : '';
              rows.push(
                <tr key={store.STORE_ID}>
                  <td>{storeName}</td>
                  <td>{firstSale}</td>
                  <td>{formatNumber(store.DAY_SALES_LY)}</td>
                  <td>{formatNumber(store.DAY_SALES_CY)}</td>
                  <td className={store.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                    {formatPercent(store.DAY_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.WTD_SALES_LY)}</td>
                  <td>{formatNumber(store.WTD_SALES_CY)}</td>
                  <td className={store.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                    {formatPercent(store.WTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.QTD_SALES_LY)}</td>
                  <td>{formatNumber(store.QTD_SALES_CY)}</td>
                  <td className={store.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                    {formatPercent(store.QTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.YTD_SALES_LY)}</td>
                  <td>{formatNumber(store.YTD_SALES_CY)}</td>
                  <td className={store.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                    {formatPercent(store.YTD_SALES_COMP)}
                  </td>
                </tr>
              );
            });

            // Territory Total Row
            const tTotal = computeTerritoryTotal(territoryName, stores);
            rows.push(
              <tr key={`${territoryName}-Total`} className="territory-row">
                <td>{tTotal.STORE_NAME}</td>
                <td></td>
                <td>{formatNumber(tTotal.DAY_SALES_LY)}</td>
                <td>{formatNumber(tTotal.DAY_SALES_CY)}</td>
                <td className={tTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                  {formatPercent(tTotal.DAY_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.WTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.WTD_SALES_CY)}</td>
                <td className={tTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                  {formatPercent(tTotal.WTD_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.QTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.QTD_SALES_CY)}</td>
                <td className={tTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                  {formatPercent(tTotal.QTD_SALES_COMP)}
                </td>
                <td>{formatNumber(tTotal.YTD_SALES_LY)}</td>
                <td>{formatNumber(tTotal.YTD_SALES_CY)}</td>
                <td className={tTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
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
              <td>GRAND TOTAL</td>
              <td></td>
              <td>{formatNumber(grandTotal.DAY_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.DAY_SALES_CY)}</td>
              <td className={grandTotal.DAY_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                {formatPercent(grandTotal.DAY_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.WTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.WTD_SALES_CY)}</td>
              <td className={grandTotal.WTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                {formatPercent(grandTotal.WTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.QTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.QTD_SALES_CY)}</td>
              <td className={grandTotal.QTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                {formatPercent(grandTotal.QTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.YTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.YTD_SALES_CY)}</td>
              <td className={grandTotal.YTD_SALES_COMP >= 0 ? 'comp-pos' : 'comp-neg'}>
                {formatPercent(grandTotal.YTD_SALES_COMP)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
