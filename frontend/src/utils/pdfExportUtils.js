import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";
import { formatNumber, formatPercent } from "./dateUtils";

/**
 * Format timestamp matching salesapp formatDateTimeToYYMMDD:
 * "'YY MMM DD | HH:MM AM USA, Pacific"
 */
export function formatPDFTimestamp(date = new Date()) {
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

  return `'${year} ${month} ${day} | ${hours}:${minutes} ${realAmpm} USA, Pacific`;
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

  // 14 Table Columns
  const headers = [
    ["STORE / TERRITORY",
     "FIRST SALE",
     `${lyYear} Wk ${wk}, Day ${dayDisplay} Net $`,
     `${cyYear} Wk ${wk}, Day ${dayDisplay} Net $`,
     `1 Day Comp ${lyYear} to ${cyYear}`,
     `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? "MTD" : "WTD"} Net $`,
     `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}, ${isCalendar ? "MTD" : "WTD"} Net $`,
     `${isCalendar ? "MTD" : "WTD"} Comp ${lyYear} to ${cyYear}`,
     `${lyYear} Q${q}, QTD Net $`,
     `${cyYear} Q${q}, QTD Net $`,
     `QTD Comp ${lyYear} to ${cyYear}`,
     `${lyYear} YTD Net $`,
     `${cyYear} YTD Net $`,
     `YTD Comp ${lyYear} to ${cyYear}`]
  ];

  // Group rows by Territory matching screen hierarchy
  const territoryGroups = {};
  const territoryMeta = {};

  const storeRows = data.filter((r) => !r.IS_GRAND_TOTAL && !r.IS_TERRITORY_TOTAL);

  storeRows.forEach((r) => {
    const tName = r.TERRITORY || "Unknown";
    if (!territoryGroups[tName]) {
      territoryGroups[tName] = [];
      territoryMeta[tName] = { id: r.REGION_ID ?? 1, name: tName };
    }
    territoryGroups[tName].push(r);
  });

  // Sort stores within territory
  Object.keys(territoryGroups).forEach((tName) => {
    territoryGroups[tName].sort((a, b) =>
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
  const sortedTerritoryNames = Object.keys(territoryGroups).sort((a, b) => {
    const idA = Number(territoryMeta[a]?.id ?? 999);
    const idB = Number(territoryMeta[b]?.id ?? 999);
    return idA - idB;
  });

  // Build body table rows
  sortedTerritoryNames.forEach((tName) => {
    const stores = territoryGroups[tName];
    if (stores.length === 0) return;

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
    const meta = territoryMeta[tName];
    const tLabel = `${meta.id} ${tName} Total`;
    const tDayComp = calcComp(tCyDay, tLyDay);
    const tWtdComp = calcComp(tCyWtd, tLyWtd);
    const tQtdComp = calcComp(tCyQtd, tLyQtd);
    const tYtdComp = calcComp(tCyYtd, tLyYtd);

    body.push([
      tLabel,
      "",
      formatNumber(tLyDay),
      formatNumber(tCyDay),
      formatPercent(tDayComp),
      formatNumber(tLyWtd),
      formatNumber(tCyWtd),
      formatPercent(tWtdComp),
      formatNumber(tLyQtd),
      formatNumber(tCyQtd),
      formatPercent(tQtdComp),
      formatNumber(tLyYtd),
      formatNumber(tCyYtd),
      formatPercent(tYtdComp),
    ]);

    rowMeta.push({
      isTerritoryTotal: true,
      isGrandTotal: false,
      comps: [tDayComp, tWtdComp, tQtdComp, tYtdComp],
    });
  });

  // Calculate Grand Total across all store rows
  const sum = (field) => storeRows.reduce((acc, s) => acc + Number(s[field] ?? 0), 0);
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
    [
      "0 Locations yet to report day's sales",
      "", "", "", "", "", "", "", "", "", "", "", "", ""
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
      `Generated: ${formatPDFTimestamp(new Date())}`,
      pageWidth - 14.2,
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

  const GROUP_START_COLS = new Set([0, 1, 5, 8, 11]);
  const GROUP_END_COLS = new Set([0, 4, 7, 10, 13]);
  const CENTER_ALIGN_COLS = new Set([1, 4, 7, 10, 13]);
  const RIGHT_ALIGN_COLS = new Set([2, 3, 5, 6, 8, 9, 11, 12]);
  const CY_COLS = new Set([3, 6, 9, 12]);
  const COMP_COLS = new Map([[4, 0], [7, 1], [10, 2], [13, 3]]);

  autoTable(doc, {
    head: headers,
    body: body,
    foot: foot,
    startY: (search || "").trim() ? 18 : 14,
    margin: { top: 18, right: 13.5, bottom: 10, left: 13.5 },
    theme: "plain",
    showHead: "everyPage",
    showFoot: "lastPage",
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 13 },
      2: { cellWidth: 18 },
      3: { cellWidth: 18 },
      4: { cellWidth: 19 },
      5: { cellWidth: 18 },
      6: { cellWidth: 18 },
      7: { cellWidth: 19 },
      8: { cellWidth: 18 },
      9: { cellWidth: 18 },
      10: { cellWidth: 19 },
      11: { cellWidth: 18 },
      12: { cellWidth: 18 },
      13: { cellWidth: 19 },
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
      fontSize: 7,
      cellPadding: 1.2,
    },
    footStyles: {
      fillColor: [238, 243, 249],
      textColor: [40, 40, 40],
      fontStyle: "bold",
    },
    didParseCell: function (dataCell) {
      const colIndex = dataCell.column.index;
      const lastColIndex = dataCell.table.columns.length - 1;

      // Alignments
      if (dataCell.section === "head") {
        dataCell.cell.styles.halign = "center";
        dataCell.cell.styles.valign = "middle";
      } else {
        if (RIGHT_ALIGN_COLS.has(colIndex)) {
          dataCell.cell.styles.halign = "right";
        } else if (CENTER_ALIGN_COLS.has(colIndex)) {
          dataCell.cell.styles.halign = "center";
        } else {
          dataCell.cell.styles.halign = "left";
        }
      }

      // Border widths
      dataCell.cell.styles.lineColor = [120, 120, 120];

      let topBW = 0;
      let bottomBW = 0;
      let leftBW = 0;
      let rightBW = 0;

      if (GROUP_START_COLS.has(colIndex) || colIndex === 0) {
        leftBW = 0.4;
      }
      if (GROUP_END_COLS.has(colIndex) || colIndex === lastColIndex) {
        rightBW = 0.4;
      }

      if (dataCell.section === "head") {
        topBW = 0.4;
        bottomBW = 0.4;
      } else if (dataCell.section === "body") {
        const meta = rowMeta[dataCell.row.index];
        if (meta?.isTerritoryTotal) {
          topBW = 0;
          bottomBW = 0;
          dataCell.cell.styles.fontStyle = "bold";
        }

        // CY columns color -> #3A7785 -> [58, 119, 133]
        if (CY_COLS.has(colIndex)) {
          dataCell.cell.styles.textColor = [58, 119, 133];
        }

        // Comp % columns color -> green [40, 167, 69] / red [220, 53, 69]
        if (COMP_COLS.has(colIndex) && meta) {
          const compIdx = COMP_COLS.get(colIndex);
          const compVal = meta.comps[compIdx];
          if (compVal > 0) {
            dataCell.cell.styles.textColor = [40, 167, 69];
          } else if (compVal < 0) {
            dataCell.cell.styles.textColor = [220, 53, 69];
          }
        }
      } else if (dataCell.section === "foot") {
        const lastFootRowIndex = dataCell.table.foot.length - 1;
        const isLocationRow = dataCell.row.index === lastFootRowIndex;

        if (isLocationRow) {
          if (colIndex === 0) {
            dataCell.cell.colSpan = dataCell.table.columns.length;
          }
          dataCell.cell.styles.fontStyle = "normal";
          dataCell.cell.styles.fillColor = [255, 255, 255];
          dataCell.cell.styles.textColor = [40, 40, 40];
          dataCell.cell.styles.fontSize = 8;
          topBW = 0;
          bottomBW = 0;
          leftBW = 0;
          rightBW = 0;
        } else {
          topBW = 0.4;
          bottomBW = 0.4;
          dataCell.cell.styles.fontStyle = "bold";

          if (CY_COLS.has(colIndex)) {
            dataCell.cell.styles.textColor = [58, 119, 133];
          }
          if (COMP_COLS.has(colIndex)) {
            const gComps = [gDayComp, gWtdComp, gQtdComp, gYtdComp];
            const compVal = gComps[COMP_COLS.get(colIndex)];
            if (compVal > 0) {
              dataCell.cell.styles.textColor = [40, 167, 69];
            } else if (compVal < 0) {
              dataCell.cell.styles.textColor = [220, 53, 69];
            }
          }
        }
      }

      dataCell.cell.styles.lineWidth = {
        top: topBW,
        right: rightBW,
        bottom: bottomBW,
        left: leftBW,
      };
    },
    didDrawPage: function () {
      drawPageHeader();
      drawPageNumber();
    },
  });

  openPDFOutput(doc, isPrint);
}

/**
 * Helper to handle PDF download vs print opening
 */
function openPDFOutput(doc, isPrint) {
  const pdfBlob = doc.output("blob");
  const blobUrl = URL.createObjectURL(pdfBlob);

  if (isPrint) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = blobUrl;
    document.body.appendChild(iframe);

    const triggerPrint = () => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error("Print error:", err);
      }
    };

    iframe.onload = () => {
      setTimeout(triggerPrint, 200);
    };

    setTimeout(triggerPrint, 500);
  } else {
    window.open(blobUrl, "_blank");
  }
}

