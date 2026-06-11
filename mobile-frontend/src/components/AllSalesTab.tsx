import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Platform,
  Modal,
  Pressable,
  useWindowDimensions,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AntDesign from "@expo/vector-icons/AntDesign";
import { SalesPivotRow } from "../types/sales";
import { formatNumber, formatPercent } from "../utils/dateUtils";
import MaterialCommunityIcons2 from "@expo/vector-icons/MaterialCommunityIcons";
import EvilIcons from "@expo/vector-icons/EvilIcons";
import * as XLSX from "xlsx-js-style";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import type { CalendarMode } from "../../app/flash-sales";
import { useAppTheme } from "../theme/ThemeContext";


interface AllSalesTabProps {
  data: SalesPivotRow[];
  loading: boolean;
  weekNumber: number;
  dayNumber: number;
  quarterNumber: number;
  calendarDayOfMonth?: number;
  calendarMonthNumber?: number;
  registeredStores: number;
  calendarMode: CalendarMode;
  onCalendarModeChange: (mode: CalendarMode) => void;
  isLandscape: boolean;
  onBindExportActions?: (actions: { exportExcel: () => void; exportCSV: () => void; exportPDF?: () => void; printPDF?: () => void }) => void;
}

/* ── sub-components ────────────────────────────────────────── */

const CompCell = React.memo(function CompCell({ value, bold }: { value: number; bold?: boolean }) {
  const { theme } = useAppTheme();
  const useWhiteTableText = theme.name === "dark" || theme.name === "forest" || theme.name === "wine";
  const color = useWhiteTableText
    ? theme.colors.textInverse
    : (value ?? 0) >= 0
      ? theme.colors.success
      : theme.colors.danger;
  const fontFamily = bold ? "Montserrat_500Medium" : "Montserrat_500Medium";
  return (
    <Text style={[styles.val, styles.center2, { color, fontFamily }]}>
      {formatPercent(value)}
    </Text>
  );
});

const DataCells = React.memo(function DataCells({ row, bold, noLines }: { row: SalesPivotRow; bold?: boolean; noLines?: boolean }) {
  const { theme } = useAppTheme();
  const useWhiteTableText = theme.name === "dark" || theme.name === "forest" || theme.name === "wine";
  const valueColor = useWhiteTableText ? theme.colors.textInverse : theme.colors.textPrimary;

  const s = [styles.val, styles.right, bold && styles.bold, { color: valueColor }];
  const sCy = [styles.val, styles.right, bold && styles.bold, !useWhiteTableText && styles.cyColValue, { color: valueColor }];
  return (
    <>
      {/* Day */}
      <View style={[styles.cell, styles.numW]}>
        <Text style={s}>{formatNumber(row.DAY_SALES_LY)}</Text>
      </View>
      <View style={[styles.cell, styles.numW]}>
        <Text style={sCy}>{formatNumber(row.DAY_SALES_CY)}</Text>
      </View>
      <View style={[styles.cell, styles.compW]}>
        <CompCell value={row.DAY_SALES_COMP} bold={bold} />
      </View>
      {!noLines && <View style={styles.colDivider} />}
      {/* WTD */}
      <View style={[styles.cell, styles.numW]}>
        <Text style={s}>{formatNumber(row.WTD_SALES_LY)}</Text>
      </View>
      <View style={[styles.cell, styles.numW]}>
        <Text style={sCy}>{formatNumber(row.WTD_SALES_CY)}</Text>
      </View>
      <View style={[styles.cell, styles.compW]}>
        <CompCell value={row.WTD_SALES_COMP} bold={bold} />
      </View>
      {!noLines && <View style={styles.colDivider} />}
      {/* QTD */}
      <View style={[styles.cell, styles.numW]}>
        <Text style={s}>{formatNumber(row.QTD_SALES_LY)}</Text>
      </View>
      <View style={[styles.cell, styles.numW]}>
        <Text style={sCy}>{formatNumber(row.QTD_SALES_CY)}</Text>
      </View>
      <View style={[styles.cell, styles.compW]}>
        <CompCell value={row.QTD_SALES_COMP} bold={bold} />
      </View>
      {!noLines && <View style={styles.colDivider} />}
      {/* YTD */}
      <View style={[styles.cell, styles.numW]}>
        <Text style={s}>{formatNumber(row.YTD_SALES_LY)}</Text>
      </View>
      {!noLines && <View style={styles.colDivider} />}
      <View style={[styles.cell, styles.numW]}>
        <Text style={sCy}>{formatNumber(row.YTD_SALES_CY)}</Text>
      </View>
      {!noLines && <View style={styles.colDivider} />}
      <View style={[styles.cell, styles.compW]}>
        <CompCell value={row.YTD_SALES_COMP} bold={bold} />
      </View>
    </>
  );
});

/* ── main component ────────────────────────────────────────── */

