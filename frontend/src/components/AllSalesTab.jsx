import React, { useMemo, useCallback, useEffect, useRef } from "react";
import { formatNumber, formatPercent } from "../utils/dateUtils";
import { highlightText, matchesSearchTerm } from "../utils/highlightUtils";
import { generateSalesPDF } from "../utils/pdfExportUtils";

function getSearchableRowStrings(r) {
  if (r.IS_TERRITORY_TOTAL) {
    const regionPrefix = r.REGION_ID ? `${r.REGION_ID} ` : "";
    const name = r.STORE_NAME?.startsWith(regionPrefix)
      ? r.STORE_NAME
      : `${regionPrefix}${r.STORE_NAME || `${r.TERRITORY || ""} Total`}`;

    return [
      name,
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
    ];
  }

  const sid = r.STORE_ID != null ? String(r.STORE_ID).trim() : "";
  const storeName = r.STORE_NAME ? String(r.STORE_NAME).trim() : "";
  const dateStr = r.DATE_OPENED
    ? r.DATE_OPENED.length >= 10
      ? r.DATE_OPENED.substring(2)
      : r.DATE_OPENED
    : "";
  const firstSaleStr = dateStr ? `FIRST SALE '${dateStr}` : "";
  const locationCell = `${sid} ${storeName} ${firstSaleStr}`.trim();

  return [
    locationCell,
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
  ];
}

