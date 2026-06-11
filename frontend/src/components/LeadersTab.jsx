import { useState, useMemo } from 'react';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';
import TopSalesImg from '../assets/TopsalesIcons/TopSales.png'
import TopSalesSelImg from '../assets/TopsalesIcons/TopSales_sel.png';
import TopSalesLiftImg from '../assets/TopsalesIcons/TopSalesLift.png';
import TopSalesLiftSelImg from '../assets/TopsalesIcons/TopSalesLift_sel.png';
import TerSalesLift$img from '../assets/TopsalesIcons/TerSalesLift.png'
import TerSalesLiftsel$img from '../assets/TopsalesIcons/TerSalesLift_sel.png'
import TerSalesLiftperimg from '../assets/TopsalesIcons/TerSales_sel.png'
const CARD_COLORS = [
  '#1c5e20', // 1st
  '#2f7d32', // 2nd
  '#43a047', // 3rd
  '#26a59a', // 4th
  '#1d89e4', // 5th
  '#1564c0', // 6th
  '#3949ab',
  '#5d35b0',
  '#4a148c',
  '#7a1fa2'
];

const TROPHY_COLORS = ['#D7D7D6', '#EDC400', '#AFB8BB', '#B16A24'];
const TROPHY_LABELS = ['PL', 'GL', 'SL', 'BZ'];

