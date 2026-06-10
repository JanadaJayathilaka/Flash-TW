import { useState, useMemo } from 'react';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';

const CARD_COLORS = [
  '#b61c1c',
  '#c62827',
  '#e53f3d',
  '#f5511e',
  '#ef6c00',
  '#795548',  
  '#997d74',
  '#ff9f00',
  '#ffb019',
  '#f9ba00'
];

export default function LaggardsTab({ data, loading, boxDayCY, boxDayLY, search }) {
  const [sortMode, setSortMode] = useState('lowestSales'); // lowestSales | highestLost | territoryLowestSales | territoryHighestLost

  const m = useMemo(() => getBestMetric(data), [data]);

  const getNormalizedLostSales = useMemo(() => {
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

    // Filter by negative comps
    const negativeStores = storeRows.filter((r) => getNormalizedLostSales(r) < 0);
    const negativeTerritories = territoryRows.filter((r) => getNormalizedLostSales(r) < 0);

    let sortedData = [];
    switch (sortMode) {
      case 'lowestSales':
        sortedData = [...negativeStores].sort((a, b) => (a[m.cy] ?? 0) - (b[m.cy] ?? 0));
        break;
      case 'highestLost':
        sortedData = [...negativeStores].sort((a, b) => getNormalizedLostSales(a) - getNormalizedLostSales(b));
        break;
      case 'territoryLowestSales':
        sortedData = [...negativeTerritories].sort((a, b) => (a[m.cy] ?? 0) - (b[m.cy] ?? 0));
        break;
      case 'territoryHighestLost':
        sortedData = [...negativeTerritories].sort((a, b) => getNormalizedLostSales(a) - getNormalizedLostSales(b));
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
  }, [data, sortMode, m, loading, search, getNormalizedLostSales]);

  if (loading) {
    return <div className="loading-view">Loading bottom performers...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div>
      {/* Subtabs controls */}
      <div className="subtabs-bar">
        <button 
          className={`subtab-option ${sortMode === 'lowestSales' ? 'active' : ''}`}
          onClick={() => setSortMode('lowestSales')}
        >
          <div className="subtab-icon-wrap" style={{ backgroundColor: '#4caf50', color: '#fff', borderRadius: '4px' }}>$</div>
          <span>Bottom 10 Location by<br/>$ Sales Drop</span>
        </button>
        <button 
          className={`subtab-option ${sortMode === 'highestLost' ? 'active' : ''}`}
          onClick={() => setSortMode('highestLost')}
        >
          <div className="subtab-icon-wrap" style={{ backgroundColor: '#26a69a', color: '#fff', borderRadius: '50%' }}>%</div>
          <span>Bottom 10 Location by<br/>% Sales Drop</span>
        </button>
        <button 
          className={`subtab-option ${sortMode === 'territoryLowestSales' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryLowestSales')}
        >
          <div className="subtab-icon-wrap"><i className="material-icons" style={{ fontSize: '28px', color: '#616161' }}>account_balance</i></div>
          <span>Locations by<br/>$ Sales Drop</span>
        </button>
        <button 
          className={`subtab-option ${sortMode === 'territoryHighestLost' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryHighestLost')}
        >
          <div className="subtab-icon-wrap"><i className="material-icons" style={{ fontSize: '28px', color: '#616161' }}>trending_down</i></div>
          <span>Locations by<br/>% Sales Drop</span>
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
          const lift = getNormalizedLostSales(row);

          const isTerritory = sortMode.includes('territory');

          return (
            <div key={`${row.STORE_ID || row.TERRITORY}-${rank}`} className="leader-card" style={{ backgroundColor: color }}>
              {/* Header */}
              <div className="card-top">
                <div className="card-rank">{rank}</div>
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
                  {sortMode.includes('Lost') ? 'Sales Lost' : 'Sales'}
                </div>
                <div className="bottom-val">
                  {sortMode.includes('Lost') ? formatPercent(lift) : `$${formatNumber(cy)}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
