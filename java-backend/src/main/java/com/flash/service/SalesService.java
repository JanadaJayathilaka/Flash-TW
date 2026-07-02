package com.flash.service;

import com.flash.model.AnalyticsPayload;
import com.flash.model.SalesPivotRow;
import com.flash.model.StoreDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.WeekFields;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Core business logic service.
 * Handles enrichment, territory/grand totals, comp calculations, and chart data building.
 * Replaces the Node.js sales.js helper functions and route logic.
 */
@Service
public class SalesService {
    private static final Logger log = LoggerFactory.getLogger(SalesService.class);

    private final IbmSalesService ibmService;
    private final SqlServerService sqlServerService;

    public SalesService(IbmSalesService ibmService, SqlServerService sqlServerService) {
        this.ibmService = ibmService;
        this.sqlServerService = sqlServerService;
    }

    /**
     * Comp calculation — matches Node.js calcComp behavior exactly:
     * If either side is zero, comp is forced to 0.00%.
     */
    public static double calcComp(double cy, double ly) {
        if (cy == 0 || ly == 0) return 0.0;
        return BigDecimal.valueOf(((cy - ly) / ly) * 100)
                .setScale(2, RoundingMode.HALF_UP)
                .doubleValue();
    }

    /**
     * Enrich ODBC rows with store details and build territory/grand totals.
     * This is the core logic from both /pivot and /pivotsum Node.js routes.
     *
     * @param odbcRows   Raw rows from the IBM i stored procedure
     * @param includeQtd Whether to include QTD columns (true for pivotsum, false for pivot)
     * @return Enriched rows with territory totals and grand total appended
     */
    public List<Map<String, Object>> enrichPivotData(
            List<Map<String, Object>> odbcRows, boolean includeQtd) {

        Map<String, StoreDetail> storeMap = sqlServerService.getStoreDetails();
        log.info("[enrichPivotData] {} ODBC rows, {} store entries, includeQtd={}", 
                odbcRows.size(), storeMap.size(), includeQtd);

        // Map each ODBC row to a SalesPivotRow
        List<SalesPivotRow> storeRows = new ArrayList<>();
        for (Map<String, Object> row : odbcRows) {
            SalesPivotRow pr = new SalesPivotRow();
            String storeId = str(row.get("STORE_ID"));
            StoreDetail info = storeMap.getOrDefault(storeId,
                    new StoreDetail(storeId, storeId, "Unknown", "", ""));

            pr.setStoreId(storeId);
            pr.setStoreName(info.storeName());
            pr.setTerritory(info.territory());
            pr.setRegionId(info.regionId());
            pr.setDateOpened(info.dateOpened());

            double dayCY = dbl(row.get("TOTAL_DATE_1"));
            double dayLY = dbl(row.get("TOTAL_DATE_2"));
            pr.setDaySalesCy(dayCY);
            pr.setDaySalesLy(dayLY);
            pr.setDaySalesComp(calcComp(dayCY, dayLY));

            double wtdCY = dbl(row.get("TOTAL_WTD_1"));
            double wtdLY = dbl(row.get("TOTAL_WTD_2"));
            pr.setWtdSalesCy(wtdCY);
            pr.setWtdSalesLy(wtdLY);
            pr.setWtdSalesComp(calcComp(wtdCY, wtdLY));

            if (includeQtd) {
                double qtdCY = dbl(row.get("TOTAL_QTD_1"));
                double qtdLY = dbl(row.get("TOTAL_QTD_2"));
                pr.setQtdSalesCy(qtdCY);
                pr.setQtdSalesLy(qtdLY);
                pr.setQtdSalesComp(calcComp(qtdCY, qtdLY));
            }

            double ytdCY = dbl(row.get("TOTAL_YTD_1"));
            double ytdLY = dbl(row.get("TOTAL_YTD_2"));
            pr.setYtdSalesCy(ytdCY);
            pr.setYtdSalesLy(ytdLY);
            pr.setYtdSalesComp(calcComp(ytdCY, ytdLY));

            storeRows.add(pr);
        }

        // Group by territory (TreeMap for alphabetical sorting)
        Map<String, List<SalesPivotRow>> territories = storeRows.stream()
                .collect(Collectors.groupingBy(SalesPivotRow::getTerritory, TreeMap::new, Collectors.toList()));

        List<Map<String, Object>> enriched = new ArrayList<>();

        for (Map.Entry<String, List<SalesPivotRow>> entry : territories.entrySet()) {
            List<SalesPivotRow> rows = entry.getValue();
            // Sort stores within territory by name
            rows.sort(Comparator.comparing(SalesPivotRow::getStoreName));

            // Add individual store rows
            for (SalesPivotRow r : rows) {
                enriched.add(r.toMap());
            }

            // Add territory total row
            String regionId = rows.isEmpty() ? "" : rows.get(0).getRegionId();
            enriched.add(buildTotalRow(
                    entry.getKey() + " Total", entry.getKey(), regionId,
                    rows, true, false, includeQtd));
        }

        // Grand total row
        enriched.add(buildTotalRow("Grand Total", "", "", storeRows, false, true, includeQtd));

        return enriched;
    }

