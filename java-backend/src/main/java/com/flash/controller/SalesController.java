package com.flash.controller;

import com.flash.model.AnalyticsPayload;
import com.flash.service.IbmSalesService;
import com.flash.service.SalesService;
import com.flash.service.SqlServerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * REST controller for all /api/sales/* endpoints.
 * Replaces the Node.js Express router in routes/sales.js.
 */
@RestController
@RequestMapping("/api/sales")
public class SalesController {
    private static final Logger log = LoggerFactory.getLogger(SalesController.class);

    private final IbmSalesService ibmService;
    private final SqlServerService sqlServerService;
    private final SalesService salesService;

    public SalesController(IbmSalesService ibmService,
                           SqlServerService sqlServerService,
                           SalesService salesService) {
        this.ibmService = ibmService;
        this.sqlServerService = sqlServerService;
        this.salesService = salesService;
    }

    // ── GET /api/sales/latest-date ──
    @GetMapping("/latest-date")
    public Map<String, Object> latestDate() {
        String date = ibmService.getLatestDate();
        return Map.of("latestDate", date != null ? date : "");
    }

    // ── GET /api/sales/dds ──
    @GetMapping("/dds")
    public Map<String, Object> storeDetailsAndCalendar() {
        return sqlServerService.getStoreDetailsAndCalendar();
    }

    // ── GET /api/sales/pivot ──
    @GetMapping("/pivot")
    public List<Map<String, Object>> pivot(
            @RequestParam String DT_1, @RequestParam String DT_2,
            @RequestParam String P_WTD_1_S, @RequestParam String P_WTD_1_E,
            @RequestParam String P_WTD_2_S, @RequestParam String P_WTD_2_E,
            @RequestParam String P_YTD_1_S, @RequestParam String P_YTD_1_E,
            @RequestParam String P_YTD_2_S, @RequestParam String P_YTD_2_E) {

        log.info("[pivot] Params: DT_1={}, DT_2={}", DT_1, DT_2);

        List<Map<String, Object>> odbcResult = ibmService.callPivotSP(
                DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E);

        return salesService.enrichPivotData(odbcResult, false);
    }

    // ── GET /api/sales/pivotsum ──
    @GetMapping("/pivotsum")
    public Map<String, Object> pivotSum(
            @RequestParam String DT_1, @RequestParam String DT_2,
            @RequestParam String P_WTD_1_S, @RequestParam String P_WTD_1_E,
            @RequestParam String P_WTD_2_S, @RequestParam String P_WTD_2_E,
            @RequestParam String P_QTD_1_S, @RequestParam String P_QTD_1_E,
            @RequestParam String P_QTD_2_S, @RequestParam String P_QTD_2_E,
            @RequestParam String P_YTD_1_S, @RequestParam String P_YTD_1_E,
            @RequestParam String P_YTD_2_S, @RequestParam String P_YTD_2_E) {

        log.info("[pivotsum] Params: DT_1={}, DT_2={}, P_WTD_1_S={}, P_WTD_1_E={}", DT_1, DT_2, P_WTD_1_S, P_WTD_1_E);

        List<Map<String, Object>> odbcResult = ibmService.callPivotSummarySP(
                DT_1, DT_2, P_WTD_1_S, P_WTD_1_E, P_WTD_2_S, P_WTD_2_E,
                P_QTD_1_S, P_QTD_1_E, P_QTD_2_S, P_QTD_2_E,
                P_YTD_1_S, P_YTD_1_E, P_YTD_2_S, P_YTD_2_E);

        List<Map<String, Object>> enriched = salesService.enrichPivotData(odbcResult, true);

        // Extract TOTAL_ROWS from first raw ODBC row (same as Node.js)
        int totalRows = 0;
        if (!odbcResult.isEmpty() && odbcResult.get(0).get("TOTAL_ROWS") != null) {
            try {
                totalRows = Integer.parseInt(odbcResult.get(0).get("TOTAL_ROWS").toString());
            } catch (Exception ignored) {}
        }

        return Map.of("PivotData", enriched, "TotalCount", totalRows);
    }

    // ── GET /api/sales/hist ──
    @GetMapping("/hist")
    public List<Map<String, Object>> hist(
            @RequestParam String date1,
            @RequestParam String date2) {
        return ibmService.callHistSP(date1, date2);
    }

    // ── GET /api/sales/available-dates ──
    @GetMapping("/available-dates")
    public Map<String, Object> availableDates() {
        return Map.of("dates", ibmService.getAvailableDates());
    }

    // ── GET /api/sales/chart-columns ──
    @GetMapping("/chart-columns")
    public Map<String, Object> chartColumns() {
        return ibmService.getChartColumns();
    }

    // ── GET /api/sales/analytics ──
    @GetMapping("/analytics")
    public ResponseEntity<?> analytics(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "D") String mode,
            @RequestParam(defaultValue = "7") int smaPeriod) {

        if (startDate == null || endDate == null || startDate.isEmpty() || endDate.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "startDate and endDate are required"));
        }

        log.info("[analytics] REST: startDate={}, endDate={}, mode={}, smaPeriod={}", startDate, endDate, mode, smaPeriod);
        AnalyticsPayload payload = salesService.getAnalyticsData(startDate, endDate, mode, smaPeriod);
        log.info("[analytics] REST: Returning {} data points", payload.Labels().size());
        return ResponseEntity.ok(payload);
    }

    // ── GET /api/sales/chart ──
    @GetMapping("/chart")
    public AnalyticsPayload chart(
            @RequestParam(defaultValue = "2026") int yearFrom,
            @RequestParam(defaultValue = "2026") int yearTo,
            @RequestParam(defaultValue = "D") String mode,
            @RequestParam(defaultValue = "7") int smaPeriod) {

        String dateFrom = yearFrom + "-01-01";
        String dateTo = yearTo + "-12-31";
        log.info("[chart] yearFrom={}, yearTo={}, mode={}, smaPeriod={}", yearFrom, yearTo, mode, smaPeriod);

        return salesService.getAnalyticsData(dateFrom, dateTo, mode, smaPeriod);
    }
}
