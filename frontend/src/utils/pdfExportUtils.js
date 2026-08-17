import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { formatNumber, formatPercent } from "./dateUtils";
import { matchesSearchTerm } from "./highlightUtils";

/**
 * Format timestamp matching salesapp formatDateTimeToYYMMDD:
 * "'YY MMM DD | HH:MM AM USA, Pacific"
 */
export function formatPDFTimestamp(date = new Date(), includeTZ = false) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];
  const year = String(date.getFullYear()).slice(-2);
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const realAmpm = date.getHours() >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;

  const tzStr = includeTZ ? " USA, Pacific" : "";
  return `'${year} ${month} ${day} | ${hours}:${minutes} ${realAmpm}${tzStr}`;
}

/**
 * Format DATE_OPENED into 'YY-MM-DD format (e.g. "'18-10-04")
 */
function formatFirstSaleDate(dateStr) {
  if (!dateStr) return "";
  const clean = dateStr.trim();
  if (clean.length >= 10 && clean.includes("-")) {
    const parts = clean.split("-");
    if (parts.length === 3) {
      const yr = parts[0].length === 4 ? parts[0].slice(2) : parts[0];
      return `'${yr}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
    }
  }
  if (clean.startsWith("'")) return clean;
  return `'${clean}`;
}

/**
 * Generates exact vector PDF for All Sales matching salesapp's DowloadPDF()
 */
export function generateSalesPDF({
  data = [],
  selectedDate = "",
  weekNumber = 1,
  dayNumber = 1,
  quarterNumber = 1,
  calendarDayOfMonth = 0,
  calendarMonthNumber = 0,
  calendarMode = "fiscal",
  currencyMode = "1",
  search = "",
  isPrint = false,
  displayDateStr = "",
}) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  });

  const cyYear = new Date().getFullYear();
  const lyYear = cyYear - 1;
  const wk = String(weekNumber).padStart(2, "0");
  const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
  const isCalendar = calendarMode === "calendar";
  const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
  const monthStr = String(calendarMonthNumber).padStart(2, "0");

  const currText = currencyMode === "2" ? "NZ$" : "AU$";
  const calText = isCalendar ? "Calendar" : "Fiscal";

  // Build main date title string
  let finalDateStr = "";
  if (typeof displayDateStr === "string" && displayDateStr.trim()) {
    finalDateStr = displayDateStr.toUpperCase();
  } else {
    const dObj = selectedDate ? new Date(selectedDate) : new Date();
    const monthNames = [
      "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
      "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];
    const dayNames = [
      "SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"
    ];
    if (!isNaN(dObj.getTime())) {
      finalDateStr = `${dObj.getFullYear()} ${monthNames[dObj.getMonth()]} ${dObj.getDate()}, ${dayNames[dObj.getDay()]}`;
    } else {
      finalDateStr = String(selectedDate || "").toUpperCase();
    }
  }

  const mainTitle = `FLASH SALES ${currText} (${calText}) ON ${finalDateStr}`;

  // 14 Table Columns (uppercase titles matching salesapp)
  const headers = [
    [
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
      `${lyYear} YTD NET $`,
      `${cyYear} YTD NET $`,
      `YTD COMP ${lyYear} TO ${cyYear}`,
    ],
  ];

  // Group rows by Territory matching screen hierarchy
  const territoryGroups = {};

  const terms = (
    search.includes("++")
      ? search.toLowerCase().split("++")
      : search.toLowerCase().split(/\s+/)
  )
    .map((s) => s.trim())
    .filter(Boolean);

  const isSearching = terms.length > 0;

  data.forEach((r) => {
    if (r.IS_GRAND_TOTAL) return;
    const tName = r.TERRITORY || "Unknown";
    if (!territoryGroups[tName]) {
      territoryGroups[tName] = { id: r.REGION_ID ?? 1, stores: [], totalRow: null };
    }
    if (r.IS_TERRITORY_TOTAL) {
      territoryGroups[tName].totalRow = r;
      if (r.REGION_ID) territoryGroups[tName].id = r.REGION_ID;
    } else {
      territoryGroups[tName].stores.push(r);
      if (r.REGION_ID) territoryGroups[tName].id = r.REGION_ID;
    }
  });

  const getSearchableRowStrings = (r) => {
    const dateStr = r.DATE_OPENED
      ? r.DATE_OPENED.length >= 10
        ? r.DATE_OPENED.substring(2)
        : r.DATE_OPENED
      : "";
    const firstSaleStr = dateStr ? `First Sale ${dateStr}` : "";
    return [
      r.STORE_ID != null ? String(r.STORE_ID) : "",
      r.STORE_NAME || "",
      dateStr,
      firstSaleStr,
      r.REGION_ID != null ? String(r.REGION_ID) : "",
      r.TERRITORY || "",
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
      r.DAY_SALES_LY != null ? String(Math.round(r.DAY_SALES_LY)) : "",
      r.DAY_SALES_CY != null ? String(Math.round(r.DAY_SALES_CY)) : "",
      r.WTD_SALES_LY != null ? String(Math.round(r.WTD_SALES_LY)) : "",
      r.WTD_SALES_CY != null ? String(Math.round(r.WTD_SALES_CY)) : "",
      r.QTD_SALES_LY != null ? String(Math.round(r.QTD_SALES_LY)) : "",
      r.QTD_SALES_CY != null ? String(Math.round(r.QTD_SALES_CY)) : "",
      r.YTD_SALES_LY != null ? String(Math.round(r.YTD_SALES_LY)) : "",
      r.YTD_SALES_CY != null ? String(Math.round(r.YTD_SALES_CY)) : "",
    ];
  };

  if (isSearching) {
    Object.keys(territoryGroups).forEach((tName) => {
      territoryGroups[tName].stores = territoryGroups[tName].stores.filter((r) => {
        const searchableStrings = getSearchableRowStrings(r);
        return terms.some((q) =>
          searchableStrings.some((str) => matchesSearchTerm(str, q))
        );
      });

      if (territoryGroups[tName].totalRow) {
        const totalSearchable = getSearchableRowStrings(territoryGroups[tName].totalRow);
        const totalMatches = terms.some((q) =>
          totalSearchable.some((str) => matchesSearchTerm(str, q))
        );
        if (!totalMatches) {
          territoryGroups[tName].totalRow = null;
        }
      }
    });
  }

  // Sort stores within territory
  Object.keys(territoryGroups).forEach((tName) => {
    territoryGroups[tName].stores.sort((a, b) =>
      (a.STORE_NAME ?? "").localeCompare(b.STORE_NAME ?? "")
    );
  });

  const body = [];
  const rowMeta = [];

  const calcComp = (cy, ly) => {
    if (cy === 0 || ly === 0) return 0;
    return ((cy - ly) / ly) * 100;
  };

  // Sort territory names numerically by REGION_ID (1, 2, 3, ..., 9, 50)
  const sortedTerritoryNames = Object.keys(territoryGroups)
    .filter((tName) => territoryGroups[tName].stores.length > 0 || territoryGroups[tName].totalRow !== null)
    .sort((a, b) => {
      const idA = Number(territoryGroups[a]?.id ?? 999);
      const idB = Number(territoryGroups[b]?.id ?? 999);
      return idA - idB;
    });

  // Build body table rows
  sortedTerritoryNames.forEach((tName) => {
    const group = territoryGroups[tName];
    const stores = group.stores;

    let tLyDay = 0, tCyDay = 0;
    let tLyWtd = 0, tCyWtd = 0;
    let tLyQtd = 0, tCyQtd = 0;
    let tLyYtd = 0, tCyYtd = 0;

    stores.forEach((s) => {
      const lyDay = Number(s.DAY_SALES_LY ?? 0);
      const cyDay = Number(s.DAY_SALES_CY ?? 0);
      const dayComp = s.DAY_SALES_COMP ?? calcComp(cyDay, lyDay);

      const lyWtd = Number(s.WTD_SALES_LY ?? 0);
      const cyWtd = Number(s.WTD_SALES_CY ?? 0);
      const wtdComp = s.WTD_SALES_COMP ?? calcComp(cyWtd, lyWtd);

      const lyQtd = Number(s.QTD_SALES_LY ?? 0);
      const cyQtd = Number(s.QTD_SALES_CY ?? 0);
      const qtdComp = s.QTD_SALES_COMP ?? calcComp(cyQtd, lyQtd);

      const lyYtd = Number(s.YTD_SALES_LY ?? 0);
      const cyYtd = Number(s.YTD_SALES_CY ?? 0);
      const ytdComp = s.YTD_SALES_COMP ?? calcComp(cyYtd, lyYtd);

      tLyDay += lyDay; tCyDay += cyDay;
      tLyWtd += lyWtd; tCyWtd += cyWtd;
      tLyQtd += lyQtd; tCyQtd += cyQtd;
      tLyYtd += lyYtd; tCyYtd += cyYtd;

      const storeIdStr = s.STORE_ID ? `${s.STORE_ID} ` : "";
      const storeCell = `${storeIdStr}${s.STORE_NAME ?? ""}`.trim();
      const firstSaleCell = formatFirstSaleDate(s.DATE_OPENED);

      body.push([
        storeCell,
        firstSaleCell,
        formatNumber(lyDay),
        formatNumber(cyDay),
        formatPercent(dayComp),
        formatNumber(lyWtd),
        formatNumber(cyWtd),
        formatPercent(wtdComp),
        formatNumber(lyQtd),
        formatNumber(cyQtd),
        formatPercent(qtdComp),
        formatNumber(lyYtd),
        formatNumber(cyYtd),
        formatPercent(ytdComp),
      ]);

      rowMeta.push({
        isTerritoryTotal: false,
        isGrandTotal: false,
        comps: [dayComp, wtdComp, qtdComp, ytdComp],
      });
    });

    // Add Territory Subtotal row
    const rawTotal = group.totalRow;
    const showTotal = !isSearching || rawTotal !== null;
    if (showTotal) {
      const regionPrefix = group.id ? `${group.id} ` : "";
      let tLabel = rawTotal?.STORE_NAME || `${regionPrefix}${tName} Total`;
      if (regionPrefix && !tLabel.startsWith(regionPrefix)) {
        tLabel = `${regionPrefix}${tLabel}`;
      }

      const totLyDay = rawTotal ? Number(rawTotal.DAY_SALES_LY ?? 0) : tLyDay;
      const totCyDay = rawTotal ? Number(rawTotal.DAY_SALES_CY ?? 0) : tCyDay;
      const totDayComp = rawTotal ? Number(rawTotal.DAY_SALES_COMP ?? 0) : calcComp(tCyDay, tLyDay);

      const totLyWtd = rawTotal ? Number(rawTotal.WTD_SALES_LY ?? 0) : tLyWtd;
      const totCyWtd = rawTotal ? Number(rawTotal.WTD_SALES_CY ?? 0) : tCyWtd;
      const totWtdComp = rawTotal ? Number(rawTotal.WTD_SALES_COMP ?? 0) : calcComp(tCyWtd, tLyWtd);

      const totLyQtd = rawTotal ? Number(rawTotal.QTD_SALES_LY ?? 0) : tLyQtd;
      const totCyQtd = rawTotal ? Number(rawTotal.QTD_SALES_CY ?? 0) : tCyQtd;
      const totQtdComp = rawTotal ? Number(rawTotal.QTD_SALES_COMP ?? 0) : calcComp(tCyQtd, tLyQtd);

      const totLyYtd = rawTotal ? Number(rawTotal.YTD_SALES_LY ?? 0) : tLyYtd;
      const totCyYtd = rawTotal ? Number(rawTotal.YTD_SALES_CY ?? 0) : tCyYtd;
      const totYtdComp = rawTotal ? Number(rawTotal.YTD_SALES_COMP ?? 0) : calcComp(tCyYtd, tLyYtd);

      body.push([
        tLabel,
        "",
        formatNumber(totLyDay),
        formatNumber(totCyDay),
        formatPercent(totDayComp),
        formatNumber(totLyWtd),
        formatNumber(totCyWtd),
        formatPercent(totWtdComp),
        formatNumber(totLyQtd),
        formatNumber(totCyQtd),
        formatPercent(totQtdComp),
        formatNumber(totLyYtd),
        formatNumber(totCyYtd),
        formatPercent(totYtdComp),
      ]);

      rowMeta.push({
        isTerritoryTotal: true,
        isGrandTotal: false,
        comps: [totDayComp, totWtdComp, totQtdComp, totYtdComp],
      });
    }
  });

  // Calculate Grand Total across all store rows
  const allStoreRows = data.filter(
    (r) => !r.IS_GRAND_TOTAL && !r.IS_TERRITORY_TOTAL,
  );
  const sum = (field) =>
    allStoreRows.reduce((acc, s) => acc + Number(s[field] ?? 0), 0);
  const gLyDay = sum("DAY_SALES_LY");
  const gCyDay = sum("DAY_SALES_CY");
  const gLyWtd = sum("WTD_SALES_LY");
  const gCyWtd = sum("WTD_SALES_CY");
  const gLyQtd = sum("QTD_SALES_LY");
  const gCyQtd = sum("QTD_SALES_CY");
  const gLyYtd = sum("YTD_SALES_LY");
  const gCyYtd = sum("YTD_SALES_CY");

  const gDayComp = calcComp(gCyDay, gLyDay);
  const gWtdComp = calcComp(gCyWtd, gLyWtd);
  const gQtdComp = calcComp(gCyQtd, gLyQtd);
  const gYtdComp = calcComp(gCyYtd, gLyYtd);

  const foot = [
    [
      "GRAND TOTAL",
      "",
      formatNumber(gLyDay),
      formatNumber(gCyDay),
      formatPercent(gDayComp),
      formatNumber(gLyWtd),
      formatNumber(gCyWtd),
      formatPercent(gWtdComp),
      formatNumber(gLyQtd),
      formatNumber(gCyQtd),
      formatPercent(gQtdComp),
      formatNumber(gLyYtd),
      formatNumber(gCyYtd),
      formatPercent(gYtdComp),
    ],
  ];

  function drawPageHeader() {
    const pageWidth = doc.internal.pageSize.width;

    let sFilteredText = (search || "").trim();
    if (sFilteredText !== "") {
      sFilteredText = `Filter: ${sFilteredText}`;
    }

    doc.setFontSize(13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(mainTitle, 13.5, 10);

    const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
    if (pageNumber === 1 && sFilteredText) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(sFilteredText, 13.5, 14);
    }

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${formatPDFTimestamp(new Date(), true)}`,
      pageWidth - 13.5,
      10,
      { align: "right" }
    );
  }

  function drawPageNumber() {
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text("Page " + pageNumber, pageWidth / 2, pageHeight - 5, { align: "center" });
  }

  const GROUP_END_COLS = new Set([0, 1, 4, 7, 10, 13]);
  const CENTER_ALIGN_COLS = new Set([1, 4, 7, 10, 13]);
  const RIGHT_ALIGN_COLS = new Set([2, 3, 5, 6, 8, 9, 11, 12]);
  const CY_COLS = new Set([3, 6, 9, 12]);
  const COMP_COLS = new Map([[4, 0], [7, 1], [10, 2], [13, 3]]);

  autoTable(doc, {
    head: headers,
    body: body,
    foot: foot,
    startY: (search || "").trim() ? 17 : 13,
    margin: { top: 18, right: 13.5, bottom: 10, left: 13.5 },
    theme: "plain",
    showHead: "everyPage",
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 13 },
      2: { cellWidth: 17.5 },
      3: { cellWidth: 17.5 },
      4: { cellWidth: 17.85 },
      5: { cellWidth: 17.5 },
      6: { cellWidth: 17.5 },
      7: { cellWidth: 17.85 },
      8: { cellWidth: 17.5 },
      9: { cellWidth: 17.5 },
      10: { cellWidth: 17.85 },
      11: { cellWidth: 17.5 },
      12: { cellWidth: 17.5 },
      13: { cellWidth: 17.85 },
    },
    styles: {
      fontSize: 7,
      cellPadding: 1.2,
      textColor: [40, 40, 40],
      fillColor: [255, 255, 255],
      lineWidth: 0,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: [238, 243, 249],
      textColor: [70, 70, 70],
      fontStyle: "bold",
      halign: "center",
      valign: "middle",
      fontSize: 6.8,
      cellPadding: 1.2,
    },
    footStyles: {
      fillColor: [238, 243, 249],
      textColor: [40, 40, 40],
      fontStyle: "bold",
    },
    didParseCell: function (dataCell) {
      const colIndex = dataCell.column.index;

      // Alignments
      if (dataCell.section === "head") {
        if (colIndex === 0) {
          dataCell.cell.styles.halign = "left";
          dataCell.cell.styles.valign = "bottom";
        } else {
          dataCell.cell.styles.halign = "center";
          dataCell.cell.styles.valign = "middle";
        }
      } else {
        if (RIGHT_ALIGN_COLS.has(colIndex)) {
          dataCell.cell.styles.halign = "right";
        } else if (CENTER_ALIGN_COLS.has(colIndex)) {
          dataCell.cell.styles.halign = "center";
        } else {
          dataCell.cell.styles.halign = "left";
        }
      }

      dataCell.cell.styles.lineColor = [160, 175, 195];

      let topBW = 0;
      let rightBW = 0;
      let bottomBW = 0;
      let leftBW = 0;

      // Outer left border and first column dividers
      if (colIndex === 0) {
        leftBW = 0.3;
        rightBW = 0.3;
      } else if (colIndex === 1) {
        rightBW = 0.3;
      } else if (colIndex === 13) {
        rightBW = 0.3;
      }

      // Middle 3 vertical dividing lines (after 1 Day Comp, after WTD Comp, after QTD Comp)
      if (colIndex === 4 || colIndex === 7 || colIndex === 10) {
        rightBW = 0.45;
      }

      if (dataCell.section === "head") {
        topBW = 0.35;
        bottomBW = 0.35;
      } else if (dataCell.section === "body") {
        const meta = rowMeta[dataCell.row.index];
        if (meta && meta.isTerritoryTotal) {
          dataCell.cell.styles.fontStyle = "bold";
          dataCell.cell.styles.textColor = [0, 0, 0];
        }

        if (CY_COLS.has(colIndex)) {
          dataCell.cell.styles.textColor = [58, 119, 133];
        }

        if (COMP_COLS.has(colIndex) && meta) {
          const compVal = meta.comps[COMP_COLS.get(colIndex)];
          if (compVal > 0) {
            dataCell.cell.styles.textColor = [40, 167, 69];
          } else if (compVal < 0) {
            dataCell.cell.styles.textColor = [220, 53, 69];
          }
        }
      } else if (dataCell.section === "foot") {
        topBW = 0.35;
        bottomBW = 0.35;
        dataCell.cell.styles.fontStyle = "bold";
        dataCell.cell.styles.textColor = [0, 0, 0];
      }

      dataCell.cell.styles.lineWidth = {
        top: topBW,
        right: rightBW,
        bottom: bottomBW,
        left: leftBW,
      };
    },
    didDrawPage: function (pageData) {
      drawPageHeader();
      drawPageNumber();

      // Render subtitle below table on last page
      const pageInfo = doc.internal.getCurrentPageInfo();
      if (pageInfo.pageNumber === doc.internal.getNumberOfPages()) {
        const finalY = pageData.cursor?.y || 200;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(60, 60, 60);
        doc.text("0 Locations yet to report day's sales", 13.5, finalY + 4);
      }
    },
  });

  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, "0");
  const fnTs = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const filename = `FlashSales_${calendarMode}_${fnTs}`;
  openPDFOutput(doc, isPrint, filename);
}

/**
 * Helper to handle PDF download vs print opening
 */
function openPDFOutput(doc, isPrint, filename = "FlashSales") {
  if (isPrint) {
    try {
      doc.autoPrint();
      const blobUrl = doc.output("bloburl");
      const win = window.open(blobUrl, "_blank");
      if (!win) {
        window.print();
      }
    } catch {
      window.print();
    }
  } else {
    const fn = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    doc.save(fn);
  }
}

/**
 * Generates PDF for Analytics charts matching salesapp's DownloadSalesAnalytics()
 */
export async function generateAnalyticsPDF(containerId = "dAnltcsCharts", isPrint = false) {
  const container = document.getElementById(containerId) || document.body;
  if (!container) return;

  try {
    const swapBtn = document.getElementById("spnSwap");
    const oldSwapDisplay = swapBtn ? swapBtn.style.display : null;
    if (swapBtn) {
      swapBtn.style.display = "none";
    }

    // Direct chart children divs (excluding swapBtn)
    const chartDivs = Array.from(container.children).filter(
      (child) => child.id !== "spnSwap" && child.nodeType === 1
    );

    // Save original styles for layout restoration
    const origContainerFlexDirection = container.style.flexDirection;
    const origContainerDisplay = container.style.display;
    const origContainerWidth = container.style.width;

    const origChildStyles = chartDivs.map((child) => ({
      el: child,
      flex: child.style.flex,
      width: child.style.width,
      minWidth: child.style.minWidth,
      marginBottom: child.style.marginBottom,
    }));

    // Temporarily stack visible charts vertically at 100% width matching salesapp DownloadSalesAnalytics
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.width = "100%";

    chartDivs.forEach((child, idx) => {
      child.style.flex = "1 1 100%";
      child.style.width = "100%";
      child.style.minWidth = "100%";
      if (chartDivs.length > 1 && idx === 0) {
        child.style.marginBottom = "20px";
      }
    });

    // Pause briefly for DOM layout update
    await new Promise((resolve) => setTimeout(resolve, 100));

    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    // Instantly restore original layout styles
    container.style.flexDirection = origContainerFlexDirection;
    container.style.display = origContainerDisplay;
    container.style.width = origContainerWidth;

    origChildStyles.forEach(({ el, flex, width, minWidth, marginBottom }) => {
      el.style.flex = flex;
      el.style.width = width;
      el.style.minWidth = minWidth;
      el.style.marginBottom = marginBottom;
    });

    if (swapBtn && oldSwapDisplay !== null) {
      swapBtn.style.display = oldSwapDisplay;
    }

    const imgData = canvas.toDataURL("image/png", 1.0);
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;

    const imgWidth = pageWidth - margin * 2;
    let finalHeight = (canvas.height * imgWidth) / canvas.width;
    if (finalHeight > pageHeight - 40) {
      finalHeight = pageHeight - 40;
    }

    // Header Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "normal");
    doc.text("SALES - ANALYTICS", pageWidth / 2, 12, { align: "center" });

    // Top-Right Timestamp
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatPDFTimestamp(new Date(), false)}`, pageWidth - margin, 12, { align: "right" });

    let imgX = margin;
    let imgY = 20;

    // Centre vertically when only one chart is visible
    if (chartDivs.length === 1) {
      const topMargin = 20;
      const bottomMargin = 12;
      const availableHeight = pageHeight - topMargin - bottomMargin;
      imgY = topMargin + (availableHeight - finalHeight) / 2;
      imgY = Math.max(20, imgY);
    }

    doc.addImage(imgData, "PNG", imgX, imgY, imgWidth, finalHeight);

    doc.setFontSize(8);
    doc.text("Page 1", pageWidth / 2, pageHeight - 8, { align: "center" });

    openPDFOutput(doc, isPrint);
  } catch (err) {
    console.error("Error generating analytics PDF:", err);
  }
}