export default function AllSalesTab({
  data,
  loading,
  weekNumber,
  dayNumber,
  quarterNumber,
  calendarDayOfMonth = 0,
  calendarMonthNumber = 0,
  registeredStores,
  calendarMode,
  onCalendarModeChange,
  
  onBindExportActions,
}: AllSalesTabProps) {
  const { theme, themeName } = useAppTheme();
  const [search, setSearch] = useState("");
  const [showCalModal, setShowCalModal] = useState(false);
  const { height: screenH } = useWindowDimensions();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const footerScrollRef = React.useRef<ScrollView>(null);
  const leftScrollRef = React.useRef<ScrollView>(null);
  const rightScrollRef = React.useRef<ScrollView>(null);
  const headerScrollRef = React.useRef<ScrollView>(null);
  const scrollPositionRef = React.useRef(0);
  const verticalScrollPositionRef = React.useRef(0);
  const isProgrammaticScrollRef = React.useRef({ horizontal: false, vertical: false });
  const activeVerticalScrollRef = React.useRef<"left" | "right" | null>(null);
  const syncVerticalScroll = (y: number, source: "left" | "right") => {
    verticalScrollPositionRef.current = y;
    if (isProgrammaticScrollRef.current.vertical) {
      return;
    }
    isProgrammaticScrollRef.current.vertical = true;
    if (source === "left") {
      rightScrollRef.current?.scrollTo({ y, animated: false });
    } else {
      leftScrollRef.current?.scrollTo({ y, animated: false });
    }
    requestAnimationFrame(() => {
      isProgrammaticScrollRef.current.vertical = false;
    });
  };
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const tableGradientColors = [theme.colors.surface, theme.colors.surfaceMuted, theme.colors.surfaceMuted] as const;
  const useWhiteTableText = theme.name === "dark" || theme.name === "forest" || theme.name === "wine";

  // Calculate available height: screen - (search bar + header + footer + padding)
  const dataAreaHeight = screenH - 140;

  const { territories, tTotals, grandTotal, totalStores, terms } = useMemo(() => {
    const territories: Record<string, SalesPivotRow[]> = {};
    const tTotals: Record<string, SalesPivotRow> = {};
    let grandTotal: SalesPivotRow | null = null;
    let totalStores = 0;

    (data ?? []).forEach((r) => {
      if (r.IS_GRAND_TOTAL) { grandTotal = r; return; }
      if (r.IS_TERRITORY_TOTAL) { tTotals[r.TERRITORY] = r; return; }
      const t = r.TERRITORY || "Unknown";
      if (!territories[t]) territories[t] = [];
      totalStores++;
      territories[t].push(r);
    });

    Object.keys(territories).forEach((t) => {
      territories[t].sort((a, b) => (a.STORE_NAME ?? "").localeCompare(b.STORE_NAME ?? ""));
    });

    const terms = search.toLowerCase().split("++").map((s) => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      Object.keys(territories).forEach((t) => {
        const fullName = (tTotals[t]?.TERRITORY ?? t).toLowerCase();
        const territoryMatched = terms.some((q) => t.toLowerCase().includes(q) || fullName.includes(q));
        if (territoryMatched) return;
        territories[t] = territories[t].filter((r) =>
          terms.some(
            (q) =>
              (r.STORE_NAME ?? "").toLowerCase().includes(q) ||
              (r.STORE_ID ?? "").toString().includes(q)
          )
        );
      });
    }

    return { territories, tTotals, grandTotal, totalStores, terms };
  }, [data, search]);

  const sortedTerritories = useMemo(
    () =>
      Object.entries(territories)
        .filter(([, stores]) => stores.length > 0)
        .sort(([a], [b]) => {
          const regionA = parseInt(tTotals[a]?.REGION_ID ?? '0', 10) || 0;
          const regionB = parseInt(tTotals[b]?.REGION_ID ?? '0', 10) || 0;
          if (regionA !== regionB) return regionA - regionB;
          return (tTotals[a]?.TERRITORY ?? a).localeCompare(tTotals[b]?.TERRITORY ?? b);
        }),
    [territories, tTotals]
  );

  // Flat sorted list for exports — same order as display but ignores search filter
  const sortedRows = useMemo(() => {
    const terrs: Record<string, SalesPivotRow[]> = {};
    const terTotals: Record<string, SalesPivotRow> = {};
    let gTotal: SalesPivotRow | null = null;

    (data ?? []).forEach((r) => {
      if (r.IS_GRAND_TOTAL) { gTotal = r; return; }
      if (r.IS_TERRITORY_TOTAL) { terTotals[r.TERRITORY] = r; return; }
      const t = r.TERRITORY || "Unknown";
      if (!terrs[t]) terrs[t] = [];
      terrs[t].push(r);
    });

    Object.keys(terrs).forEach((t) => {
      terrs[t].sort((a, b) => (a.STORE_NAME ?? "").localeCompare(b.STORE_NAME ?? ""));
    });

    const sortedTerrs = Object.entries(terrs).sort(([a], [b]) => {
      const regionA = parseInt(terTotals[a]?.REGION_ID ?? '0', 10) || 0;
      const regionB = parseInt(terTotals[b]?.REGION_ID ?? '0', 10) || 0;
      if (regionA !== regionB) return regionA - regionB;
      return (terTotals[a]?.TERRITORY ?? a).localeCompare(terTotals[b]?.TERRITORY ?? b);
    });

    const rows: SalesPivotRow[] = [];
    for (const [territory, stores] of sortedTerrs) {
      rows.push(...stores);
      if (terTotals[territory]) rows.push(terTotals[territory]);
    }
    if (gTotal) rows.push(gTotal);
    return rows;
  }, [data]);

  const generateHtml = () => {
    const cyYear = new Date().getFullYear();
    const lyYear = cyYear - 1;
    const wk = String(weekNumber).padStart(2, "0");
    const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
    const isCalendar = calendarMode === 'calendar';
    const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
    const monthStr = String(calendarMonthNumber).padStart(2, '0');

    // Group-separator columns (right border): after Store(0), DayComp(3), WTDComp(6), QTDComp(9), YTDComp(12)
    const RIGHT_BORDER = new Set([0, 3, 6, 9, 12]);
    const thStyle = (i: number, align = "right") =>
      `background:#D9E1F2;color:#374151;font-weight:bold;text-align:${align};padding:5px 6px;border-bottom:2px solid #808080;${
        RIGHT_BORDER.has(i) ? "border-right:2px solid #808080;" : ""
      }vertical-align:middle;font-size:9px;line-height:13px;`;
    const tdStyle = (i: number, align = "right", extra = "") =>
      `text-align:${align};padding:4px 6px;${RIGHT_BORDER.has(i) ? "border-right:1px solid #b0b8c8;" : ""}${extra}`;

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 10mm 8mm; }
  body { font-family: Arial, sans-serif; font-size: 9px; margin: 0; }
  h2 { font-size: 13px; margin: 0 0 6px 0; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  col.store-col { width: 22%; }
  col.num-col   { width: 5.5%; }
  col.comp-col  { width: 5%;   }
  td { border-bottom: 1px solid #e2e8f0; font-size: 9px; overflow: hidden; }
  .grand-total td { background:#E4EAF2 !important; font-weight:bold; border-top:2px solid #808080; border-bottom:2px solid #808080; }
  .territory   td { background:#EBF3FB; font-weight:bold; }
</style>
</head><body>
<h2>Flash Sales Report</h2>
<table>
<colgroup>
  <col class="store-col">
  <col class="num-col"><col class="num-col"><col class="comp-col">
  <col class="num-col"><col class="num-col"><col class="comp-col">
  <col class="num-col"><col class="num-col"><col class="comp-col">
  <col class="num-col"><col class="num-col"><col class="comp-col">
</colgroup>
<thead><tr>
  <th style="${thStyle(0, "left")}">Store / Territory</th>
  <th style="${thStyle(1)}">${lyYear} Wk ${wk}<br>Day ${dayDisplay}<br>Net Sales</th>
  <th style="${thStyle(2)}">${cyYear} Wk ${wk}<br>Day ${dayDisplay}<br>Net Sales</th>
  <th style="${thStyle(3, "center")}">1 Day<br>Sales Comp</th>
  <th style="${thStyle(4)}">${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}<br>${isCalendar ? 'MTD' : 'WTD'} Net Sales</th>
  <th style="${thStyle(5)}">${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}<br>${isCalendar ? 'MTD' : 'WTD'} Net Sales</th>
  <th style="${thStyle(6, "center")}">${isCalendar ? 'MTD' : 'WTD'}<br>Sales Comp</th>
  <th style="${thStyle(7)}">${lyYear} Q${q}<br>QTD Net Sales</th>
  <th style="${thStyle(8)}">${cyYear} Q${q}<br>QTD Net Sales</th>
  <th style="${thStyle(9, "center")}">QTD<br>Sales Comp</th>
  <th style="${thStyle(10)}">${lyYear}<br>YTD Net Sales</th>
  <th style="${thStyle(11)}">${cyYear}<br>YTD Net Sales</th>
  <th style="${thStyle(12, "center")}">YTD<br>Sales Comp</th>
</tr></thead><tbody>`;

    sortedRows.forEach((row) => {
      const cls = row.IS_GRAND_TOTAL ? "grand-total" : row.IS_TERRITORY_TOTAL ? "territory" : "";
      const name = row.IS_GRAND_TOTAL
        ? "Grand Total"
        : row.IS_TERRITORY_TOTAL
        ? `${row.REGION_ID ? row.REGION_ID + ' ' : ''}${row.TERRITORY} Total`
        : `${row.STORE_ID} ${row.STORE_NAME}${row.DATE_OPENED ? ` <span style="color:#94a3b8;font-size:8px">Opened ${row.DATE_OPENED}</span>` : ""}`;

      const posNeg = (v: number) => (v ?? 0) >= 0 ? "color:#15803d" : "color:#dc2626";

      html += `<tr class="${cls}">
        <td style="${tdStyle(0, "left")}">${name}</td>
        <td style="${tdStyle(1)}">${formatNumber(row.DAY_SALES_LY)}</td>
        <td style="${tdStyle(2)}"><i>${formatNumber(row.DAY_SALES_CY)}</i></td>
        <td style="${tdStyle(3, "center", posNeg(row.DAY_SALES_COMP))}">${formatPercent(row.DAY_SALES_COMP)}</td>
        <td style="${tdStyle(4)}">${formatNumber(row.WTD_SALES_LY)}</td>
        <td style="${tdStyle(5)}"><i>${formatNumber(row.WTD_SALES_CY)}</i></td>
        <td style="${tdStyle(6, "center", posNeg(row.WTD_SALES_COMP))}">${formatPercent(row.WTD_SALES_COMP)}</td>
        <td style="${tdStyle(7)}">${formatNumber(row.QTD_SALES_LY)}</td>
        <td style="${tdStyle(8)}"><i>${formatNumber(row.QTD_SALES_CY)}</i></td>
        <td style="${tdStyle(9, "center", posNeg(row.QTD_SALES_COMP))}">${formatPercent(row.QTD_SALES_COMP)}</td>
        <td style="${tdStyle(10)}">${formatNumber(row.YTD_SALES_LY)}</td>
        <td style="${tdStyle(11)}"><i>${formatNumber(row.YTD_SALES_CY)}</i></td>
        <td style="${tdStyle(12, "center", posNeg(row.YTD_SALES_COMP))}">${formatPercent(row.YTD_SALES_COMP)}</td>
      </tr>`;
    });

    html += `</tbody></table></body></html>`;
    return html;
  };

  const handleExportExcel = async () => {
    try {
      const cyYear = new Date().getFullYear();
      const lyYear = cyYear - 1;
      const wk = String(weekNumber).padStart(2, "0");
      const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
      const isCalendar = calendarMode === 'calendar';
      const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
      const monthStr = String(calendarMonthNumber).padStart(2, '0');

      // ── Column definitions ────────────────────────────────────────────
      // align: left | center | right
      // numFmt: Excel format string (null = general/text)
      // isComp: true for %-comp columns (green/red colouring)
      // isCY:   true for current-year columns (italic)
      const COLS: { header: string; align: string; numFmt: string | null; isComp: boolean; isCY: boolean }[] = [
        { header: `Store / Territory`,                                                          align: "left",   numFmt: null,     isComp: false, isCY: false },
        { header: `${lyYear} Wk ${wk} Day ${dayDisplay}\nNet Sales`,                           align: "right",  numFmt: "#,##0",  isComp: false, isCY: false },
        { header: `${cyYear} Wk ${wk} Day ${dayDisplay}\nNet Sales`,                           align: "right",  numFmt: "#,##0",  isComp: false, isCY: true  },
        { header: `1 Day\nSales Comp`,                                                          align: "center", numFmt: "0.00%",  isComp: true,  isCY: false },
        { header: `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}\n${isCalendar ? 'MTD' : 'WTD'} Net Sales`, align: "right",  numFmt: "#,##0",  isComp: false, isCY: false },
        { header: `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`}\n${isCalendar ? 'MTD' : 'WTD'} Net Sales`, align: "right",  numFmt: "#,##0",  isComp: false, isCY: true  },
        { header: `${isCalendar ? 'MTD' : 'WTD'}\nSales Comp`,                                align: "center", numFmt: "0.00%",  isComp: true,  isCY: false },
        { header: `${lyYear} Q${q}\nQTD Net Sales`,              align: "right",  numFmt: "#,##0",  isComp: false, isCY: false },
        { header: `${cyYear} Q${q}\nQTD Net Sales`,              align: "right",  numFmt: "#,##0",  isComp: false, isCY: true  },
        { header: `QTD\nSales Comp`,                             align: "center", numFmt: "0.00%",  isComp: true,  isCY: false },
        { header: `${lyYear}\nYTD Net Sales`,                    align: "right",  numFmt: "#,##0",  isComp: false, isCY: false },
        { header: `${cyYear}\nYTD Net Sales`,                    align: "right",  numFmt: "#,##0",  isComp: false, isCY: true  },
        { header: `YTD\nSales Comp`,                             align: "center", numFmt: "0.00%",  isComp: true,  isCY: false },
      ];

      // Right-border columns separate each group: Store | Day section | WTD | QTD | YTD
      const RIGHT_BORDER_COLS = new Set([0, 3, 6, 9, 12]);
      const BORDER_SIDE = { style: "thin", color: { rgb: "808080" } };

      const makeBorder = (top: boolean, bottom: boolean, right: boolean) => {
        const b: Record<string, object> = {};
        if (top)    b.top    = BORDER_SIDE;
        if (bottom) b.bottom = BORDER_SIDE;
        if (right)  b.right  = BORDER_SIDE;
        return b;
      };

      // ── Build AOA rows ────────────────────────────────────────────────
      const aoa: (string | number)[][] = [];

      // Header row (text only – styles applied below)
      aoa.push(COLS.map((col) => col.header));

      // Data rows
      sortedRows.forEach((row) => {
        const name = row.IS_GRAND_TOTAL
          ? "Grand Total"
          : row.IS_TERRITORY_TOTAL
          ? `${row.REGION_ID ? row.REGION_ID + ' ' : ''}${row.TERRITORY} Total`
          : `${row.STORE_ID} ${row.STORE_NAME}${row.DATE_OPENED ? " Opened " + row.DATE_OPENED : ""}`;

        aoa.push([
          name,
          row.DAY_SALES_LY  ?? 0,
          row.DAY_SALES_CY  ?? 0,
          (row.DAY_SALES_COMP  ?? 0) / 100,   // divide: data is e.g. 5.23, Excel 0.00% needs 0.0523
          row.WTD_SALES_LY  ?? 0,
          row.WTD_SALES_CY  ?? 0,
          (row.WTD_SALES_COMP  ?? 0) / 100,
          row.QTD_SALES_LY  ?? 0,
          row.QTD_SALES_CY  ?? 0,
          (row.QTD_SALES_COMP  ?? 0) / 100,
          row.YTD_SALES_LY  ?? 0,
          row.YTD_SALES_CY  ?? 0,
          (row.YTD_SALES_COMP  ?? 0) / 100,
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);

      // ── Apply cell styles ─────────────────────────────────────────────
      const totalRows = aoa.length;
      for (let r = 0; r < totalRows; r++) {
        const isHeader     = r === 0;
        const isLastRow    = r === totalRows - 1;
        const dataRow      = sortedRows[r - 1];
        const isGrandTotal = !isHeader && !!dataRow?.IS_GRAND_TOTAL;
        const isTerr       = !isHeader && !!dataRow?.IS_TERRITORY_TOTAL;
        const isBoldRow    = isHeader || isGrandTotal || isTerr;

        for (let c = 0; c < COLS.length; c++) {
          const addr = XLSX.utils.encode_cell({ r, c });
          if (!ws[addr]) ws[addr] = { v: "", t: "s" };

          const col          = COLS[c];
          const hasRightBdr  = RIGHT_BORDER_COLS.has(c);

          // Borders: header gets bottom line; grand-total gets top line; territory gets bottom line; section separators get right line
          const border = makeBorder(
            isGrandTotal,                      // top
            isHeader || isGrandTotal || isTerr, // bottom  (header always, grand-total and territory also)
            hasRightBdr
          );

          // Fill colour
          let fill: object | undefined;
          if (isHeader)      fill = { fgColor: { rgb: "D9E1F2" }, patternType: "solid" };
          else if (isGrandTotal) fill = { fgColor: { rgb: "E4EAF2" }, patternType: "solid" };
          else if (isTerr)   fill = { fgColor: { rgb: "EBF3FB" }, patternType: "solid" };

          // Font colour for comp columns (green positive / red negative)
          let fontColor: string | undefined;
          if (!isHeader && col.isComp) {
            const v = aoa[r][c] as number;
            fontColor = v >= 0 ? "15803D" : "DC2626";
          }

          const cellStyle: Record<string, unknown> = {
            font: {
              bold:   isBoldRow,
              italic: !isHeader && col.isCY,
              ...(fontColor ? { color: { rgb: fontColor } } : {}),
            },
            alignment: {
              horizontal: col.align,
              vertical:   "center",
              wrapText:   true,
            },
            border,
            ...(fill ? { fill } : {}),
          };

          // Number format for non-header numeric cells
          if (!isHeader && col.numFmt) {
            cellStyle.numFmt = col.numFmt;
            ws[addr].t = "n";
          }

          ws[addr].s = cellStyle;
        }
      }

      // ── Sheet-level settings ──────────────────────────────────────────
      // Freeze the header row
      ws["!sheetViews"] = [{
        workbookViewId: 0,
        pane: { ySplit: 1, topLeftCell: "B2", activePane: "bottomLeft", state: "frozen" },
      }];

      // Column widths (matching C# web version)
      ws["!cols"] = [
        { wch: 35 }, // Store / Territory
        { wch: 13 }, // LY Day
        { wch: 13 }, // CY Day
        { wch: 12 }, // Day Comp
        { wch: 13 }, // LY WTD
        { wch: 13 }, // CY WTD
        { wch: 12 }, // WTD Comp
        { wch: 13 }, // LY QTD
        { wch: 13 }, // CY QTD
        { wch: 12 }, // QTD Comp
        { wch: 13 }, // LY YTD
        { wch: 13 }, // CY YTD
        { wch: 12 }, // YTD Comp
      ];

      // Taller header row so wrapped text is fully visible
      ws["!rows"] = [{ hpt: 40 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Flash Sales");
      const wbout = XLSX.write(wb, { type: "base64", bookType: "xlsx" });

      if (Platform.OS === "android") {
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            "FlashSales",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          );
          await FileSystem.writeAsStringAsync(fileUri, wbout, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert("Success", "Excel file saved successfully!");
        }
      } else {
        const fileUri = FileSystem.cacheDirectory + "FlashSales.xlsx";
        await FileSystem.writeAsStringAsync(fileUri, wbout, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
      }
    } catch (error: any) {
      Alert.alert("Error", `Excel export failed: ${error.message}`);
      console.error("Excel export error:", error);
    }
  };

  const handleExportPDF = async () => {
    try {
      const htmlContent = generateHtml();
      const { uri: tempUri } = await Print.printToFileAsync({ html: htmlContent });

      if (Platform.OS === "android") {
        // Android: Use SAF to let user pick save location
        const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const base64 = await FileSystem.readAsStringAsync(tempUri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
            permissions.directoryUri,
            "FlashSales",
            "application/pdf"
          );
          await FileSystem.writeAsStringAsync(fileUri, base64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          Alert.alert("Success", "PDF file saved successfully!");
        }
      } else {
        // iOS: Share the PDF file
        await Sharing.shareAsync(tempUri, {
          mimeType: "application/pdf",
        });
      }
    } catch (error: any) {
      Alert.alert("Error", `PDF export failed: ${error.message}`);
      console.error("PDF export error:", error);
    }
  };

  const handleExportCSV = async () => {
    try {
      const cyYear = new Date().getFullYear();
      const lyYear = cyYear - 1;
      const wk = String(weekNumber).padStart(2, "0");
      const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
      const isCalendar = calendarMode === 'calendar';
      const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
      const monthStr = String(calendarMonthNumber).padStart(2, '0');

      // Column definitions — matches Excel export exactly
      const headers = [
        "Store / Territory",
        `${lyYear} Wk ${wk} Day ${dayDisplay} Net`,
        `${cyYear} Wk ${wk} Day ${dayDisplay} Net`,
        `1 Day Sales Comp`,
        `${lyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`} ${isCalendar ? 'MTD' : 'WTD'} Net`,
        `${cyYear} ${isCalendar ? `Mo ${monthStr}` : `Wk ${wk}`} ${isCalendar ? 'MTD' : 'WTD'} Net`,
        `${isCalendar ? 'MTD' : 'WTD'} Sales Comp`,
        `${lyYear} Q${q} QTD Net`,
        `${cyYear} Q${q} QTD Net`,
        `QTD Sales Comp`,
        `${lyYear} YTD Net`,
        `${cyYear} YTD Net`,
        `YTD Sales Comp`,
      ];

      // Escape only values that contain commas, quotes or newlines; leave numbers bare
      const escCsv = (val: string | number): string => {
        const s = String(val ?? "");
        return /[,"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      // Numbers formatted with commas (matching C# toLocaleString); comp as percentage string
      const numVal  = (n: number | null | undefined) =>
        (n == null || isNaN(n as number)) ? "0" : Math.round(n).toLocaleString("en-US");
      const compVal = (n: number | null | undefined) =>
        (n == null || isNaN(n as number)) ? "0.00%" : `${(n as number).toFixed(2)}%`;

      const rows = sortedRows.map((row) => [
        row.IS_GRAND_TOTAL
          ? "Grand Total"
          : row.IS_TERRITORY_TOTAL
          ? `${row.REGION_ID ? row.REGION_ID + ' ' : ''}${row.TERRITORY} Total`
          : `${row.STORE_ID} ${row.STORE_NAME}${row.DATE_OPENED ? " Opened " + row.DATE_OPENED : ""}`,
        numVal(row.DAY_SALES_LY),
        numVal(row.DAY_SALES_CY),
        compVal(row.DAY_SALES_COMP),
        numVal(row.WTD_SALES_LY),
        numVal(row.WTD_SALES_CY),
        compVal(row.WTD_SALES_COMP),
        numVal(row.QTD_SALES_LY),
        numVal(row.QTD_SALES_CY),
        compVal(row.QTD_SALES_COMP),
        numVal(row.YTD_SALES_LY),
        numVal(row.YTD_SALES_CY),
        compVal(row.YTD_SALES_COMP),
      ]);

      // UTF-8 BOM so Excel opens with correct encoding & number detection
      const csvContent =
        "\uFEFF" +
        [headers, ...rows]
          .map((r) => r.map(escCsv).join(","))
          .join("\r\n");

      if (Platform.OS === "android") {
        const permissions =
          await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (permissions.granted) {
          const fileUri =
            await FileSystem.StorageAccessFramework.createFileAsync(
              permissions.directoryUri,
              "FlashSales",
              "text/csv"
            );
          await FileSystem.writeAsStringAsync(fileUri, csvContent, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          Alert.alert("Success", "CSV file saved successfully!");
        }
      } else {
        const fileUri = FileSystem.cacheDirectory + "FlashSales.csv";
        await FileSystem.writeAsStringAsync(fileUri, csvContent, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        await Sharing.shareAsync(fileUri, { mimeType: "text/csv" });
      }
    } catch (error: any) {
      Alert.alert("Error", `CSV export failed: ${error.message}`);
      console.error("CSV export error:", error);
    }
  };

  const handlePrint = async () => {
    try {
      const htmlContent = generateHtml();
      await Print.printAsync({ html: htmlContent });
    } catch (error: any) {
      Alert.alert("Error", `Print failed: ${error.message}`);
      console.error("Print error:", error);
    }
  };

  useEffect(() => {
    onBindExportActions?.({
      exportExcel: handleExportExcel,
      exportCSV: handleExportCSV,
      exportPDF: handleExportPDF,
      printPDF: handlePrint,
    });
  }, [onBindExportActions, handleExportExcel, handleExportCSV, handleExportPDF, handlePrint]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>Loading sales data...</Text>
      </View>
    );
  }

  if (!data || data.length === 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.loadingText, { color: theme.colors.textMuted }]}>No sales data available</Text>
      </View>
    );
  }

  const cyYear = new Date().getFullYear();
  const lyYear = cyYear - 1;
  const wk = String(weekNumber).padStart(2, "0");
  const q = quarterNumber || Math.ceil((new Date().getMonth() + 1) / 3);
  const isCalendar = calendarMode === 'calendar';
  const dayDisplay = isCalendar && calendarDayOfMonth ? calendarDayOfMonth : dayNumber;
  const monthStr = String(calendarMonthNumber).padStart(2, '0');
  return (
    <View style={[styles.root, { backgroundColor: theme.colors.surface }] }>
      {/* ── search bar ───────────────────────────────────── */}
      <View style={[styles.searchRow,  isLandscape && styles.searchRowLandscape]}>

        <View style={[styles.searchWrap, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.divider }] }>
          <EvilIcons name="search" size={20} color={theme.colors.icon} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.textPrimary }]}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={theme.colors.textMuted}
          />
          <TouchableOpacity onPress={() => setSearch('')}>
            {themeName === 'default' ? (
              <Image
                source={require('../../assets/images/broom.png')}
                style={{ width: 25, height: 25 }}
              />
            ) : (
              <MaterialCommunityIcons name="broom" size={18} color={theme.colors.icon} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    
    

      {/* ── Fiscal / Calendar mode modal ─────────────────── */}
      <Modal
        visible={showCalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCalModal(false)}
      >
        <Pressable
          style={[styles.modalOverlay, { backgroundColor: theme.colors.overlay }]}
          onPress={() => setShowCalModal(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.colors.textPrimary }]}>Select Calendar Mode</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
                  calendarMode === 'fiscal' && styles.modalBtnActive,
                  calendarMode === 'fiscal' && { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => {
                  setShowCalModal(false);
                  onCalendarModeChange('fiscal');
                }}
              >
                <MaterialCommunityIcons
                  name="calendar-check"
                  size={22}
                  color={calendarMode === 'fiscal' ? theme.colors.textInverse : theme.colors.primary}
                />
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: theme.colors.primary },
                    calendarMode === 'fiscal' && styles.modalBtnTextActive,
                    calendarMode === 'fiscal' && { color: theme.colors.textInverse },
                  ]}
                >
                  Fiscal
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  { borderColor: theme.colors.primary, backgroundColor: theme.colors.surface },
                  calendarMode === 'calendar' && styles.modalBtnActive,
                  calendarMode === 'calendar' && { backgroundColor: theme.colors.primary },
                ]}
                onPress={() => {
                  setShowCalModal(false);
                  onCalendarModeChange('calendar');
                }}
              >
                <MaterialCommunityIcons
                  name="calendar-month"
                  size={22}
                  color={calendarMode === 'calendar' ? theme.colors.textInverse : theme.colors.primary}
                />
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: theme.colors.primary },
                    calendarMode === 'calendar' && styles.modalBtnTextActive,
                    calendarMode === 'calendar' && { color: theme.colors.textInverse },
                  ]}
                >
                  Calendar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── table with frozen first column ──────────────── */}
      {/* FIXED HEADER ROW */}
      <View style={[styles.tableSection, { backgroundColor: theme.colors.surface }]}>
      <View style={[styles.headerContainer, { backgroundColor: theme.colors.surface }]}>
        {/* Fixed left header cell */}
        <View style={[styles.fixedHeaderLeft, styles.storeDivider, { backgroundColor: theme.colors.surface, borderRightColor: theme.colors.divider }]}>
          <LinearGradient
            colors={tableGradientColors}
            style={[styles.hRow, styles.fixedHRow]}
          >
            <View style={[styles.hCellStore, isLandscape ? styles.storeWL : styles.storeW]}>
              <Text style={[styles.hMain, useWhiteTableText && { color: theme.colors.textInverse }]}>STORE/TERRITORY</Text>
            </View>
          </LinearGradient>
        </View>

        {/* Scrollable data column headers */}
        <ScrollView 
          ref={headerScrollRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEnabled={false}
        >
          <LinearGradient
            colors={tableGradientColors}
            style={styles.hRow}
          >
            {/* Day LY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} Wk {wk},</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}> Day {dayDisplay} Net $</Text>
            </View>
            {/* Day CY */}
            <View style={[styles.hCell, styles.numW, ]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{cyYear} Wk {wk},</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}> Day {dayDisplay} Net $</Text>
            </View>
            {/* Day Comp */}
            <View style={[styles.hCellCenter, styles.compW]}>
              <Text style={[styles.hTextCenter, useWhiteTableText && { color: theme.colors.textInverse }]}>1 Day Comp</Text>
              <Text style={[styles.hTextCenter, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} to {cyYear}</Text>
            </View>
            <View style={styles.colDivider} />
            {/* WTD/MTD LY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} {isCalendar ? `Mo ${monthStr},` : `Wk ${wk},`}</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}> {isCalendar ? 'MTD' : 'WTD'} Net $</Text>
            </View>
            {/* WTD/MTD CY */}
            <View style={[styles.hCell, styles.numW,]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{cyYear} {isCalendar ? `Mo ${monthStr},` : `Wk ${wk}`}</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}> {isCalendar ? 'MTD' : 'WTD'} Net $</Text>
            </View>
            {/* WTD/MTD Comp */}
            <View style={[styles.hCellCenter, styles.compW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{isCalendar ? 'MTD' : 'WTD'} Comp</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} to {cyYear}</Text>
            </View>
            <View style={styles.colDivider} />
            {/* QTD LY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} Q{q},</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>QTD Net $</Text>
            </View>
            {/* QTD CY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{cyYear} Q{q},</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>QTD Net $</Text>
            </View>
            {/* QTD Comp */}
            <View style={[styles.hCellCenter, styles.compW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>QTD Comp</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} to {cyYear}</Text>
            </View>
            <View style={styles.colDivider} />
            {/* YTD LY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} </Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>YTD Net $</Text>
            </View>
            
            {/* YTD CY */}
            <View style={[styles.hCell, styles.numW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{cyYear}</Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>YTD Net $</Text>
            </View>
           
            {/* YTD Comp */}
            <View style={[styles.hCellCenter, styles.compW]}>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>YTD Comp </Text>
              <Text style={[styles.hText, useWhiteTableText && { color: theme.colors.textInverse }]}>{lyYear} to {cyYear}</Text>
            </View>
          </LinearGradient>
        </ScrollView>
      </View>

      {/* DATA AREA */}
      <View style={styles.tableContainer}>
        {/* Fixed left column data */}
        <View style={[styles.fixedColumn, { backgroundColor: theme.colors.surface }]}>
          <ScrollView 
            ref={leftScrollRef}
            nestedScrollEnabled 
            style={{ maxHeight: dataAreaHeight }}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            alwaysBounceVertical={false}
            decelerationRate="fast"
            onScrollBeginDrag={() => {
              activeVerticalScrollRef.current = "left";
            }}
            onMomentumScrollBegin={() => {
              activeVerticalScrollRef.current = "left";
            }}
            onScrollEndDrag={(e) => {
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "left");
              activeVerticalScrollRef.current = null;
            }}
            onMomentumScrollEnd={(e) => {
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "left");
              activeVerticalScrollRef.current = null;
            }}
            onScroll={(e) => {
              if (activeVerticalScrollRef.current && activeVerticalScrollRef.current !== "left") {
                return;
              }
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "left");
            }}
            scrollEventThrottle={16}
          >
            {/* Data rows only */}
            {sortedTerritories.map(([territory, stores]) => {
              const fullName = (tTotals[territory]?.TERRITORY ?? territory).toLowerCase();
              const showTerritoryTotal = terms.length === 0 || terms.some((q) => territory.toLowerCase().includes(q) || fullName.includes(q));
              return (
              <View key={territory}>
                {stores.map((row, idx) => (
                  <View key={`${row.STORE_ID}-${idx}`} style={[styles.dRow, { backgroundColor: theme.colors.surface }, isLandscape && styles.dRowLandscape]}>
                    <View
                      style={[styles.cell, isLandscape ? styles.storeWL : styles.storeW, styles.storeCell, styles.storeDivider, { borderRightColor: theme.colors.divider }]}
                    >
                      <Text style={[styles.storeLine, { color: useWhiteTableText ? theme.colors.textInverse : theme.colors.textPrimary }] }>
                        <Text style={[styles.storeId, useWhiteTableText && { color: theme.colors.textInverse }]}>{row.STORE_ID}</Text>{" "}
                        {row.STORE_NAME}
                      </Text>
                      {/* {row.DATE_OPENED ? ( 
                        <Text style={styles.opened}>
                          Opened {row.DATE_OPENED}
                        </Text>
                      ) : null}*/}
                    </View>
                  </View>
                ))}

                {tTotals[territory] && showTerritoryTotal && (
                  <View style={[styles.tRow, { backgroundColor: theme.colors.surfaceMuted }, isLandscape && styles.tRowLandscape]}>
                    <View style={[styles.cell, isLandscape ? styles.storeWL : styles.storeW, styles.storeDivider, { borderRightColor: theme.colors.divider }]}>
                      <Text style={[styles.tName, { color: useWhiteTableText ? theme.colors.textInverse : theme.colors.textPrimary }] }>{territory} Total</Text>
                    </View>
                  </View>
                )}
              </View>
            );
            })}
          </ScrollView>
        </View>

        {/* Scrollable data columns */}
        <ScrollView 
          ref={scrollViewRef}
          horizontal 
          showsHorizontalScrollIndicator={false}
          bounces={false}
          onScroll={(e) => {
            const x = e.nativeEvent.contentOffset.x;
            if (isProgrammaticScrollRef.current.horizontal) {
              return;
            }
            scrollPositionRef.current = x;
            isProgrammaticScrollRef.current.horizontal = true;
            headerScrollRef.current?.scrollTo({ x, animated: false });
            footerScrollRef.current?.scrollTo({ x, animated: false });
            requestAnimationFrame(() => {
              isProgrammaticScrollRef.current.horizontal = false;
            });
          }}
          scrollEventThrottle={16}
        >
          <ScrollView 
            ref={rightScrollRef}
            nestedScrollEnabled 
            style={{ maxHeight: dataAreaHeight }}
            showsVerticalScrollIndicator={false}
            bounces={false}
            overScrollMode="never"
            alwaysBounceVertical={false}
            decelerationRate="fast"
            onScrollBeginDrag={() => {
              activeVerticalScrollRef.current = "right";
            }}
            onMomentumScrollBegin={() => {
              activeVerticalScrollRef.current = "right";
            }}
            onScrollEndDrag={(e) => {
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "right");
              activeVerticalScrollRef.current = null;
            }}
            onMomentumScrollEnd={(e) => {
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "right");
              activeVerticalScrollRef.current = null;
            }}
            onScroll={(e) => {
              if (activeVerticalScrollRef.current && activeVerticalScrollRef.current !== "right") {
                return;
              }
              syncVerticalScroll(e.nativeEvent.contentOffset.y, "right");
            }}
            scrollEventThrottle={16}
          >
            {/* Data rows only */}
            {sortedTerritories.map(([territory, stores]) => {
              const fullName = (tTotals[territory]?.TERRITORY ?? territory).toLowerCase();
              const showTerritoryTotal = terms.length === 0 || terms.some((q) => territory.toLowerCase().includes(q) || fullName.includes(q));
              return (
              <View key={territory}>
                {stores.map((row, idx) => (
                  <View key={`data-${row.STORE_ID}-${idx}`} style={[styles.dRow, { backgroundColor: theme.colors.surface }, isLandscape && styles.dRowLandscape]}>
                    <DataCells row={row} />
                  </View>
                ))}

                {tTotals[territory] && showTerritoryTotal && (
                  <View style={[styles.tRowterritory, { backgroundColor: theme.colors.surfaceMuted }, isLandscape && styles.tRowterritoryLandscape]}>
                    <DataCells row={tTotals[territory]} bold noLines />
                  </View>
                )}
              </View>
            );
            })}
          </ScrollView>
        </ScrollView>
      </View>

      {/* ── FIXED FOOTER (Grand Total) ──────────────────── */}
      {grandTotal && (
        <View style={[styles.footerContainer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.divider }]}>
          {/* Fixed left footer cell */}
          <View style={[styles.fixedFooterLeft, { backgroundColor: theme.colors.surface }]}>
            <LinearGradient
              colors={tableGradientColors}
              style={[styles.gRow, isLandscape && styles.gRowLandscape]}
            >
              <View style={[styles.cell, isLandscape ? styles.storeWL : styles.storeW, isLandscape && styles.grandTotalLandscape]}>
                <Text style={[styles.gTitle, useWhiteTableText && { color: theme.colors.textInverse }]}>Grand Total</Text>
                <Text style={[styles.gSub, isLandscape && styles.gSubLandscape, useWhiteTableText && { color: theme.colors.textInverse }]}>
                  {/* Based on sales reported by {Math.min(totalStores, registeredStores > 0 ? registeredStores - 1 : totalStores)} Sources (out of{" "}
                  {registeredStores > 0 ? registeredStores - 1 : totalStores}) */}
                  (0 Locations yet to report day's sales)
                </Text>
              </View>
            </LinearGradient>
          </View>

          {/* Scrollable footer data */}
          <ScrollView 
            ref={footerScrollRef}
            horizontal 
            showsHorizontalScrollIndicator={false}
            bounces={false}
            onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              if (isProgrammaticScrollRef.current.horizontal) {
                return;
              }
              scrollPositionRef.current = x;
              isProgrammaticScrollRef.current.horizontal = true;
              scrollViewRef.current?.scrollTo({ x, animated: false });
              requestAnimationFrame(() => {
                isProgrammaticScrollRef.current.horizontal = false;
              });
            }}
            scrollEventThrottle={16}
          >
            <LinearGradient
              colors={tableGradientColors}
              style={[styles.gRow, isLandscape && styles.gRowLandscape]}
            >
              <DataCells row={grandTotal as SalesPivotRow} bold noLines />
            </LinearGradient>
          </ScrollView>
        </View>
      )}
      </View>
    </View>
  );
}

/* ── styles ────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  searchRowLandscape: {
            position: 'absolute',
            left: 300,
            right: 0,
            top: -31,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            marginRight: 0,
            marginLeft: 0,
            paddingHorizontal: 0,
            width: '52%',
          },
  root: { flex: 1, backgroundColor: "#ffffff" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    backgroundColor: "#ffffff",
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Montserrat_500Medium",
    color: "#64748b",
  },

  /* search row */
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 15,
    paddingVertical: -5,
    paddingBottom: 10,
    marginTop: -10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#a8d5ff",
    paddingHorizontal: 0,
  },
  searchIcon: { fontSize: 14, marginRight: 6, opacity: 0.5 },
  searchInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Montserrat_400Regular",
    color: "#000000",
    paddingVertical: 7,
  },
  searchActionRow: {
    flexDirection: "row",
    marginLeft: 8,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
    backgroundColor: "#ffffff",
  },
  /* table layout */
  headerContainer: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  fixedHeaderLeft: {
    marginLeft: -2,
    backgroundColor: "#ffffff",
  },
  tableContainer: {
    flexDirection: "row",
    flex: 1,
  },
  fixedColumn: {
    backgroundColor: "#ffffff",
  },
  fixedHRow: {
    height: 42,
  },

  /* column widths */
  storeW: { width: 160, marginLeft: 8, paddingRight: 0 },
  storeWL: { width: 250, marginLeft: 8, paddingRight: 0 },
  numW: { width: 115, paddingRight: 10 },
  compW: { width: 100 },

  /* single vertical divider between store column and data */
  tableSection: {
    flex: 1,
    position: "relative",
  },
  storeColDivider: {
    display: "none",
  },
  storeDivider: {
    borderRightWidth: 2.5,
    borderRightColor: "#c9cfd8",
  },
  colDivider: {
    width: 1.5,
    backgroundColor: "#c9cfd8",
    alignSelf: "stretch",
  },

  /* header row */
  hRow: {
    flexDirection: "row",
    height: 42,
    borderTopWidth: 1,
    borderTopColor: "#e6e6e6",
    alignItems: "center",
  },
  hCell: {
    justifyContent: "flex-end",
    alignItems: "flex-end",
    paddingHorizontal: 4,
  },
  hCellStore: {
    justifyContent: "center",
    alignItems: "flex-start",
    paddingHorizontal: 0,
    marginRight:-0.5,
    marginTop: 8,
  },
  hCellCenter: {
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  hMain: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#434547",
    textAlign: "left",
    lineHeight: 13,
    marginLeft: 2,
  },
  hText: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#292a2c",
    textAlign: "right",
    lineHeight: 13,
  },
  hTextCenter: {
    fontSize: 10,
    fontFamily: "Montserrat_500Medium",
    color: "#45474b",
    textAlign: "center",
    lineHeight: 13,
  },

  /* data cells */
  cell: { justifyContent: "center", paddingHorizontal: 0 },
  val: { fontSize: 12, fontFamily: "Montserrat_400Medium", color: "#334155" },
  right: { textAlign: "right" },
  center2: { textAlign: "center" },
  bold: { fontFamily: "Montserrat_700Medium", fontWeight: "bold" },
  
  cyColValue: {
    color: "#397891",
  },


  /* store data row */
  dRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    height: 45,
  
  },
  dRowLandscape: {
    height: 25,
  },
  storeCell: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  storeLine: {
    fontSize: 13,
    fontFamily: "Montserrat_500Medium",
    color: "#1e293b",
    flexShrink: 1,
    flexWrap: "wrap",
  },
  storeId:{
 fontWeight: "bold",
  },
  opened: {
    fontSize: 9,
    paddingLeft: 4,
    fontFamily: "Montserrat_400Regular",
    color: "#94a3b8",
    textAlign: "right",
  },

  /* territory total row */
  tRow: {
    flexDirection: "row",
    backgroundColor: "#F6F8FD",
    height: 34,
    fontWeight: "bold",
  },
  tRowLandscape: {
    height: 28,
  },
  tRowterritory: {
    flexDirection: "row",
    backgroundColor: "#F6F8FD",
    height: 34,
    fontWeight: "bold",
    zIndex: 5,
  },
  tRowterritoryLandscape: {
    height: 28,
  },
  tRowRed: {
    flexDirection: "row",
    backgroundColor: "#F6F8FD",
    height: 34,
  },
  tName: { fontSize: 13, fontFamily: "Montserrat_500Medium", color: "#1e293b",fontWeight: "bold" },

  /* grand total row */
  gRow: {
    flexDirection: "row",
    height: 52,
  },
  gRowLandscape: {
    height: 42,
  },
  gTitle: {
    fontSize: 12,
    fontFamily: "Montserrat_500Medium",
    color: "#1e293b",
  },
  gSub: {
    fontSize: 8,
    fontFamily: "Montserrat_400Regular",
    color: "#6b7280",
    marginTop: 1,
    lineHeight: 11,
  },
  grandTotalLandscape: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft:-4,
    marginRight:12,
    gap: 4,
  },
  gSubLandscape: {
    marginTop: 0,
    marginLeft: 0,
  },

  /* fixed footer */
  footerContainer: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  fixedFooterLeft: {
    backgroundColor: "#ffffff",
  },

  /* calendar mode button */
  calModeRow: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingVertical: 2,
    marginBottom: 2,
  },
  calModeBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    height: 20,
  },
  calModeBtnText: {
    color: "#374151",
    fontSize: 12,
    fontFamily: "Montserrat_500Medium",
    marginRight: 2,
  },

  /* modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 28,
    width: 280,
    alignItems: "center",
    elevation: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontFamily: "Montserrat_600SemiBold",
    color: "#1e293b",
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: "row",
    gap: 14,
  },
  modalBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#1C55CC",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 110,
    backgroundColor: "#fff",
  },
  modalBtnActive: {
    backgroundColor: "#1C55CC",
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: "Montserrat_500Medium",
    color: "#1C55CC",
    marginLeft: 6,
  },
  modalBtnTextActive: {
    color: "#fff",
  },
});