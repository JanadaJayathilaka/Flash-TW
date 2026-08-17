import { useState, useMemo, useEffect, useCallback } from "react";
import { formatNumber, getBestMetric } from "../utils/dateUtils";
import { highlightText, matchesSearchTerm } from "../utils/highlightUtils";
import { generateTilesPDF } from "../utils/pdfExportUtils";
import TopSalesImg from "../assets/TopsalesIcons/TopSales.png";
import TopSalesSelImg from "../assets/TopsalesIcons/TopSales_sel.png";
import TopSalesLiftImg from "../assets/TopsalesIcons/TopSalesLift.png";
import TopSalesLiftSelImg from "../assets/TopsalesIcons/TopSalesLift_sel.png";
import TerSalesImg from "../assets/TopsalesIcons/TerSales.png";
import TerSalesSelImg from "../assets/TopsalesIcons/TerSales_sel.png";
import TerSalesLiftImg from "../assets/TopsalesIcons/TerSalesLift.png";
import TerSalesLiftSelImg from "../assets/TopsalesIcons/TerSalesLift_sel.png";
import { MdEmojiEvents } from "react-icons/md";

const MEDALS = {
  1: {
    cls: "medal-platinum",
    icon: <MdEmojiEvents />,
    label: "PL",
    title: "Platinum",
  },
  2: { cls: "medal-gold", icon: <MdEmojiEvents />, label: "GL", title: "Gold" },
  3: {
    cls: "medal-silver",
    icon: <MdEmojiEvents />,
    label: "SL",
    title: "Silver",
  },
  4: {
    cls: "medal-bronze",
    icon: <MdEmojiEvents />,
    label: "BZ",
    title: "Bronze",
  },
};

const RANK_CLASSES = [
  "rank-1_topSales",
  "rank-2_topSales",
  "rank-3_topSales",
  "rank-4_topSales",
  "rank-5_topSales",
  "rank-6_topSales",
  "rank-7_topSales",
  "rank-8_topSales",
  "rank-9_topSales",
  "rank-10_topSales",
];

