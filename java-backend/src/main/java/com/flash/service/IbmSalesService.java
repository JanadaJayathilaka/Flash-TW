package com.flash.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;

/**
 * Service for all IBM i (AS/400) database queries via JT400 JDBC.
 * Replaces the Node.js ODBC-based ibmOdbc.js + sales.js queries.
 */
@Service
public class IbmSalesService {
    private static final Logger log = LoggerFactory.getLogger(IbmSalesService.class);

    private final JdbcTemplate jdbc;

    public IbmSalesService(@Qualifier("ibmJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Get the latest sales date from AHLIBR.STRSLSSMRY.
     * Equivalent to Node.js: SELECT MAX(SALES_ON_DATE) AS LATEST_DATE ...
     */
    public String getLatestDate() {
        String sql = "SELECT MAX(SALES_ON_DATE) AS LATEST_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1";
        log.info("[latest-date] Querying MAX SALES_ON_DATE from AHLIBR.STRSLSSMRY...");
        return jdbc.query(sql, rs -> {
            if (rs.next()) {
                java.sql.Date d = rs.getDate("LATEST_DATE");
                if (d != null) {
                    String result = d.toString(); // returns YYYY-MM-DD
                    log.info("[latest-date] Result: {}", result);
                    return result;
                }
            }
            log.info("[latest-date] No date found");
            return null;
        });
    }

    /**
     * Call AHLIBR.GET_SALES_PVT_SUMRY stored procedure (14 params).
     * Equivalent to Node.js: odbcQuery('{ CALL AHLIBR.GET_SALES_PVT_SUMRY(?, ...) }', [...])
     */
    public List<Map<String, Object>> callPivotSummarySP(String dt1, String dt2,
            String wtd1s, String wtd1e, String wtd2s, String wtd2e,
            String qtd1s, String qtd1e, String qtd2s, String qtd2e,
            String ytd1s, String ytd1e, String ytd2s, String ytd2e) {

        log.info("[pivotsum] Calling AHLIBR.GET_SALES_PVT_SUMRY with params: DT_1={}, DT_2={}", dt1, dt2);
        String sql = "{ CALL AHLIBR.GET_SALES_PVT_SUMRY(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }";

        return jdbc.execute((Connection con) -> {
            CallableStatement cs = con.prepareCall(sql);
            cs.setString(1, dt1);   cs.setString(2, dt2);
            cs.setString(3, wtd1s); cs.setString(4, wtd1e);
            cs.setString(5, wtd2s); cs.setString(6, wtd2e);
            cs.setString(7, qtd1s); cs.setString(8, qtd1e);
            cs.setString(9, qtd2s); cs.setString(10, qtd2e);
            cs.setString(11, ytd1s); cs.setString(12, ytd1e);
            cs.setString(13, ytd2s); cs.setString(14, ytd2e);
            return cs;
        }, (CallableStatement cs) -> {
            ResultSet rs = cs.executeQuery();
            List<Map<String, Object>> rows = extractRows(rs);
            log.info("[pivotsum] Got {} rows from SP", rows.size());
            if (!rows.isEmpty()) {
                log.info("[pivotsum] First row keys: {}", rows.get(0).keySet());
            }
            return rows;
        });
    }

    /**
     * Call KANDY.GET_STORE_SALES_BY_DATES_PIVOT stored procedure (10 params).
     * Equivalent to Node.js: odbcQuery('{ CALL KANDY.GET_STORE_SALES_BY_DATES_PIVOT(?, ...) }', [...])
     */
    public List<Map<String, Object>> callPivotSP(String dt1, String dt2,
            String wtd1s, String wtd1e, String wtd2s, String wtd2e,
            String ytd1s, String ytd1e, String ytd2s, String ytd2e) {

        log.info("[pivot] Calling KANDY.GET_STORE_SALES_BY_DATES_PIVOT...");
        String sql = "{ CALL KANDY.GET_STORE_SALES_BY_DATES_PIVOT(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) }";

        return jdbc.execute((Connection con) -> {
            CallableStatement cs = con.prepareCall(sql);
            cs.setString(1, dt1);   cs.setString(2, dt2);
            cs.setString(3, wtd1s); cs.setString(4, wtd1e);
            cs.setString(5, wtd2s); cs.setString(6, wtd2e);
            cs.setString(7, ytd1s); cs.setString(8, ytd1e);
            cs.setString(9, ytd2s); cs.setString(10, ytd2e);
            return cs;
        }, (CallableStatement cs) -> {
            ResultSet rs = cs.executeQuery();
            List<Map<String, Object>> rows = extractRows(rs);
            log.info("[pivot] Got {} rows from SP", rows.size());
            return rows;
        });
    }

    /**
     * Call KANDY.GET_STORE_SALES_BY_DATES stored procedure (2 params).
     * Equivalent to Node.js: odbcQuery('{ CALL KANDY.GET_STORE_SALES_BY_DATES(?, ?) }', [...])
     */
    public List<Map<String, Object>> callHistSP(String date1, String date2) {
        log.info("[hist] Calling KANDY.GET_STORE_SALES_BY_DATES({}, {})...", date1, date2);
        String sql = "{ CALL KANDY.GET_STORE_SALES_BY_DATES(?, ?) }";

        return jdbc.execute((Connection con) -> {
            CallableStatement cs = con.prepareCall(sql);
            cs.setString(1, date1);
            cs.setString(2, date2);
            return cs;
        }, (CallableStatement cs) -> {
            ResultSet rs = cs.executeQuery();
            List<Map<String, Object>> rows = extractRows(rs);
            log.info("[hist] Got {} rows", rows.size());
            return rows;
        });
    }

    /**
     * Get available dates (top 2 most recent distinct dates with sales data).
     * Equivalent to Node.js: /api/sales/available-dates route
     */
    public List<String> getAvailableDates() {
        log.info("[available-dates] Querying...");

        // Step 1: Get the latest date
        String latestSql = "SELECT MAX(SALES_ON_DATE) AS LATEST_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1";
        String latest = jdbc.query(latestSql, rs -> {
            if (rs.next()) {
                java.sql.Date d = rs.getDate("LATEST_DATE");
                return d != null ? d.toString() : null;
            }
            return null;
        });

        if (latest == null) {
            log.info("[available-dates] No dates found");
            return List.of();
        }

        // Step 2: Get the second-latest distinct date
        String prevSql = "SELECT MAX(SALES_ON_DATE) AS PREV_DATE FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1 AND SALES_ON_DATE < ?";
        String prev = jdbc.query(prevSql, ps -> ps.setString(1, latest), rs -> {
            if (rs.next()) {
                java.sql.Date d = rs.getDate("PREV_DATE");
                return d != null ? d.toString() : null;
            }
            return null;
        });

        List<String> dates = new ArrayList<>();
        if (prev != null) dates.add(prev); // earlier date first (ascending)
        dates.add(latest);
        log.info("[available-dates] Returning {} dates: {}", dates.size(), dates);
        return dates;
    }

    /**
     * Get daily aggregated sales for analytics/chart.
     * Equivalent to Node.js: getAnalyticsData SQL query
     */
    public List<Map<String, Object>> getDailySales(String startDate, String endDate) {
        String sql = """
            SELECT SALES_ON_DATE, SUM(NET_SALES) AS TOTAL_SALES
            FROM AHLIBR.STRSLSSMRY
            WHERE STATUS = 1 AND SALES_ON_DATE >= ? AND SALES_ON_DATE <= ?
            GROUP BY SALES_ON_DATE
            ORDER BY SALES_ON_DATE
        """;
        List<Map<String, Object>> rows = jdbc.queryForList(sql, startDate, endDate);
        log.info("[dailySales] Got {} rows for range {} to {}", rows.size(), startDate, endDate);
        return rows;
    }

    /**
     * Debug: get column names from STRSLSSMRY.
     * Equivalent to Node.js: /api/sales/chart-columns route
     */
    public Map<String, Object> getChartColumns() {
        String sql = "SELECT * FROM AHLIBR.STRSLSSMRY WHERE STATUS = 1 FETCH FIRST 1 ROWS ONLY";
        List<Map<String, Object>> rows = jdbc.queryForList(sql);
        if (rows.isEmpty()) {
            return Map.of("columns", List.of(), "sampleRow", Map.of());
        }
        return Map.of(
            "columns", new ArrayList<>(rows.get(0).keySet()),
            "sampleRow", rows.get(0)
        );
    }

    // ── Helper: Extract all rows from a ResultSet into List<Map> with UPPERCASE keys ──
    private List<Map<String, Object>> extractRows(ResultSet rs) throws SQLException {
        List<Map<String, Object>> rows = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int colCount = meta.getColumnCount();

        while (rs.next()) {
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= colCount; i++) {
                // Normalise column names to UPPERCASE (matching Node.js normalizeRow)
                row.put(meta.getColumnLabel(i).toUpperCase(), rs.getObject(i));
            }
            rows.add(row);
        }
        return rows;
    }
}