/**
 * Generates PDF for Top Sales / Laggards Tiles matching salesapp's DownloadSalesTiles()
 */
export async function generateTilesPDF(
  containerId,
  mainTitle = "TOP 10 STORES",
  subtitleStr = "",
  search = "",
  isPrint = false
) {
  const originalElement = document.getElementById(containerId);
  if (!originalElement) return;

  // 1. Create off-screen clone with 1200px width for unclipped 2-column print layout matching salesapp
  const clone = originalElement.cloneNode(true);
  clone.id = `${containerId}_PrintClone`;
  clone.style.position = "absolute";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.width = "1200px";
  clone.style.background = "#ffffff";
  clone.style.display = "grid";
  clone.style.gridTemplateColumns = "1fr 1fr";
  clone.style.gap = "22px";
  clone.style.padding = "0px";
  clone.style.boxSizing = "border-box";
  document.body.appendChild(clone);

  // Hide empty/unneeded headers
  clone
    .querySelectorAll(".tile-title, h1, h2, h3, h4, .header, .title, .grid-header, .section-title, .top-title")
    .forEach((el) => {
      el.style.display = "none";
    });

  const existingTiles = Array.from(clone.querySelectorAll(".tile"));
  existingTiles.forEach((tile) => {
    tile.style.minHeight = "250px";
    tile.style.padding = "20px 24px";
    tile.style.boxSizing = "border-box";
    tile.style.borderRadius = "12px";
    tile.style.overflow = "visible";
    tile.style.position = "relative";
    tile.style.display = "flex";
    tile.style.flexDirection = "column";
    tile.style.justifyContent = "space-between";
  });

  // Ensure the print page grid always reserves the full 10-card capacity layout (5 rows x 2 columns).
  // If there are fewer than 10 cards (e.g. 1, 2, or 3 cards), fill the remaining slots with invisible placeholders.
  // This guarantees that:
  // 1) The 10-card cards section remains vertically centered on the page.
  // 2) Cards fill in order from the top-left corner (Row 1 Col 1 -> Row 1 Col 2 -> Row 2 Col 1...).
  // 3) When there are only 1 or 2 cards, they stay pinned to the top-left corner of the cards section instead of jumping to the middle.
  const numTiles = existingTiles.length;
  if (numTiles > 0 && numTiles < 10) {
    const tileHeight = existingTiles[0]?.offsetHeight || 250;
    for (let i = numTiles; i < 10; i++) {
      const placeholder = document.createElement("div");
      placeholder.className = "tile-placeholder";
      placeholder.style.minHeight = `${tileHeight}px`;
      placeholder.style.height = `${tileHeight}px`;
      placeholder.style.visibility = "hidden";
      placeholder.style.margin = "0";
      placeholder.style.padding = "0";
      placeholder.style.border = "none";
      placeholder.style.boxSizing = "border-box";
      clone.appendChild(placeholder);
    }
  }

  clone.querySelectorAll(".tile .tile-body").forEach((body) => {
    body.style.padding = "0";
    body.style.width = "100%";
    body.style.overflow = "visible";
    body.style.display = "flex";
    body.style.flexDirection = "column";
    body.style.justifyContent = "space-between";
    body.style.flex = "1";
  });

  // Rank: static position so it doesn't overlap store name
  clone.querySelectorAll(".tile-rank").forEach((rank) => {
    rank.style.fontSize = "42px";
    rank.style.fontWeight = "800";
    rank.style.lineHeight = "1";
    rank.style.position = "static";
    rank.style.margin = "0 0 6px 0";
    rank.style.padding = "0";
    rank.style.width = "auto";
  });

  // Medal: vertically centered circular badge
  clone.querySelectorAll(".medal").forEach((medal) => {
    medal.style.position = "absolute";
    medal.style.top = "16px";
    medal.style.right = "16px";
    medal.style.width = "36px";
    medal.style.height = "36px";
    medal.style.borderRadius = "50%";
    medal.style.display = "flex";
    medal.style.flexDirection = "column";
    medal.style.alignItems = "center";
    medal.style.justifyContent = "center";
    medal.style.padding = "0";
    medal.style.margin = "0";
    medal.style.boxSizing = "border-box";
  });
  clone.querySelectorAll(".medal i").forEach((icon) => {
    icon.style.fontSize = "16px";
    icon.style.lineHeight = "1";
    icon.style.display = "block";
    icon.style.position = "relative";
    icon.style.top = "1px";
    icon.style.margin = "0 0 1px 0";
    icon.style.padding = "0";
  });
  clone.querySelectorAll(".medal span").forEach((span) => {
    span.style.fontSize = "8px";
    span.style.lineHeight = "1";
    span.style.display = "block";
    span.style.position = "relative";
    span.style.top = "-3px";
    span.style.margin = "0";
    span.style.padding = "0";
    span.style.fontWeight = "700";
  });

  // Store & Territory with full line-height and no overflow clipping
  clone.querySelectorAll(".tile-store").forEach((store) => {
    store.style.fontSize = "20px";
    store.style.fontWeight = "800";
    store.style.lineHeight = "1.35";
    store.style.margin = "0 0 4px 0";
    store.style.padding = "0";
    store.style.overflow = "visible";
    store.style.whiteSpace = "normal";
    store.style.textOverflow = "clip";
  });

  clone.querySelectorAll(".tile-territory").forEach((ter) => {
    ter.style.fontSize = "12.5px";
    ter.style.lineHeight = "1.3";
    ter.style.margin = "0 0 12px 0";
    ter.style.padding = "0";
    ter.style.overflow = "visible";
    ter.style.whiteSpace = "normal";
    ter.style.opacity = "0.95";
  });

  // Mini Bar Chart
  clone.querySelectorAll(".mini-chart").forEach((chart) => {
    chart.style.margin = "8px 0 10px 0";
    chart.style.padding = "0";
  });

  clone.querySelectorAll(".mini-row").forEach((row) => {
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.margin = "0 0 5px 0";
  });

  clone.querySelectorAll(".mini-label").forEach((label) => {
    label.style.width = "100px";
    label.style.minWidth = "100px";
    label.style.fontSize = "12.5px";
    label.style.fontWeight = "700";
    label.style.lineHeight = "1.2";
  });

  clone.querySelectorAll(".mini-track").forEach((track) => {
    track.style.flex = "1";
    track.style.height = "11px";
    track.style.borderRadius = "999px";
  });
  clone.querySelectorAll(".mini-bar").forEach((bar) => {
    bar.style.height = "100%";
    bar.style.borderRadius = "999px";
  });

  // Mini Values & Underline separation
  clone.querySelectorAll(".mini-values").forEach((mv) => {
    mv.style.display = "flex";
    mv.style.alignItems = "center";
    mv.style.justifyContent = "space-between";
    mv.style.margin = "10px 0 0 0";
    mv.style.padding = "0";
  });

  clone.querySelectorAll(".mini-values > div:first-child").forEach((el) => {
    el.style.borderBottom = "1px solid rgba(255, 255, 255, 0.75)";
    el.style.paddingBottom = "6px";
    el.style.marginRight = "12px";
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.2";
    el.style.flex = "1";
  });

  // Delta pill badge: perfectly centered text horizontally and vertically
  clone.querySelectorAll(".mini-values .delta").forEach((el) => {
    const text = el.textContent ? el.textContent.trim() : "";
    const color = el.style.color || "#15803d";
    el.innerHTML = `<span style="display:inline-block;position:relative;top:-6px;font-size:11.5px;font-weight:800;line-height:1;color:${color};">${text}</span>`;
    el.style.display = "inline-flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.height = "22px";
    el.style.padding = "0 10px";
    el.style.borderRadius = "999px";
    el.style.background = "#ffffff";
    el.style.boxSizing = "border-box";
    el.style.margin = "0";
    el.style.whiteSpace = "nowrap";
  });

  // Bottom Sales Row
  clone.querySelectorAll(".tile-sales").forEach((sales) => {
    sales.style.display = "flex";
    sales.style.justifyContent = "space-between";
    sales.style.alignItems = "baseline";
    sales.style.paddingTop = "10px";
    sales.style.margin = "0";
  });

  clone.querySelectorAll(".tile-sales .lbl").forEach((lbl) => {
    lbl.style.fontSize = "20px";
    lbl.style.lineHeight = "1";
  });

  clone.querySelectorAll(".tile-sales .val").forEach((val) => {
    val.style.fontSize = "24px";
    val.style.fontWeight = "900";
    val.style.lineHeight = "1";
  });

  try {
    const canvas = await html2canvas(clone, {
      backgroundColor: "#ffffff",
      scale: 2,
      useCORS: true,
    });

    const imgData = canvas.toDataURL("image/png", 1.0);
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "letter",
    });

    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 12;

    const headerBottomY = subtitleStr ? (search ? 25 : 19.5) : (search ? 19.5 : 13.5);
    const footerY = pageHeight - 8;
    const availableSpace = footerY - headerBottomY;
    const minGap = 5;

    let imgWidth = pageWidth - margin * 2;
    let finalHeight = (canvas.height * imgWidth) / canvas.width;

    if (finalHeight > availableSpace - minGap * 2) {
      finalHeight = availableSpace - minGap * 2;
      imgWidth = (finalHeight * canvas.width) / canvas.height;
    }

    const gap = (availableSpace - finalHeight) / 2;
    const imgX = (pageWidth - imgWidth) / 2;
    const imgY = headerBottomY + gap;

    const rightEdge = imgX + imgWidth;
    const centerX = imgX + imgWidth / 2;

    // Centered Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(mainTitle.toUpperCase(), centerX, 12, { align: "center" });

    // Top-Right Timestamp (perfectly aligned with end of cards)
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatPDFTimestamp(new Date())}`, rightEdge, 12, { align: "right" });

    // Subtitle under title (perfectly aligned with start of cards)
    if (subtitleStr) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(subtitleStr, imgX, 18);
    }

    if (search) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Filter: ${search}`, imgX, subtitleStr ? 23 : 18);
    }

    doc.addImage(imgData, "PNG", imgX, imgY, imgWidth, finalHeight);

    // Page 1 footer text (centered and symmetrical to top gap)
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Page 1", centerX, footerY, { align: "center" });

    openPDFOutput(doc, isPrint, `${mainTitle.replace(/[^a-zA-Z0-9]/g, "_")}`);
  } catch (err) {
    console.error("Error generating tiles PDF:", err);
  } finally {
    if (clone.parentNode) {
      document.body.removeChild(clone);
    }
  }
}