function formatSelectedDate(selectedDate) {
  if (!selectedDate) return "2026 February 10, Tuesday";
  const d = new Date(selectedDate);
  if (isNaN(d.getTime())) return String(selectedDate);
  const months = [
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
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  return `${d.getFullYear()} ${months[d.getMonth()]} ${d.getDate()}, ${days[d.getDay()]}`;
}

export default function LeadersTab({
  data,
  loading,
  boxDayCY,
  boxDayLY,
  search,
  calendarMode,
  selectedDate,
  onBindExportActions,
}) {
  const [sortMode, setSortMode] = useState("storesBySales"); // storesBySales | storesByLift | territoryBySales | territoryByLift

  const getHeaderTitles = useCallback(() => {
    const isCal =
      String(calendarMode || "")
        .toLowerCase()
        .includes("calendar") ||
      String(calendarMode || "").toUpperCase() === "C";
    const calText = isCal ? "Calendar" : "Fiscal";
    const dateStr = formatSelectedDate(selectedDate);

    switch (sortMode) {
      case "storesBySales":
        return {
          mainTitle: "TOP 10 STORES",
          subtitleStr: `$ Sales Lift (${calText}) on ${dateStr}`,
        };
      case "storesByLift":
        return {
          mainTitle: "TOP 10 STORES",
          subtitleStr: `% Sales Lift (${calText}) on ${dateStr}`,
        };
      case "territoryBySales":
        return {
          mainTitle: "TERRITORIES",
          subtitleStr: `Total $ Sales Lift (${calText}) on ${dateStr}`,
        };
      case "territoryByLift":
        return {
          mainTitle: "TERRITORIES",
          subtitleStr: `Total % Sales Lift (${calText}) on ${dateStr}`,
        };
      default:
        return {
          mainTitle: "TOP 10 STORES",
          subtitleStr: `$ Sales Lift (${calText}) on ${dateStr}`,
        };
    }
  }, [sortMode, calendarMode, selectedDate]);

  useEffect(() => {
    if (onBindExportActions) {
      const { mainTitle, subtitleStr } = getHeaderTitles();
      onBindExportActions({
        exportPDF: () =>
          generateTilesPDF(
            "topSales_Grid",
            mainTitle,
            subtitleStr,
            search,
            false,
          ),
        printPDF: () =>
          generateTilesPDF(
            "topSales_Grid",
            mainTitle,
            subtitleStr,
            search,
            true,
          ),
      });
    }
  }, [onBindExportActions, search, getHeaderTitles]);

  const rankedData = useMemo(() => {
    if (loading || !data || data.length === 0) return [];

    const storeRows = data.filter(
      (r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL,
    );

    const storeList = storeRows.map((r) => {
      const cy = Number(r.DAY_SALES_CY ?? 0);
      const ly = Number(r.DAY_SALES_LY ?? 0);
      const pct = cy === 0 || ly === 0 ? 0 : ((cy - ly) / ly) * 100;
      return {
        STORE_ID: (r.STORE_ID ?? "").toString().trim(),
        STORE_NAME: r.STORE_NAME || "",
        REGION_ID: (r.REGION_ID ?? "").toString().trim(),
        TERRITORY: r.TERRITORY || "",
        Sales: cy,
        SalesPrevious: ly,
        Growth: pct,
        IS_TERRITORY_TOTAL: false,
      };
    });

    // Territory summary grouped from stores (matching salesapp groupByTerritoryAndSum)
    const map = storeList.reduce((acc, x) => {
      const key = (x.TERRITORY || "").toString().trim() || "UNKNOWN";
      const regionId = (x.REGION_ID || "").toString().trim() || "UNKNOWN";

      if (!acc[key]) {
        acc[key] = {
          STORE_ID: "",
          STORE_NAME: "",
          REGION_ID: regionId,
          TERRITORY: key,
          Sales: 0,
          SalesPrevious: 0,
          Growth: 0,
          IS_TERRITORY_TOTAL: true,
        };
      }
      acc[key].Sales += x.Sales;
      acc[key].SalesPrevious += x.SalesPrevious;
      return acc;
    }, {});

    const territoryList = Object.values(map).map((t) => {
      t.Growth =
        t.SalesPrevious === 0
          ? 0
          : ((t.Sales - t.SalesPrevious) / t.SalesPrevious) * 100;
      return t;
    });

    let sortedData = [];
    switch (sortMode) {
      case "storesBySales": {
        // Top 10 Stores by $ Sales Lift (filtered for positive sales & growth per salesapp)
        const positiveStores = storeList.filter(
          (x) => x.Sales > 0 && x.SalesPrevious > 0 && x.Growth >= 0,
        );
        sortedData = [...positiveStores].sort(
          (a, b) => (b.Sales - b.SalesPrevious) - (a.Sales - a.SalesPrevious),
        );
        break;
      }
      case "storesByLift": {
        // Top 10 Stores by % Sales Lift
        const positiveStores = storeList.filter((x) => x.Growth >= 0);
        sortedData = [...positiveStores].sort(
          (a, b) => (Number(b.Growth) || 0) - (Number(a.Growth) || 0),
        );
        break;
      }
      case "territoryBySales": {
        // Territories by Total $ Sales Lift
        const positiveTerritories = territoryList.filter((x) => x.Growth >= 0);
        sortedData = [...positiveTerritories].sort(
          (a, b) => (b.Sales - b.SalesPrevious) - (a.Sales - a.SalesPrevious),
        );
        break;
      }
      case "territoryByLift": {
        // Territories by Total % Sales Lift
        const positiveTerritories = territoryList.filter((x) => x.Growth >= 0);
        sortedData = [...positiveTerritories].sort(
          (a, b) => (Number(b.Growth) || 0) - (Number(a.Growth) || 0),
        );
        break;
      }
      default:
        break;
    }

    let result = sortedData
      .map((row, index) => ({
        row,
        rank: index + 1,
        rankClass: RANK_CLASSES[index % RANK_CLASSES.length],
      }))
      .slice(0, 10);

    const terms = (
      search.includes("++")
        ? search.toLowerCase().split("++")
        : search.toLowerCase().split(/\s+/)
    )
      .map((s) => s.trim())
      .filter(Boolean);
    if (terms.length > 0) {
      result = result.filter(({ row }) => {
        const fields = [
          row.STORE_ID != null ? String(row.STORE_ID) : "",
          row.STORE_NAME || "",
          row.REGION_ID != null ? String(row.REGION_ID) : "",
          row.TERRITORY || "",
        ];
        return terms.some((term) =>
          fields.some((f) => matchesSearchTerm(f, term)),
        );
      });
    }

    return result;
  }, [data, sortMode, loading, search]);

  if (loading) {
    return <div className="loading-view">Loading Top Sales...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div>
      {/* Category Selection Bar with 4 Thin Curved Border Lines (.borderbar) */}
      <div
        style={{
          marginBottom: "40px",
          marginTop: "20px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          className="img-radio-group"
          style={{ display: "flex", gap: "10px" }}
        >
          <div className="borderbar top-left"></div>
          <div className="borderbar top-right"></div>
          <div className="borderbar bottom-left"></div>
          <div className="borderbar bottom-right"></div>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              id="rad_TopS_01"
              type="radio"
              name="top_sales_group"
              checked={sortMode === "storesBySales"}
              onChange={() => setSortMode("storesBySales")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "storesBySales" ? TopSalesSelImg : TopSalesImg
                }
                alt="Top Stores Sales"
              />
              <span>
                Top 10 Stores by
                <br />$ Sales Lift
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_sales_group"
              checked={sortMode === "storesByLift"}
              onChange={() => setSortMode("storesByLift")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "storesByLift"
                    ? TopSalesLiftSelImg
                    : TopSalesLiftImg
                }
                alt="Top Stores Lift"
              />
              <span>
                Top 10 Stores by
                <br />% Sales Lift
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_sales_group"
              checked={sortMode === "territoryBySales"}
              onChange={() => setSortMode("territoryBySales")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "territoryBySales" ? TerSalesSelImg : TerSalesImg
                }
                alt="Territories Sales"
              />
              <span>
                Territories by
                <br />
                Total $ Sales Lift
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_sales_group"
              checked={sortMode === "territoryByLift"}
              onChange={() => setSortMode("territoryByLift")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "territoryByLift"
                    ? TerSalesLiftSelImg
                    : TerSalesLiftImg
                }
                alt="Territories Lift"
              />
              <span>
                Territories by
                <br />
                Total % Sales Lift
              </span>
            </div>
          </label>
        </div>
      </div>

      {/* Tiles Grid matching Dotnet topworstsales.js */}
      <div id="topSales_Grid" className="tile-grid">
        {rankedData.map(({ row, rank, rankClass }) => {
          const ly = row.SalesPrevious;
          const cy = row.Sales;
          const sTotal = ly + cy || 1;
          const wPrev = (ly / sTotal) * 100;
          const wSales = (cy / sTotal) * 100;
          const dLift = cy - ly;
          const isPercentageMode =
            sortMode === "storesByLift" || sortMode === "territoryByLift";
          const pct = row.Growth;
          const isTerritory = !!row.IS_TERRITORY_TOTAL;
          const medal = MEDALS[rank];

          const deltaText = isPercentageMode
            ? `${pct < 0 ? "Drop" : "Lift"} ${Math.abs(Number(pct || 0)).toFixed(2)}%`
            : `${dLift >= 0 ? "Lift" : "Drop"} $${formatNumber(Math.abs(dLift))}`;
          const deltaColor =
            (isPercentageMode ? pct >= 0 : dLift >= 0) ? "green" : "red";

          return (
            <div
              key={`${row.STORE_ID || row.TERRITORY}-${rank}`}
              className={`tile ${rankClass}`}
            >
              {medal && (
                <div title={medal.title} className={`medal ${medal.cls}`}>
                  <i className="material-icons">{medal.icon}</i>
                  <span>{medal.label}</span>
                </div>
              )}

              <div className="tile-body">
                <div className="tile-title"></div>
                <div className="tile-rank">{rank}</div>

                {isTerritory ? (
                  <div className="tile-store">
                    Territory: {highlightText(row.REGION_ID, search)}{" "}
                    {highlightText(row.TERRITORY, search)}
                  </div>
                ) : (
                  <>
                    <div className="tile-store">
                      Store: {highlightText(row.STORE_ID, search)}{" "}
                      {highlightText(row.STORE_NAME, search)}
                    </div>
                    <div className="tile-territory">
                      Territory:{" "}
                      <b>
                        {highlightText(row.REGION_ID, search)}{" "}
                        {highlightText(row.TERRITORY, search)}
                      </b>
                    </div>
                  </>
                )}

                <div className="mini-chart">
                  <div className="mini-row">
                    <div className="mini-label">{boxDayLY || "Day 1"}</div>
                    <div className="mini-track">
                      <div
                        className="mini-bar bar-prev"
                        style={{
                          width: `${Math.min(Math.max(wPrev, 0), 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mini-row">
                    <div className="mini-label">{boxDayCY || "Day 2"}</div>
                    <div className="mini-track">
                      <div
                        className="mini-bar bar-current"
                        style={{
                          width: `${Math.min(Math.max(wSales, 0), 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="mini-values">
                    <div>
                      {`$${formatNumber(ly)} / $${formatNumber(cy)}`}
                    </div>
                    <div
                      className="delta"
                      style={{ color: deltaColor }}
                    >
                      {deltaText}
                    </div>
                  </div>
                </div>

                <div className="tile-sales">
                  <div className="lbl">Sales</div>
                  <div className="val">{`$${formatNumber(cy)}`}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