export default function AllSalesTab({
  data,
  loading,
  selectedDate,
  weekNumber,
  dayNumber,
  quarterNumber,
  calendarDayOfMonth = 0,
  calendarMonthNumber = 0,
  calendarMode,
  currencyMode = "1",
  search,
  zoomLevel = 100,
  onBindExportActions,
}) {
  // Parse variables
  const cyYear = new Date().getFullYear();
  const lyYear = cyYear - 1;
  const wk = String(weekNumber).padStart(2, "0");
  const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
  const isCalendar = calendarMode === "calendar";
  const dayDisplay =
    isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
  const monthStr = String(calendarMonthNumber).padStart(2, "0");

  // Parse data and groups
  const { territoryGroups, grandTotal } = useMemo(() => {
    const groups = {}; // { [territoryName]: { regionId, stores: [], totalRow: null } }

    data.forEach((r) => {
      if (r.IS_GRAND_TOTAL) return;
      const t = r.TERRITORY || "Unknown";
      if (!groups[t]) {
        groups[t] = {
          regionId: Number(r.REGION_ID) || 0,
          stores: [],
          totalRow: null,
        };
      }
      if (r.IS_TERRITORY_TOTAL) {
        if (r.REGION_ID) {
          groups[t].regionId = Number(r.REGION_ID) || groups[t].regionId;
        }
      } else {
        groups[t].stores.push(r);
        if (r.REGION_ID) {
          groups[t].regionId = Number(r.REGION_ID) || groups[t].regionId;
        }
      }
    });

    // Sort stores within each territory alphabetically & dynamically compute totalRow from converted store values
    Object.keys(groups).forEach((t) => {
      groups[t].stores.sort((a, b) =>
        (a.STORE_NAME ?? "").localeCompare(b.STORE_NAME ?? ""),
      );

      if (groups[t].stores.length > 0) {
        const stores = groups[t].stores;
        const sum = (field) =>
          stores.reduce((acc, s) => acc + Number(s[field] ?? 0), 0);
        const cyDay = sum("DAY_SALES_CY");
        const lyDay = sum("DAY_SALES_LY");
        const cyWtd = sum("WTD_SALES_CY");
        const lyWtd = sum("WTD_SALES_LY");
        const cyQtd = sum("QTD_SALES_CY");
        const lyQtd = sum("QTD_SALES_LY");
        const cyYtd = sum("YTD_SALES_CY");
        const lyYtd = sum("YTD_SALES_LY");
        const calcComp = (cy, ly) =>
          cy === 0 || ly === 0 ? 0 : ((cy - ly) / ly) * 100;
        const regionPrefix = groups[t].regionId ? `${groups[t].regionId} ` : "";
        groups[t].totalRow = {
          STORE_NAME: `${regionPrefix}${t} Total`,
          IS_TERRITORY_TOTAL: true,
          REGION_ID: groups[t].regionId,
          TERRITORY: t,
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
      }
    });

    // Apply search filter matching salesapp
    const rawFilter = (search || "").toLowerCase().trim();
    const terms = rawFilter
      .split("++")
      .map((s) => s.trim())
      .filter(Boolean);

    const isSearching = terms.length > 0;

    if (isSearching) {
      Object.keys(groups).forEach((t) => {
        // Filter store rows
        groups[t].stores = groups[t].stores.filter((r) => {
          const searchableStrings = getSearchableRowStrings(r);
          return terms.some((q) =>
            searchableStrings.some((str) => matchesSearchTerm(str, q)),
          );
        });

        // Filter territory total row (exact salesapp behavior: each row is toggled independently by its own cell matches)
        if (groups[t].totalRow) {
          const totalSearchable = getSearchableRowStrings(groups[t].totalRow);
          const totalMatches = terms.some((q) =>
            totalSearchable.some((str) => matchesSearchTerm(str, q)),
          );
          if (!totalMatches) {
            groups[t].totalRow = null;
          }
        }
      });
    }

    // Dynamically compute Grand Total over ALL raw store rows (unaffected by search filter)
    const allStoreRows = data.filter(
      (r) => !r.IS_GRAND_TOTAL && !r.IS_TERRITORY_TOTAL,
    );
    const sum = (field) =>
      allStoreRows.reduce((acc, s) => acc + Number(s[field] ?? 0), 0);
    const lyDay = sum("DAY_SALES_LY");
    const cyDay = sum("DAY_SALES_CY");
    const lyWtd = sum("WTD_SALES_LY");
    const cyWtd = sum("WTD_SALES_CY");
    const lyQtd = sum("QTD_SALES_LY");
    const cyQtd = sum("QTD_SALES_CY");
    const lyYtd = sum("YTD_SALES_LY");
    const cyYtd = sum("YTD_SALES_CY");

    const calcComp = (cy, ly) => {
      if (cy === 0 || ly === 0) return 0;
      return ((cy - ly) / ly) * 100;
    };

    const grandTotal = {
      STORE_NAME: "GRAND TOTAL",
      IS_GRAND_TOTAL: true,
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

    return { territoryGroups: groups, grandTotal };
  }, [data, search]);

  const sortedTerritories = useMemo(() => {
    return Object.entries(territoryGroups)
      .filter(([, group]) => group.stores.length > 0 || group.totalRow !== null)
      .sort(([, groupA], [, groupB]) => {
        const regA = groupA.regionId || 0;
        const regB = groupB.regionId || 0;
        if (regA !== regB) {
          return regA - regB;
        }
        return 0;
      });
  }, [territoryGroups]);

  // Build rows array representing current table display order
  const displayRows = useMemo(() => {
    const rows = [];
    sortedTerritories.forEach(([, group]) => {
      rows.push(...group.stores);
      if (group.totalRow) {
        rows.push(group.totalRow);
      }
    });
    if (grandTotal) {
      rows.push(grandTotal);
    }
    return rows;
  }, [sortedTerritories, grandTotal]);

  const DT_1_Str = useCallback(() => {
    if (selectedDate) {
      const parts = String(selectedDate).split("T")[0].split("-");
      if (parts.length === 3) {
        const yyyy = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10) - 1;
        const dd = parseInt(parts[2], 10);
        const d = new Date(yyyy, mm, dd);
        const monthNames = [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ];
        const dayNames = [
          "Sunday",
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
        ];
        const monthStr = monthNames[d.getMonth()];
        const dayNum = String(d.getDate()).padStart(2, "0");
        const weekdayStr = dayNames[d.getDay()];
        return `${yyyy} ${monthStr} ${dayNum}, ${weekdayStr}`;
      }
      return String(selectedDate);
    }
    return new Date().toISOString().split("T")[0];
  }, [selectedDate]);

  // Export CSV
  const handleExportCSV = useCallback(() => {
    const curText = currencyMode === "2" ? "NZ$" : "AU$";
    const calText = calendarMode === "fiscal" ? "Fiscal" : "Calendar";
    const titleStr = `FLASH SALES ${curText} (${calText}) ON ${DT_1_Str().toUpperCase()}`;

    const headers = [
      "STORE / TERRITORY",
      "FIRST SALE",
      `${lyYear} WK ${wk}, DAY ${dayDisplay} NET $`,
      `${cyYear} WK ${wk}, DAY ${dayDisplay} NET $`,
      `1 DAY COMP ${lyYear} TO ${cyYear}`,
      `${lyYear} ${isCalendar ? `MO ${monthStr}` : `WK ${wk}`}, ${isCalendar ? "MTD" : "WTD"} NET $`,
      `${cyYear} ${isCalendar ? `MO ${monthStr}` : `WK ${wk}`}, ${isCalendar ? "MTD" : "WTD"} NET $`,
      `${isCalendar ? "MTD" : "WTD"} COMP ${lyYear} TO ${cyYear}`,
      `${lyYear} Q${q}, QTD NET $`,
      `${cyYear} Q${q}, QTD NET $`,
      `QTD COMP ${lyYear} TO ${cyYear}`,
      `${lyYear}, YTD NET $`,
      `${cyYear}, YTD NET $`,
      `YTD COMP ${lyYear} TO ${cyYear}`,
    ];

    const titleRow = new Array(headers.length).fill("");
    titleRow[0] = titleStr;

    const filterRows = [];
    if (search && search.trim() !== "") {
      const filterRow = new Array(headers.length).fill("");
      filterRow[0] = `Filter: ${search.trim()}`;
      filterRows.push(filterRow);
    }

    const tableRows = [];
    let grandTotalRow = null;

    displayRows.forEach((r) => {
      const isGt = !!r.IS_GRAND_TOTAL;
      const isTerr = !!r.IS_TERRITORY_TOTAL;
      const storeName = isGt
        ? "GRAND TOTAL 0 Locations yet to report day's sales"
        : isTerr
          ? r.STORE_NAME
          : `${r.STORE_ID != null ? `${r.STORE_ID} ` : ""}${r.STORE_NAME || ""}`;
      const firstSale =
        isGt || isTerr
          ? ""
          : r.DATE_OPENED
            ? r.DATE_OPENED.startsWith("'")
              ? r.DATE_OPENED
              : `'${r.DATE_OPENED.length >= 10 ? r.DATE_OPENED.substring(2) : r.DATE_OPENED}`
            : "";

      const rowData = [
        storeName,
        firstSale,
        formatNumber(r.DAY_SALES_LY),
        formatNumber(r.DAY_SALES_CY),
        `${(r.DAY_SALES_COMP ?? 0).toFixed(2)}%`,
        formatNumber(r.WTD_SALES_LY),
        formatNumber(r.WTD_SALES_CY),
        `${(r.WTD_SALES_COMP ?? 0).toFixed(2)}%`,
        formatNumber(r.QTD_SALES_LY),
        formatNumber(r.QTD_SALES_CY),
        `${(r.QTD_SALES_COMP ?? 0).toFixed(2)}%`,
        formatNumber(r.YTD_SALES_LY),
        formatNumber(r.YTD_SALES_CY),
        `${(r.YTD_SALES_COMP ?? 0).toFixed(2)}%`,
      ];

      if (isGt) {
        grandTotalRow = rowData;
      } else {
        tableRows.push(rowData);
      }
    });

    const dataRows = grandTotalRow
      ? [...tableRows, new Array(headers.length).fill(""), grandTotalRow]
      : tableRows;

    const allRows = [titleRow, ...filterRows, [], headers, ...dataRows];

    const csvContent =
      "\uFEFF" +
      allRows
        .map((r) =>
          r
            .map((val) => {
              const s = String(val ?? "");
              return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(","),
        )
        .join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute(
      "download",
      `FlashSales_${calendarMode}_${DT_1_Str()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [
    displayRows,
    lyYear,
    wk,
    dayDisplay,
    cyYear,
    isCalendar,
    monthStr,
    q,
    calendarMode,
    currencyMode,
    search,
    DT_1_Str,
  ]);

  // Export Excel matching Dotnet toExcelAndCSV.js exactly
  const handleExportExcel = useCallback(async () => {
    const XLSXModule = await import("xlsx-js-style");
    const XLSX = XLSXModule.default || XLSXModule;

    const curText = currencyMode === "2" ? "NZ$" : "AU$";
    const calText = calendarMode === "fiscal" ? "Fiscal" : "Calendar";

    const formattedTitle = `FLASH SALES ${curText} (${calText}) ON ${DT_1_Str().toUpperCase()}`;

    const now = new Date();
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const yy = String(now.getFullYear()).slice(-2);
    const mmm = months[now.getMonth()];
    const dd = String(now.getDate()).padStart(2, "0");
    let hours = now.getHours();
    const mins = String(now.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const timestampStr = `Generated: '${yy} ${mmm} ${dd} | ${hours}:${mins} ${ampm} USA, Pacific`;

    const searchFilterText =
      search && search.trim() !== "" ? `Filter: ${search.trim()}` : "";

    const COLS = [
      { header: "STORE / TERRITORY", align: "left", numFmt: null, isComp: false, isCY: false },
      { header: "FIRST SALE", align: "center", numFmt: null, isComp: false, isCY: false },
      {
        header: `${lyYear} WK ${wk},\nDAY ${dayDisplay} NET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: false,
      },
      {
        header: `${cyYear} WK ${wk},\nDAY ${dayDisplay} NET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: true,
      },
      {
        header: `1 DAY COMP\n${lyYear} TO ${cyYear}`,
        align: "center",
        numFmt: "0.00%",
        isComp: true,
        isCY: false,
      },
      {
        header: `${lyYear} ${isCalendar ? `MO ${monthStr}` : `WK ${wk}`},\n${isCalendar ? "MTD" : "WTD"} NET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: false,
      },
      {
        header: `${cyYear} ${isCalendar ? `MO ${monthStr}` : `WK ${wk}`},\n${isCalendar ? "MTD" : "WTD"} NET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: true,
      },
      {
        header: `${isCalendar ? "MTD" : "WTD"} COMP\n${lyYear} TO ${cyYear}`,
        align: "center",
        numFmt: "0.00%",
        isComp: true,
        isCY: false,
      },
      {
        header: `${lyYear} Q${q},\nQTD NET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: false,
      },
      {
        header: `${cyYear} Q${q}, QTD\nNET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: true,
      },
      {
        header: `QTD COMP\n${lyYear} TO ${cyYear}`,
        align: "center",
        numFmt: "0.00%",
        isComp: true,
        isCY: false,
      },
      {
        header: `${lyYear} YTD\nNET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: false,
      },
      {
        header: `${cyYear} YTD\nNET $`,
        align: "right",
        numFmt: "#,##0",
        isComp: false,
        isCY: true,
      },
      {
        header: `YTD COMP\n${lyYear} TO ${cyYear}`,
        align: "center",
        numFmt: "0.00%",
        isComp: true,
        isCY: false,
      },
    ];

    const RIGHT_BORDER_COLS = new Set([0, 1, 4, 7, 10, 13]);
    const BORDER_SIDE = { style: "thin", color: { rgb: "808080" } };

    const makeBorder = (top, bottom, right) => {
      const b = {};
      if (top) b.top = BORDER_SIDE;
      if (bottom) b.bottom = BORDER_SIDE;
      if (right) b.right = BORDER_SIDE;
      return b;
    };

    const excelRows = [];

    // Row 1: Title & Timestamp (populate G1:N1 merge range)
    const row1 = new Array(14).fill("");
    row1[0] = formattedTitle;
    row1[6] = timestampStr;
    row1[13] = timestampStr;
    excelRows.push(row1);

    // Row 2: Filter (if active)
    const row2 = new Array(14).fill("");
    if (searchFilterText) {
      row2[0] = searchFilterText;
    }
    excelRows.push(row2);

    // Row 3: Spacer
    excelRows.push(new Array(14).fill(""));

    // Row 4: Header
    excelRows.push(COLS.map((c) => c.header));

    // Data rows
    const tableDataRows = displayRows.filter((r) => !r.IS_GRAND_TOTAL);
    const grandTotalRow = displayRows.find((r) => r.IS_GRAND_TOTAL);

    tableDataRows.forEach((row) => {
      const isTerr = !!row.IS_TERRITORY_TOTAL;
      const storeName = isTerr
        ? row.STORE_NAME
        : `${row.STORE_ID != null ? `${row.STORE_ID} ` : ""}${row.STORE_NAME || ""}`;
      const firstSale = isTerr
        ? ""
        : row.DATE_OPENED
          ? row.DATE_OPENED.startsWith("'")
            ? row.DATE_OPENED
            : `'${row.DATE_OPENED.length >= 10 ? row.DATE_OPENED.substring(2) : row.DATE_OPENED}`
          : "";

      excelRows.push([
        storeName,
        firstSale,
        Math.round(row.DAY_SALES_LY ?? 0),
        Math.round(row.DAY_SALES_CY ?? 0),
        (row.DAY_SALES_COMP ?? 0) / 100,
        Math.round(row.WTD_SALES_LY ?? 0),
        Math.round(row.WTD_SALES_CY ?? 0),
        (row.WTD_SALES_COMP ?? 0) / 100,
        Math.round(row.QTD_SALES_LY ?? 0),
        Math.round(row.QTD_SALES_CY ?? 0),
        (row.QTD_SALES_COMP ?? 0) / 100,
        Math.round(row.YTD_SALES_LY ?? 0),
        Math.round(row.YTD_SALES_CY ?? 0),
        (row.YTD_SALES_COMP ?? 0) / 100,
      ]);
    });

    // Grand Total rows (2 rows matching Dotnet)
    if (grandTotalRow) {
      excelRows.push([
        "GRAND TOTAL",
        "",
        Math.round(grandTotalRow.DAY_SALES_LY ?? 0),
        Math.round(grandTotalRow.DAY_SALES_CY ?? 0),
        (grandTotalRow.DAY_SALES_COMP ?? 0) / 100,
        Math.round(grandTotalRow.WTD_SALES_LY ?? 0),
        Math.round(grandTotalRow.WTD_SALES_CY ?? 0),
        (grandTotalRow.WTD_SALES_COMP ?? 0) / 100,
        Math.round(grandTotalRow.QTD_SALES_LY ?? 0),
        Math.round(grandTotalRow.QTD_SALES_CY ?? 0),
        (grandTotalRow.QTD_SALES_COMP ?? 0) / 100,
        Math.round(grandTotalRow.YTD_SALES_LY ?? 0),
        Math.round(grandTotalRow.YTD_SALES_CY ?? 0),
        (grandTotalRow.YTD_SALES_COMP ?? 0) / 100,
      ]);

      excelRows.push([
        "0 Locations yet to report day's sales",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(excelRows);

    // Style Title Row (A1 and G1:N1 merge range)
    if (ws["A1"]) {
      ws["A1"].s = {
        font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "000000" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }
    const timestampStyle = {
      font: { name: "Calibri", sz: 8, color: { rgb: "000000" } },
      alignment: { horizontal: "right", vertical: "center" },
    };
    ["G1", "H1", "I1", "J1", "K1", "L1", "M1", "N1"].forEach((cellKey) => {
      if (ws[cellKey]) {
        ws[cellKey].v = timestampStr;
        ws[cellKey].t = "s";
        ws[cellKey].s = timestampStyle;
      }
    });

    // Style Filter Row (A2)
    if (searchFilterText && ws["A2"]) {
      ws["A2"].s = {
        font: { name: "Calibri", sz: 8, bold: false, color: { rgb: "000000" } },
        alignment: { horizontal: "left", vertical: "center" },
      };
    }

    const headerRowIndex = 3; // Row 4 (0-indexed 3)
    const dataStartRowIndex = 4;
    const footer1RowIndex = grandTotalRow ? excelRows.length - 2 : -1;
    const footer2RowIndex = grandTotalRow ? excelRows.length - 1 : -1;

    // Style Table Header (Row 4)
    for (let c = 0; c < COLS.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c });
      if (!ws[addr]) continue;
      const col = COLS[c];
      ws[addr].s = {
        font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "000000" } },
        alignment: {
          horizontal: col.align,
          vertical: "center",
          wrapText: true,
        },
        border: makeBorder(true, true, RIGHT_BORDER_COLS.has(c)),
      };
    }

    // Style Data Rows
    let tableDataIdx = 0;
    const lastDataRowIndex =
      footer1RowIndex !== -1 ? footer1RowIndex : excelRows.length;
    for (let r = dataStartRowIndex; r < lastDataRowIndex; r++) {
      const dataRow = tableDataRows[tableDataIdx++];
      const isTerr = !!dataRow?.IS_TERRITORY_TOTAL;

      for (let c = 0; c < COLS.length; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };

        const col = COLS[c];
        const val = excelRows[r][c];

        let fontColor;
        if (col.isComp && typeof val === "number") {
          fontColor = val >= 0 ? "008000" : "FF0000";
        } else if (col.isCY) {
          fontColor = "3A7785";
        }

        const border = makeBorder(false, false, RIGHT_BORDER_COLS.has(c));

        const cellStyle = {
          font: {
            name: "Calibri",
            sz: 11,
            bold: isTerr,
            ...(fontColor ? { color: { rgb: fontColor } } : {}),
          },
          alignment: {
            horizontal: col.align,
            vertical: "center",
            wrapText: true,
          },
          border,
        };

        if (col.numFmt && typeof val === "number") {
          cellStyle.numFmt = col.numFmt;
          ws[addr].t = "n";
        }

        ws[addr].s = cellStyle;
      }
    }

    // Style Footer Row 1 (Grand Total numbers)
    if (footer1RowIndex !== -1) {
      for (let c = 0; c < COLS.length; c++) {
        const addr = XLSX.utils.encode_cell({ r: footer1RowIndex, c });
        if (!ws[addr]) continue;
        const col = COLS[c];
        const val = excelRows[footer1RowIndex][c];

        const cellStyle = {
          font: {
            name: "Calibri",
            sz: 11,
            bold: true,
            color: { rgb: "000000" },
          },
          alignment: { horizontal: col.align, vertical: "center" },
          border: makeBorder(true, true, RIGHT_BORDER_COLS.has(c)),
        };

        if (col.numFmt && typeof val === "number") {
          cellStyle.numFmt = col.numFmt;
          ws[addr].t = "n";
        }

        ws[addr].s = cellStyle;
      }
    }

    // Style Footer Row 2 (Subtext)
    if (footer2RowIndex !== -1) {
      const f2Addr = XLSX.utils.encode_cell({ r: footer2RowIndex, c: 0 });
      if (ws[f2Addr]) {
        ws[f2Addr].s = {
          font: { name: "Calibri", sz: 8, bold: false, color: { rgb: "000000" } },
          alignment: { horizontal: "left", vertical: "center" },
        };
      }
    }

    // Merges: A1:F1 for title (ensures TUESDAY is never truncated), G1:N1 for timestamp (prevents left-border clipping)
    ws["!merges"] = [
      XLSX.utils.decode_range("A1:F1"),
      XLSX.utils.decode_range("G1:N1"),
    ];
    if (searchFilterText) {
      ws["!merges"].push(XLSX.utils.decode_range("A2:F2"));
    }

    // Column widths matching exact word breakdowns
    ws["!cols"] = [
      { wch: 35.0 },
      { wch: 10.33 },
      { wch: 13.5 },
      { wch: 13.5 },
      { wch: 12.5 },
      { wch: 13.5 },
      { wch: 13.5 },
      { wch: 12.5 },
      { wch: 12.0 },
      { wch: 14.0 },
      { wch: 12.5 },
      { wch: 10.5 },
      { wch: 10.5 },
      { wch: 12.5 },
    ];

    // Row heights
    ws["!rows"] = [];
    ws["!rows"][0] = { hpt: 20 };
    if (searchFilterText) {
      ws["!rows"][1] = { hpt: 12 };
    }
    ws["!rows"][headerRowIndex] = { hpt: 26 };

    // Freeze panes matching Dotnet toExcelAndCSV.js (ySplit: 4)
    ws["!sheetViews"] = [
      {
        workbookViewId: 0,
        pane: {
          ySplit: 4,
          topLeftCell: "A5",
          activePane: "bottomLeft",
          state: "frozen",
        },
      },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");

    // Filename timestamp YYYYMMDDHHMMSS matching Dotnet
    const pad2 = (n) => String(n).padStart(2, "0");
    const fnTs = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

    XLSX.writeFile(wb, `FlashSales_${fnTs}.xlsx`);
  }, [
    displayRows,
    lyYear,
    wk,
    dayDisplay,
    cyYear,
    isCalendar,
    monthStr,
    q,
    calendarMode,
    currencyMode,
    search,
    DT_1_Str,
  ]);

  const handleExportPDF = useCallback(
    (isPrint = false) => {
      generateSalesPDF({
        data,
        selectedDate,
        weekNumber,
        dayNumber,
        quarterNumber,
        calendarDayOfMonth,
        calendarMonthNumber,
        calendarMode,
        currencyMode,
        search,
        isPrint,
        displayDateStr:
          typeof DT_1_Str === "function" ? DT_1_Str() : String(DT_1_Str || ""),
      });
    },
    [
      data,
      selectedDate,
      weekNumber,
      dayNumber,
      quarterNumber,
      calendarDayOfMonth,
      calendarMonthNumber,
      calendarMode,
      currencyMode,
      search,
      DT_1_Str,
    ],
  );

  // Bind export triggers to parent
  React.useEffect(() => {
    if (onBindExportActions) {
      onBindExportActions({
        exportExcel: handleExportExcel,
        exportCSV: handleExportCSV,
        exportPDF: () => handleExportPDF(false),
        printPDF: () => handleExportPDF(true),
      });
    }
  }, [
    onBindExportActions,
    handleExportExcel,
    handleExportCSV,
    handleExportPDF,
  ]);

  // Ref for the table element — used by the ResizeObserver
  const tableRef = useRef(null);

  // Scroll handlers for instant scroll-to-top and scroll-to-bottom
  const handleScrollUp = () => {
    const table = tableRef.current;
    if (table) {
      const tbody = table.querySelector("tbody");
      if (tbody) {
        tbody.scrollTo({ top: 0, behavior: "instant" });
      }
    }
  };

  const handleScrollDown = () => {
    const table = tableRef.current;
    if (table) {
      const tbody = table.querySelector("tbody");
      if (tbody) {
        tbody.scrollTo({ top: tbody.scrollHeight, behavior: "instant" });
      }
    }
  };

  // Dynamically adjust tbody height on zoom/resize so the table fills the viewport
  useEffect(() => {
    function adjustTbodyHeight() {
      const table = tableRef.current;
      if (!table) return;

      const thead = table.querySelector("thead");
      const tbody = table.querySelector("tbody");
      const tfoot = table.querySelector("tfoot");
      if (!thead || !tbody) return;

      const zoomFactor = (zoomLevel || 100) / 100;
      const viewportHeight = window.innerHeight;
      const theadHeight = thead.offsetHeight || 0;
      const tfootHeight = tfoot ? tfoot.offsetHeight : 0;
      const tableTopOffset = table.getBoundingClientRect().top / zoomFactor;

      // Reserve space for footer bar + borders/padding
      const footerReserve = 55 / zoomFactor;
      const unscaledHeight =
        viewportHeight / zoomFactor -
        tableTopOffset -
        theadHeight -
        tfootHeight -
        footerReserve;

      tbody.style.height = Math.max(unscaledHeight, 200) + "px";

      // Position the scroll-up and scroll-down buttons dynamically just inside the scrollable region
      const wrapper = table.parentNode;
      if (wrapper) {
        const upBtn = wrapper.querySelector(".table-scroll-btn.scroll-up");
        const downBtn = wrapper.querySelector(".table-scroll-btn.scroll-down");
        if (upBtn) {
          upBtn.style.top = theadHeight + "px";
        }
        if (downBtn) {
          downBtn.style.bottom = tfootHeight + "px";
        }
      }
    }

    adjustTbodyHeight();

    const observer = new ResizeObserver(() => adjustTbodyHeight());
    if (tableRef.current) observer.observe(tableRef.current);
    window.addEventListener("resize", adjustTbodyHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", adjustTbodyHeight);
    };
  }, [loading, data, zoomLevel]);

  if (loading) {
    return <div className="loading-view">Loading sales data...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div className="table-wrapper">
      <button
        className="table-scroll-btn scroll-up"
        onClick={handleScrollUp}
        title="Scroll to Top"
      >
        <img src="/uparrow.png" alt="Scroll Up" className="scroll-btn-img" />
      </button>
      <button
        className="table-scroll-btn scroll-down"
        onClick={handleScrollDown}
        title="Scroll to Bottom"
      >
        <img
          src="/uparrow.png"
          alt="Scroll Down"
          className="scroll-btn-img rotated"
        />
      </button>
      {/* Screen view table (13 columns, UI remains unchanged) */}
      <table className="sales-table" ref={tableRef}>
        <thead>
          <tr>
            <th className="border-right">
              <br />
              STORE/TERRITORY
            </th>
            <th>
              {lyYear} Wk {wk},<br />
              Day {dayDisplay} Net $
            </th>
            <th>
              {cyYear} Wk {wk},<br />
              Day {dayDisplay} Net $
            </th>
            <th className="border-right">
              1 Day Comp
              <br />
              {lyYear} to {cyYear}
            </th>
            <th>
              {lyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`},<br />
              {isCalendar ? "MTD" : "WTD"} Net $
            </th>
            <th>
              {cyYear} {isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`},<br />
              {isCalendar ? "MTD" : "WTD"} Net $
            </th>
            <th className="border-right">
              {isCalendar ? "MTD" : "WTD"} Comp
              <br />
              {lyYear} to {cyYear}
            </th>
            <th>
              {lyYear} Q{q},<br />
              QTD Net $
            </th>
            <th>
              {cyYear} Q{q},<br />
              QTD Net $
            </th>
            <th className="border-right">
              QTD Comp
              <br />
              {lyYear} to {cyYear}
            </th>
            <th>
              {lyYear},<br />
              YTD Net $
            </th>
            <th>
              {cyYear},<br />
              YTD Net $
            </th>
            <th className="border-right">
              YTD Comp
              <br />
              {lyYear} to {cyYear}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTerritories.map(([territoryName, group], territoryIndex) => {
            const rows = [];
            const territoryClass =
              territoryIndex % 2 === 0
                ? "territory-group-even"
                : "territory-group-odd";

            // Store Rows
            group.stores.forEach((store) => {
              rows.push(
                <tr key={store.STORE_ID} className={territoryClass}>
                  <td className="border-right store-name-cell">
                    <span className="store-name-text">
                      <strong>{highlightText(store.STORE_ID, search)}</strong>{" "}
                      {highlightText(store.STORE_NAME, search)}
                    </span>
                    {store.DATE_OPENED && (
                      <span className="store-opened">
                        {highlightText(
                          `FIRST SALE '${store.DATE_OPENED.length >= 10 ? store.DATE_OPENED.substring(2) : store.DATE_OPENED}`,
                          search,
                        )}
                      </span>
                    )}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.DAY_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.DAY_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${store.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(formatPercent(store.DAY_SALES_COMP), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.WTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.WTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${store.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(formatPercent(store.WTD_SALES_COMP), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.QTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.QTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${store.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(formatPercent(store.QTD_SALES_COMP), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.YTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(store.YTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${store.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(formatPercent(store.YTD_SALES_COMP), search)}
                  </td>
                </tr>,
              );
            });

            // Territory Total Row
            if (group.totalRow) {
              const tTotal = group.totalRow;
              rows.push(
                <tr
                  key={`${territoryName}-Total`}
                  className={`territory-row ${territoryClass}`}
                >
                  <td className="border-right">
                    {highlightText(tTotal.STORE_NAME, search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.DAY_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.DAY_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${tTotal.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(
                      formatPercent(tTotal.DAY_SALES_COMP),
                      search,
                    )}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.WTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.WTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${tTotal.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(
                      formatPercent(tTotal.WTD_SALES_COMP),
                      search,
                    )}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.QTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.QTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${tTotal.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(
                      formatPercent(tTotal.QTD_SALES_COMP),
                      search,
                    )}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.YTD_SALES_LY), search)}
                  </td>
                  <td>
                    {highlightText(formatNumber(tTotal.YTD_SALES_CY), search)}
                  </td>
                  <td
                    className={`border-right ${tTotal.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
                  >
                    {highlightText(
                      formatPercent(tTotal.YTD_SALES_COMP),
                      search,
                    )}
                  </td>
                </tr>,
              );
            }

            return rows;
          })}
        </tbody>
        {grandTotal && (
          <tfoot>
            <tr className="grand-total-row">
              <td className="border-right">
                {highlightText("GRAND TOTAL", search)}
                <span className="grand-total-sub">
                  0 Locations yet to report day's sales
                </span>
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.DAY_SALES_LY), search)}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.DAY_SALES_CY), search)}
              </td>
              <td
                className={`border-right ${grandTotal.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
              >
                {highlightText(
                  formatPercent(grandTotal.DAY_SALES_COMP),
                  search,
                )}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.WTD_SALES_LY), search)}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.WTD_SALES_CY), search)}
              </td>
              <td
                className={`border-right ${grandTotal.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
              >
                {highlightText(
                  formatPercent(grandTotal.WTD_SALES_COMP),
                  search,
                )}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.QTD_SALES_LY), search)}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.QTD_SALES_CY), search)}
              </td>
              <td
                className={`border-right ${grandTotal.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
              >
                {highlightText(
                  formatPercent(grandTotal.QTD_SALES_COMP),
                  search,
                )}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.YTD_SALES_LY), search)}
              </td>
              <td>
                {highlightText(formatNumber(grandTotal.YTD_SALES_CY), search)}
              </td>
              <td
                className={`border-right ${grandTotal.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"}`}
              >
                {highlightText(
                  formatPercent(grandTotal.YTD_SALES_COMP),
                  search,
                )}
              </td>
            </tr>
          </tfoot>
        )}
      </table>

      {/* Print/PDF only table (14 columns, active in print media query) */}
      <table className="sales-table-print">
        <thead>
          <tr>
            <th>STORE / TERRITORY</th>
            <th>FIRST SALE</th>
            <th>
              {lyYear} WK {wk}, DAY {dayDisplay} NET $
            </th>
            <th>
              {cyYear} WK {wk}, DAY {dayDisplay} NET $
            </th>
            <th>
              1 DAY COMP {lyYear} TO {cyYear}
            </th>
            <th>
              {lyYear} {isCalendar ? `MO ${monthStr}` : `WK ${wk}`},{" "}
              {isCalendar ? "MTD" : "WTD"} NET $
            </th>
            <th>
              {cyYear} {isCalendar ? `MO ${monthStr}` : `WK ${wk}`},{" "}
              {isCalendar ? "MTD" : "WTD"} NET $
            </th>
            <th>
              {isCalendar ? "MTD" : "WTD"} COMP {lyYear} TO {cyYear}
            </th>
            <th>
              {lyYear} Q{q}, QTD NET $
            </th>
            <th>
              {cyYear} Q{q}, QTD NET $
            </th>
            <th>
              QTD COMP {lyYear} TO {cyYear}
            </th>
            <th>{lyYear} YTD NET $</th>
            <th>{cyYear} YTD NET $</th>
            <th>
              YTD COMP {lyYear} TO {cyYear}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedTerritories.map(([territoryName, group], territoryIndex) => {
            const rows = [];
            const territoryClass =
              territoryIndex % 2 === 0
                ? "territory-group-even"
                : "territory-group-odd";

            // Store rows
            group.stores.forEach((store) => {
              const storeName = `${store.STORE_ID != null ? `${store.STORE_ID} ` : ""}${store.STORE_NAME || ""}`;
              const firstSale = store.DATE_OPENED
                ? store.DATE_OPENED.startsWith("'")
                  ? store.DATE_OPENED
                  : `'${store.DATE_OPENED.length >= 10 ? store.DATE_OPENED.substring(2) : store.DATE_OPENED}`
                : "";
              rows.push(
                <tr key={store.STORE_ID} className={territoryClass}>
                  <td>{storeName}</td>
                  <td>{firstSale}</td>
                  <td>{formatNumber(store.DAY_SALES_LY)}</td>
                  <td>{formatNumber(store.DAY_SALES_CY)}</td>
                  <td
                    className={
                      store.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(store.DAY_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.WTD_SALES_LY)}</td>
                  <td>{formatNumber(store.WTD_SALES_CY)}</td>
                  <td
                    className={
                      store.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(store.WTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.QTD_SALES_LY)}</td>
                  <td>{formatNumber(store.QTD_SALES_CY)}</td>
                  <td
                    className={
                      store.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(store.QTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(store.YTD_SALES_LY)}</td>
                  <td>{formatNumber(store.YTD_SALES_CY)}</td>
                  <td
                    className={
                      store.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(store.YTD_SALES_COMP)}
                  </td>
                </tr>,
              );
            });

            // Territory Total Row
            if (group.totalRow) {
              const tTotal = group.totalRow;
              rows.push(
                <tr
                  key={`${territoryName}-Total`}
                  className={`territory-row ${territoryClass}`}
                >
                  <td>{tTotal.STORE_NAME}</td>
                  <td></td>
                  <td>{formatNumber(tTotal.DAY_SALES_LY)}</td>
                  <td>{formatNumber(tTotal.DAY_SALES_CY)}</td>
                  <td
                    className={
                      tTotal.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(tTotal.DAY_SALES_COMP)}
                  </td>
                  <td>{formatNumber(tTotal.WTD_SALES_LY)}</td>
                  <td>{formatNumber(tTotal.WTD_SALES_CY)}</td>
                  <td
                    className={
                      tTotal.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(tTotal.WTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(tTotal.QTD_SALES_LY)}</td>
                  <td>{formatNumber(tTotal.QTD_SALES_CY)}</td>
                  <td
                    className={
                      tTotal.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(tTotal.QTD_SALES_COMP)}
                  </td>
                  <td>{formatNumber(tTotal.YTD_SALES_LY)}</td>
                  <td>{formatNumber(tTotal.YTD_SALES_CY)}</td>
                  <td
                    className={
                      tTotal.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                    }
                  >
                    {formatPercent(tTotal.YTD_SALES_COMP)}
                  </td>
                </tr>,
              );
            }

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
              <td
                className={
                  grandTotal.DAY_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                }
              >
                {formatPercent(grandTotal.DAY_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.WTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.WTD_SALES_CY)}</td>
              <td
                className={
                  grandTotal.WTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                }
              >
                {formatPercent(grandTotal.WTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.QTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.QTD_SALES_CY)}</td>
              <td
                className={
                  grandTotal.QTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                }
              >
                {formatPercent(grandTotal.QTD_SALES_COMP)}
              </td>
              <td>{formatNumber(grandTotal.YTD_SALES_LY)}</td>
              <td>{formatNumber(grandTotal.YTD_SALES_CY)}</td>
              <td
                className={
                  grandTotal.YTD_SALES_COMP >= 0 ? "comp-pos" : "comp-neg"
                }
              >
                {formatPercent(grandTotal.YTD_SALES_COMP)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
