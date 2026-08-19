import { useState, useMemo, useEffect, useCallback } from "react";
import { formatNumber, getBestMetric } from "../utils/dateUtils";
import { highlightText, matchesSearchTerm } from "../utils/highlightUtils";
import { generateTilesPDF } from "../utils/pdfExportUtils";
import BotSalesSelImg from "../assets/LaggardsIcons/BotSales_sel.png";
import BotSalesImg from "../assets/LaggardsIcons/BotSales.png";
import BotSalesLiftSelImg from "../assets/LaggardsIcons/BotSalesLift_sel.png";
import BotSalesLiftImg from "../assets/LaggardsIcons/BotSalesLift.png";
import TerSalesLagSelImg from "../assets/LaggardsIcons/TerSalesLag_sel.png.png";
import TerSalesLagImg from "../assets/LaggardsIcons/TerSalesLag.png";
import TerSalesLagLiftSelImg from "../assets/LaggardsIcons/TerSalesLiftLag_sel.png";
import TerSalesLagLiftImg from "../assets/LaggardsIcons/TerSalesLiftLag.png";
import { MdReportProblem } from "react-icons/md";

const MEDALS = {
  1: {
    cls: "medal-worstsales",
    icon: <MdReportProblem />,
    label: "CRITICAL",
    title: "Critical",
  },
  2: {
    cls: "medal-worstsales",
    icon: <MdReportProblem />,
    label: "SEVERE",
    title: "Severe",
  },
  3: {
    cls: "medal-worstsales",
    icon: <MdReportProblem />,
    label: "POOR",
    title: "Poor",
  },
  4: {
    cls: "medal-worstsales",
    icon: <MdReportProblem />,
    label: "WEAK",
    title: "Weak",
  },
};

const RANK_CLASSES = [
  "rank-1_laggards",
  "rank-2_laggards",
  "rank-3_laggards",
  "rank-4_laggards",
  "rank-5_laggards",
  "rank-6_laggards",
  "rank-7_laggards",
  "rank-8_laggards",
  "rank-9_laggards",
  "rank-10_laggards",
];

function formatSelectedDate(selectedDate) {
  if (!selectedDate) return "2026 February 10, Tuesday";
  const parts = String(selectedDate).split("T")[0].split("-");
  let d;
  if (parts.length === 3) {
    const yyyy = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10) - 1;
    const dd = parseInt(parts[2], 10);
    d = new Date(yyyy, mm, dd);
  } else {
    d = new Date(selectedDate);
  }
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

