import { useState, useMemo } from 'react';
import { formatNumber, formatPercent, getBestMetric } from '../utils/dateUtils';
import BotSales_sel from '../assets/LaggardsIcons/BotSales_sel.png'
import BotSales from '../assets/LaggardsIcons/BotSales.png'
import BotSalesLift_sel from '../assets/LaggardsIcons/BotSalesLift_sel.png'
import BotSalesLift from '../assets/LaggardsIcons/BotSalesLift.png'
import TerSalesLag_sel from '../assets/LaggardsIcons/TerSalesLag_sel.png.png'
import TerSalesLag from '../assets/LaggardsIcons/TerSalesLag.png'
import TerSalesLagLift_sel from '../assets/LaggardsIcons/TerSalesLiftLag_sel.png'
import TerSalesLagLift from '../assets/LaggardsIcons/TerSalesLiftLag.png'
import { CARD_COLORS } from '../../constants'

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
    return <div className="loading-view">Loading Laggards...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="loading-view">No sales data available.</div>;
  }

  return (
    <div>
      {/* Subtabs controls */}
      <div className="flex justify-between w-full">
        <div className='flex-row items-center align-center '>
          <button
            className={`subtab-option ${sortMode === 'lowestSales' ? 'active' : ''}`}
            onClick={() => setSortMode('lowestSales')}
          >
            <img src={sortMode === 'lowestSales' ? BotSales_sel : BotSales} className="subtab-icon-wrap" />
            <span>Bottom 10 Location by $ Sales Drop</span>
          </button>
        </div>

        <div className='flex-row items-center align-center '><button
          className={`subtab-option ${sortMode === 'highestLost' ? 'active' : ''}`}
          onClick={() => setSortMode('highestLost')}
        >
          <img src={sortMode === 'highestLost' ? BotSalesLift_sel : BotSalesLift} className="subtab-icon-wrap" />
          <span>Bottom 10 Location by % Sales Drop</span>
        </button></div>


        <div className='flex-row items-center align-center '><button
          className={`subtab-option ${sortMode === 'territoryLowestSales' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryLowestSales')}
        >
          <img src={sortMode === 'territoryLowestSales' ? TerSalesLag_sel : TerSalesLag} className="subtab-icon-wrap" />
          <span>Locations by $ Sales Drop</span>
        </button></div>


        <div className='flex-row items-center align-center '> <button
          className={`subtab-option ${sortMode === 'territoryHighestLost' ? 'active' : ''}`}
          onClick={() => setSortMode('territoryHighestLost')}
        >
          <img src={sortMode === 'territoryHighestLost' ? TerSalesLagLift_sel : TerSalesLagLift} className="subtab-icon-wrap" />
          <span>Locations by % Sales Drop</span>
        </button></div>

      </div>

      {/* Cards Grid */}
      <div className="cards-grid" key={sortMode}>
        {rankedData.map(({ row, rank, color }, index) => {
          const ly = Number(row[m.ly] ?? 0);
          const cy = Number(row[m.cy] ?? 0);
          const sTotal = ly + cy || 1;
          const lyPct = (ly / sTotal) * 100;
          const cyPct = (cy / sTotal) * 100;
          const lift = getNormalizedLostSales(row);

          const isTerritory = sortMode.includes('territory');

          return (
            <div
              key={`${row.STORE_ID || row.TERRITORY}-${rank}`}
              className="leader-card animated-card"
              style={{
                backgroundColor: color,
                animationDelay: `${index * 50}ms`
              }}
            >
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
                <div className="stats-lbl border-b w-full">
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