    /**
     * Build a total row (territory total or grand total).
     */
    private Map<String, Object> buildTotalRow(String name, String territory, String regionId,
            List<SalesPivotRow> rows, boolean isTerritoryTotal, boolean isGrandTotal, boolean includeQtd) {

        double dayCY = rows.stream().mapToDouble(SalesPivotRow::getDaySalesCy).sum();
        double dayLY = rows.stream().mapToDouble(SalesPivotRow::getDaySalesLy).sum();
        double wtdCY = rows.stream().mapToDouble(SalesPivotRow::getWtdSalesCy).sum();
        double wtdLY = rows.stream().mapToDouble(SalesPivotRow::getWtdSalesLy).sum();
        double qtdCY = rows.stream().mapToDouble(SalesPivotRow::getQtdSalesCy).sum();
        double qtdLY = rows.stream().mapToDouble(SalesPivotRow::getQtdSalesLy).sum();
        double ytdCY = rows.stream().mapToDouble(SalesPivotRow::getYtdSalesCy).sum();
        double ytdLY = rows.stream().mapToDouble(SalesPivotRow::getYtdSalesLy).sum();

        Map<String, Object> map = new LinkedHashMap<>();
        map.put("STORE_ID", "");
        map.put("STORE_NAME", name);
        map.put("TERRITORY", territory);
        map.put("REGION_ID", regionId);
        map.put("DATE_OPENED", "");
        map.put("DAY_SALES_CY", dayCY);
        map.put("DAY_SALES_LY", dayLY);
        map.put("DAY_SALES_COMP", calcComp(dayCY, dayLY));
        map.put("WTD_SALES_CY", wtdCY);
        map.put("WTD_SALES_LY", wtdLY);
        map.put("WTD_SALES_COMP", calcComp(wtdCY, wtdLY));
        if (includeQtd) {
            map.put("QTD_SALES_CY", qtdCY);
            map.put("QTD_SALES_LY", qtdLY);
            map.put("QTD_SALES_COMP", calcComp(qtdCY, qtdLY));
        }
        map.put("YTD_SALES_CY", ytdCY);
        map.put("YTD_SALES_LY", ytdLY);
        map.put("YTD_SALES_COMP", calcComp(ytdCY, ytdLY));
        map.put("IS_TERRITORY_TOTAL", isTerritoryTotal);
        map.put("IS_GRAND_TOTAL", isGrandTotal);
        return map;
    }

    // ══════════════════════════════════════════════════════════════
    // ── Analytics / Chart data (matches Node.js buildChartPayload + getAnalyticsData)
    // ══════════════════════════════════════════════════════════════