/**
 * Generates PDF for Analytics charts matching salesapp's DownloadSalesAnalytics()
 */
export async function generateAnalyticsPDF(containerId = "analytics-container", isPrint = false) {
  const container = document.getElementById(containerId) || document.body;
  
  try {
    const canvas = await html2canvas(container, {
      backgroundColor: "#ffffff",
      scale: 2,
    });

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

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("SALES - ANALYTICS", pageWidth / 2, 12, { align: "center" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatPDFTimestamp(new Date())}`, pageWidth - margin, 12, { align: "right" });

    const imgX = margin;
    const imgY = 20;
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

  // 1. Create off-screen clone with 1400px width for unclipped 2-column print layout matching salesapp
  const clone = originalElement.cloneNode(true);
  clone.id = `${containerId}_PrintClone`;
  clone.style.position = "absolute";
  clone.style.left = "-10000px";
  clone.style.top = "0";
  clone.style.width = "1400px";
  clone.style.background = "#ffffff";
  clone.style.display = "grid";
  clone.style.gridTemplateColumns = "1fr 1fr";
  clone.style.gap = "28px";
  clone.style.padding = "20px";
  clone.style.boxSizing = "border-box";
  document.body.appendChild(clone);

  // Hide headers inside clone if any
  clone
    .querySelectorAll("h1,h2,h3,h4,.header,.title,.grid-header,.section-title,.top-title")
    .forEach((el) => {
      el.style.display = "none";
    });

  // Scale tile typography matching salesapp DownloadSalesTiles
  const bump = (selector, size) => {
    clone.querySelectorAll(selector).forEach((el) => {
      el.style.fontSize = size;
    });
  };

  bump(".tile-rank", "54px");
  bump(".tile-store", "28px");
  bump(".tile-territory", "18px");
  bump(".mini-label", "15px");
  bump(".mini-values", "15px");
  bump(".tile-sales .lbl", "22px");
  bump(".tile-sales .val", "26px");

  clone.querySelectorAll(".tile").forEach((tile) => {
    tile.style.padding = "24px";
    tile.style.boxSizing = "border-box";
  });

  clone.querySelectorAll(".mini-label").forEach((label) => {
    label.style.width = "130px";
    label.style.minWidth = "130px";
  });

  clone.querySelectorAll(".mini-track").forEach((track) => {
    track.style.height = "16px";
  });
  clone.querySelectorAll(".mini-bar").forEach((bar) => {
    bar.style.height = "100%";
  });
  clone.querySelectorAll(".mini-row").forEach((row) => {
    row.style.marginBottom = "10px";
  });

  // Apply print-only padding-bottom to delta pill to fix vertical alignment in html2canvas
  clone.querySelectorAll(".mini-values .delta").forEach((el) => {
    el.style.paddingBottom = "12px";
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
    const margin = 15;

    const imgWidth = pageWidth - margin * 2;
    let finalHeight = (canvas.height * imgWidth) / canvas.width;
    if (finalHeight > pageHeight - 35) {
      finalHeight = pageHeight - 35;
    }

    // Centered Title
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(mainTitle.toUpperCase(), pageWidth / 2, 12, { align: "center" });

    // Subtitle under title
    if (subtitleStr) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(subtitleStr, margin, 18);
    }

    if (search) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Filter: ${search}`, margin, subtitleStr ? 23 : 18);
    }

    // Top-Right Timestamp
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated: ${formatPDFTimestamp(new Date())}`, pageWidth - margin, 12, { align: "right" });

    const imgY = subtitleStr ? (search ? 25 : 21) : (search ? 21 : 16);
    doc.addImage(imgData, "PNG", margin, imgY, imgWidth, finalHeight);

    doc.setFontSize(8);
    doc.text("Page 1", pageWidth / 2, pageHeight - 5, { align: "center" });

    openPDFOutput(doc, isPrint);
  } catch (err) {
    console.error("Error generating tiles PDF:", err);
  } finally {
    if (clone.parentNode) {
      document.body.removeChild(clone);
    }
  }
}