export default function LeadersTab({ data, loading, boxDayCY, boxDayLY, search }) {
  const [sortMode, setSortMode] = useState('storesBySales'); // storesBySales | storesByLift | territoryBySales | territoryByLift

  const m = useMemo(() => getBestMetric(data), [data]);

  // Normalize lift computation (forces 0 if either is 0, matching backend/mobile behavior)
  const getNormalizedLift = useMemo(() => {
    return (row) => {
      const ly = Number(row[m.ly] ?? 0);
      const cy = Number(row[m.cy] ?? 0);
      if (ly === 0 || cy === 0) return 0;
      return Number(row[m.comp] ?? 0);
    };
  }, [m]);

  const rankedData = useMemo(() => {
    if (loading || !data || data.length === 0) return [];

    const storeRows = data.filter((r) => !r.IS_TERRITORY_TOTAL && !r.IS_GRAND_TOTAL);
    const territoryRows = data.filter((r) => r.IS_TERRITORY_TOTAL);

    // Filter by positive comps
    const positiveStores = storeRows.filter((r) => getNormalizedLift(r) >= 0);
    const positiveTerritories = territoryRows.filter((r) => getNormalizedLift(r) >= 0);

    let sortedData = [];
    switch (sortMode) {
      case 'storesBySales':
        sortedData = [...positiveStores].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
        break;
      case 'storesByLift':
        sortedData = [...positiveStores].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
        break;
      case 'territoryBySales':
        sortedData = [...positiveTerritories].sort((a, b) => (b[m.cy] ?? 0) - (a[m.cy] ?? 0));
        break;
      case 'territoryByLift':
        sortedData = [...positiveTerritories].sort((a, b) => getNormalizedLift(b) - getNormalizedLift(a));
        break;
      default:
        break;
    }

    let result = sortedData.map((row, index) => ({
      row,
      rank: index + 1,
      color: CARD_COLORS[index % CARD_COLORS.length],
    })).slice(0, 10);

    // Filter by search terms
    const terms = search.toLowerCase().split('++').map((s) => s.trim()).filter(Boolean);
    if (terms.length > 0) {
      result = result.filter(({ row }) => {
        const searchText = `${row.STORE_ID ?? ''} ${row.STORE_NAME ?? ''} ${row.REGION_ID ?? ''} ${row.TERRITORY ?? ''}`.toLowerCase();
        return terms.some((term) => searchText.includes(term));
      });
    }

    return result;
  }, [data, sortMode, m, loading, search, getNormalizedLift]);

  if (loading) {
    return <div className="loading-view">Loading top performers...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div>
      {/* Subtabs controls */}
      <div className="subtabs-bar">
        <button
          className={`subtab-option ${sortMode === 'storesBySales' ? 'active' : ''}`}
          onClick={() => setSortMode('storesBySales')}
        >
          <img src={sortMode === 'storesBySales' ? TopSalesSelImg : TopSalesImg} className="subtab-icon-wrap" />
          <span>Top 10 Locations by<br />$ Sales Lift</span>
        </button>
        <button
          className={`subtab-option ${sortMode === 'storesByLift' ? 'active' : ''}`}
          onClick={() => setSortMode('storesByLift')}
        >
          <img src={sortMode === 'storesByLift' ? TopSalesLiftSelImg : TopSalesLiftImg} className="subtab-icon-wrap" />
          <span>Top 10 Locations by<br />% Sales Lift</span>
        </button>
        <button
          className={`subtab-option ${sortMode === 'territoryBySales' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryBySales')}
        >
          <img src={sortMode === 'territoryBySales' ? TerSalesLiftsel$img : TerSalesLift$img} className="subtab-icon-wrap" />
          <span>Locations by<br />$ Sales Lift</span>
        </button>
        <button
          className={`subtab-option ${sortMode === 'territoryByLift' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryByLift')}
        >
          <img src={sortMode === 'territoryByLift' ? TerSalesLiftperimg : TerSalesLift$img} className="subtab-icon-wrap" />
          <span>Locations by<br />% Sales Lift</span>
        </button>
      </div>

      {/* Cards Grid */}
      <div className="cards-grid">
        {rankedData.map(({ row, rank, color }) => {
          const ly = Number(row[m.ly] ?? 0);
          const cy = Number(row[m.cy] ?? 0);
          const sTotal = ly + cy || 1;
          const lyPct = (ly / sTotal) * 100;
          const cyPct = (cy / sTotal) * 100;
          const lift = getNormalizedLift(row);

          const isTerritory = sortMode.includes('territory');

          return (
            <div key={`${row.STORE_ID || row.TERRITORY}-${rank}`} className="leader-card" style={{ backgroundColor: color }}>
              {/* Header */}
              <div className="card-top">
                <div className="card-rank">{rank}</div>
                {rank <= 4 && (
                  <div className="trophy-badge" style={{ backgroundColor: TROPHY_COLORS[rank - 1] }}>
                    <span style={{ fontSize: '16px' }}>🏆</span>
                    <span style={{ marginTop: '-2px', fontSize: '10px' }}>{TROPHY_LABELS[rank - 1]}</span>
                  </div>
                )}
              </div>

              {/* Title Info */}
              <div>
                <div className="card-title">
                  {isTerritory ? `Territory: ${row.TERRITORY}` : `${row.STORE_ID} ${row.STORE_NAME}`}
                </div>
                {!isTerritory && row.TERRITORY && (
                  <div className="card-subtitle">
                    Location: <strong>{row.REGION_ID} {row.TERRITORY}</strong>
                  </div>
                )}
              </div>

              {/* Progress Bars */}
              <div className="card-bars">
                <div className="bar-row">
                  <div className="bar-lbl">{boxDayLY}</div>
                  <div className="bar-outer">
                    <div className="bar-inner" style={{ width: `${Math.min(lyPct, 100)}%`, backgroundColor: 'rgba(250, 250, 250, 0.6)' }} />
                  </div>
                </div>
                <div className="bar-row">
                  <div className="bar-lbl">{boxDayCY}</div>
                  <div className="bar-outer">
                    <div className="bar-inner" style={{ width: `${Math.min(cyPct, 100)}%`, backgroundColor: 'rgba(255, 255, 255, 0.9)' }} />
                  </div>
                </div>
              </div>

              {/* Stats info */}
              <div className="card-stats">
                <div className="stats-lbl">
                  ${formatNumber(ly)} / ${formatNumber(cy)}
                </div>
                <div className="lift-pill" style={{ color: lift >= 0 ? '#15803d' : '#dc2626' }}>
                  {formatPercent(lift)}
                </div>
              </div>

              {/* Card Bottom */}
              <div className="card-bottom">
                <div className="bottom-lbl">
                  {sortMode.includes('Lift') ? 'Lift' : 'Sales'}
                </div>
                <div className="bottom-val">
                  {sortMode.includes('Lift') ? formatPercent(lift) : `$${formatNumber(cy)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