    /**
     * Get analytics data for a date range, aggregated by mode (D/W/M/Y).
     * Equivalent to Node.js: getAnalyticsData() function
     */
    public AnalyticsPayload getAnalyticsData(String startDate, String endDate, String modeRaw, int smaPeriod) {
        String mode = modeRaw.toUpperCase();
        if ("Q".equals(mode)) mode = "M"; // Quarterly maps to Monthly (matching Node.js)

        List<Map<String, Object>> rawRows = ibmService.getDailySales(startDate, endDate);
        log.info("[analytics] Got {} daily rows for range {} to {}", rawRows.size(), startDate, endDate);

        if (rawRows.isEmpty()) {
            return new AnalyticsPayload(List.of(), List.of(), List.of());
        }

        // Parse daily data
        List<String> dailyDates = new ArrayList<>();
        List<Double> dailySales = new ArrayList<>();
        for (Map<String, Object> row : rawRows) {
            Object dateObj = row.get("SALES_ON_DATE");
            String dateStr = dateObj != null ? dateObj.toString().substring(0, 10) : "";
            dailyDates.add(dateStr);
            dailySales.add(dbl(row.get("TOTAL_SALES")));
        }

        // Calculate Simple Moving Average (SMA)
        List<Double> dailySma = new ArrayList<>();
        for (int i = 0; i < dailySales.size(); i++) {
            if (i < smaPeriod - 1) {
                dailySma.add(null);
            } else {
                double sum = 0;
                for (int j = i - smaPeriod + 1; j <= i; j++) {
                    sum += dailySales.get(j);
                }
                dailySma.add(BigDecimal.valueOf(sum / smaPeriod)
                        .setScale(2, RoundingMode.HALF_UP).doubleValue());
            }
        }

        return buildChartPayload(dailyDates, dailySales, dailySma, mode);
    }

    /**
     * Build chart payload aggregated by mode.
     * Equivalent to Node.js: buildChartPayload() function
     */
    private AnalyticsPayload buildChartPayload(List<String> dates, List<Double> sales,
            List<Double> sma, String mode) {

        if ("D".equals(mode)) {
            return new AnalyticsPayload(dates, sales, sma);
        }

        // Aggregate by week/month/year
        Map<String, double[]> buckets = new LinkedHashMap<>(); // [sales, smaSum, smaCount]
        for (int i = 0; i < dates.size(); i++) {
            String key;
            if ("W".equals(mode)) {
                LocalDate ld = LocalDate.parse(dates.get(i));
                int weekNum = ld.get(WeekFields.ISO.weekOfWeekBasedYear());
                key = "W" + String.format("%02d", weekNum);
            } else if ("M".equals(mode)) {
                key = dates.get(i).substring(0, 7); // YYYY-MM
            } else {
                key = dates.get(i).substring(0, 4); // YYYY
            }

            buckets.computeIfAbsent(key, k -> new double[3]);
            double[] b = buckets.get(key);
            b[0] += sales.get(i);
            if (sma.get(i) != null) {
                b[1] += sma.get(i);
                b[2]++;
            }
        }

        List<String> labels = new ArrayList<>(buckets.keySet());
        List<Double> aggSales = new ArrayList<>();
        List<Double> aggSma = new ArrayList<>();
        for (String k : labels) {
            double[] b = buckets.get(k);
            aggSales.add(b[0]);
            aggSma.add(b[2] > 0
                    ? BigDecimal.valueOf(b[1] / b[2]).setScale(2, RoundingMode.HALF_UP).doubleValue()
                    : null);
        }

        return new AnalyticsPayload(labels, aggSales, aggSma);
    }

    // ── Helpers ──

    private String str(Object val) {
        return val != null ? val.toString().trim() : "";
    }

    private double dbl(Object val) {
        if (val == null) return 0.0;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try {
            return Double.parseDouble(val.toString());
        } catch (Exception e) {
            return 0.0;
        }
    }
}