export default function LaggardsTab({
  data,
  loading,
  boxDayCY,
  boxDayLY,
  search,
  calendarMode,
  selectedDate,
  onBindExportActions,
}) {
  const [sortMode, setSortMode] = useState("lowestSales"); // lowestSales | highestLost | territoryLowestSales | territoryHighestLost

  const getHeaderTitles = useCallback(() => {
    const isCal =
      String(calendarMode || "")
        .toLowerCase()
        .includes("calendar") ||
      String(calendarMode || "").toUpperCase() === "C";
    const calText = isCal ? "Calendar" : "Fiscal";
    const dateStr = formatSelectedDate(selectedDate);

    switch (sortMode) {
      case "lowestSales":
        return {
          mainTitle: "BOTTOM 10 STORES",
          subtitleStr: `$ Sales Drop (${calText}) on ${dateStr}`,
        };
      case "highestLost":
        return {
          mainTitle: "BOTTOM 10 STORES",
          subtitleStr: `% Sales Drop (${calText}) on ${dateStr}`,
        };
      case "territoryLowestSales":
        return {
          mainTitle: "TERRITORIES",
          subtitleStr: `Total $ Sales Drop (${calText}) on ${dateStr}`,
        };
      case "territoryHighestLost":
        return {
          mainTitle: "TERRITORIES",
          subtitleStr: `Total % Sales Drop (${calText}) on ${dateStr}`,
        };
      default:
        return {
          mainTitle: "BOTTOM 10 STORES",
          subtitleStr: `$ Sales Drop (${calText}) on ${dateStr}`,
        };
    }
  }, [sortMode, calendarMode, selectedDate]);

  useEffect(() => {
    if (onBindExportActions) {
      const { mainTitle, subtitleStr } = getHeaderTitles();
      onBindExportActions({
        exportPDF: () =>
          generateTilesPDF(
            "topLaggards_Grid",
            mainTitle,
            subtitleStr,
            search,
            false,
          ),
        printPDF: () =>
          generateTilesPDF(
            "topLaggards_Grid",
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
      case "lowestSales": {
        const negativeStores = storeList.filter((x) => x.Growth < 0);
        sortedData = [...negativeStores].sort(
          (a, b) => (a.Sales - a.SalesPrevious) - (b.Sales - b.SalesPrevious),
        );
        break;
      }
      case "highestLost": {
        const negativeStores = storeList.filter((x) => x.Growth < 0);
        sortedData = [...negativeStores].sort(
          (a, b) => (Number(a.Growth) || 0) - (Number(b.Growth) || 0),
        );
        break;
      }
      case "territoryLowestSales": {
        const negativeTerritories = territoryList.filter((x) => x.Growth < 0);
        sortedData = [...negativeTerritories].sort(
          (a, b) => (a.Sales - a.SalesPrevious) - (b.Sales - b.SalesPrevious),
        );
        break;
      }
      case "territoryHighestLost": {
        const negativeTerritories = territoryList.filter((x) => x.Growth < 0);
        sortedData = [...negativeTerritories].sort(
          (a, b) => (Number(a.Growth) || 0) - (Number(b.Growth) || 0),
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

    const rawFilter = (search || "").toLowerCase().trim();
    const terms = rawFilter
      .split("++")
      .map((s) => s.trim())
      .filter(Boolean);
    if (terms.length > 0) {
      result = result.filter(({ row }) => {
        const fields = [
          row.STORE_ID != null ? String(row.STORE_ID) : "",
          row.STORE_NAME || "",
          `${row.STORE_ID} ${row.STORE_NAME}`,
          row.REGION_ID != null ? String(row.REGION_ID) : "",
          row.TERRITORY || "",
          `${row.REGION_ID} ${row.TERRITORY}`,
          formatNumber(row.Sales),
          formatPercent(row.Growth),
          formatNumber(row.SalesPrevious),
          String(Math.round(row.Sales || 0)),
          String(Math.round(row.SalesPrevious || 0)),
        ];
        return terms.some((term) =>
          fields.some((f) => matchesSearchTerm(f, term)),
        );
      });
    }

    return result;
  }, [data, sortMode, loading, search]);

  if (loading) {
    return <div className="loading-view">Loading Laggards...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div>
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
              name="top_laggards_group"
              checked={sortMode === "lowestSales"}
              onChange={() => setSortMode("lowestSales")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "lowestSales"
                    ? BotSalesSelImg
                    : BotSalesImg
                }
                alt="Lowest Sales"
              />
              <span>
                Bottom 10 Stores by
                <br />$ Sales Drop
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_laggards_group"
              checked={sortMode === "highestLost"}
              onChange={() => setSortMode("highestLost")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "highestLost"
                    ? BotSalesLiftSelImg
                    : BotSalesLiftImg
                }
                alt="Highest Lost %"
              />
              <span>
                Bottom 10 Stores by
                <br />% Sales Drop
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_laggards_group"
              checked={sortMode === "territoryLowestSales"}
              onChange={() => setSortMode("territoryLowestSales")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "territoryLowestSales"
                    ? TerSalesLagSelImg
                    : TerSalesLagImg
                }
                alt="Territories Sales Drop"
              />
              <span>
                Territories by
                <br />
                Total $ Sales Drop
              </span>
            </div>
          </label>

          <label className="img-radio" style={{ cursor: "pointer", margin: 0 }}>
            <input
              type="radio"
              name="top_laggards_group"
              checked={sortMode === "territoryHighestLost"}
              onChange={() => setSortMode("territoryHighestLost")}
              style={{ display: "none" }}
            />
            <div className="radio-card">
              <img
                className="radio-icon"
                src={
                  sortMode === "territoryHighestLost"
                    ? TerSalesLagLiftSelImg
                    : TerSalesLagLiftImg
                }
                alt="Territories Drop %"
              />
              <span>
                Territories by
                <br />
                Total % Sales Drop
              </span>
            </div>
          </label>
        </div>
      </div>

      <div id="topLaggards_Grid" className="tile-grid">
        {rankedData.map(({ row, rank, rankClass }) => {
          const ly = row.SalesPrevious;
          const cy = row.Sales;
          const sTotal = ly + cy || 1;
          const wPrev = (ly / sTotal) * 100;
          const wSales = (cy / sTotal) * 100;
          const dDrop = ly - cy;
          const isPercentageMode =
            sortMode === "highestLost" || sortMode === "territoryHighestLost";
          const pct = row.Growth;
          const isTerritory = !!row.IS_TERRITORY_TOTAL;

          const deltaText = isPercentageMode
            ? `${pct < 0 ? "Drop" : "Lift"} ${Math.abs(Number(pct || 0)).toFixed(2)}%`
            : `${dDrop >= 0 ? "Drop" : "Lift"} $${formatNumber(Math.abs(dDrop))}`;

          return (
            <div
              key={`${row.STORE_ID || row.TERRITORY}-${rank}`}
              className={`tile ${rankClass}`}
            >
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
                      style={{ color: "red" }}
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
