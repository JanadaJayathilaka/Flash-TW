package com.flash.service;

import com.flash.model.StoreDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Service for SQL Server queries.
 * Replaces the Node.js sqlServer.js config + sales.js SQL Server logic.
 */
@Service
public class SqlServerService {
    private static final Logger log = LoggerFactory.getLogger(SqlServerService.class);

    private final JdbcTemplate jdbc;

    @Value("${cache.store-details.ttl:300000}")
    private long cacheTtl;

    // Store details cache (equivalent to Node.js storeDetailsCache + storeCacheTime)
    private volatile Map<String, StoreDetail> storeCache = null;
    private volatile long storeCacheTime = 0;

    public SqlServerService(@Qualifier("sqlServerJdbcTemplate") JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Get store details from SQL Server SP, with caching.
     * Returns a Map of storeId → StoreDetail.
     * Equivalent to Node.js: getStoreDetails() function
     */
    public Map<String, StoreDetail> getStoreDetails() {
        long now = System.currentTimeMillis();
        if (storeCache != null && (now - storeCacheTime) < cacheTtl) {
            return storeCache;
        }

        log.info("[sqlserver] Calling GetRegionStoreDetailAndCalendar SP for store cache...");

        Map<String, StoreDetail> map = new ConcurrentHashMap<>();

        jdbc.execute((Connection con) -> con.prepareCall("{ CALL GetRegionStoreDetailAndCalendar }"),
            (CallableStatement cs) -> {
                boolean hasResult = cs.execute();
                if (hasResult) {
                    ResultSet rs = cs.getResultSet();
                    while (rs.next()) {
                        String id = safe(rs.getString("A"));
                        map.put(id, new StoreDetail(
                            id,
                            safe(rs.getString("C")),  // Store_Name
                            safe(rs.getString("B")),  // ASGS_NAME (Territory)
                            safe(rs.getString("D")),  // Date_Opened
                            safe(rs.getString("E"))   // Region_ID
                        ));
                    }
                }
                return null;
            });

        storeCache = map;
        storeCacheTime = System.currentTimeMillis();
        log.info("[sqlserver] Cached {} store details", map.size());
        return map;
    }

    /**
     * Get store list + fiscal calendar from SQL Server SP.
     * Returns a map with "SubClass" and "FiscalCalendar" keys.
     * Equivalent to Node.js: GET /api/sales/dds route
     */
    public Map<String, Object> getStoreDetailsAndCalendar() {
        log.info("[dds] Calling GetRegionStoreDetailAndCalendar...");

        return jdbc.execute((Connection con) -> con.prepareCall("{ CALL GetRegionStoreDetailAndCalendar }"),
            (CallableStatement cs) -> {
                boolean hasResult = cs.execute();

                // Result set 0 — stores: A=Store_ID, B=ASGS_NAME, C=Store_Name, D=Date_Opened, E=Region_ID
                List<Map<String, String>> subClass = new ArrayList<>();
                if (hasResult) {
                    ResultSet rs = cs.getResultSet();
                    while (rs.next()) {
                        Map<String, String> row = new LinkedHashMap<>();
                        row.put("Store_ID",    safe(rs.getString("A")));
                        row.put("ASGS_NAME",   safe(rs.getString("B")));
                        row.put("Store_Name",  safe(rs.getString("C")));
                        row.put("Date_Opened", safe(rs.getString("D")));
                        row.put("Region_ID",   safe(rs.getString("E")));
                        subClass.add(row);
                    }
                }

                // Result set 1 — fiscal calendar: A=FiscalDate, B=FiscalYear, C=WeekInYear, D=DayInWeek, E=DayInYear, F=CalQuarter
                List<Map<String, String>> fiscalCalendar = new ArrayList<>();
                if (cs.getMoreResults()) {
                    ResultSet rs = cs.getResultSet();
                    while (rs.next()) {
                        Map<String, String> row = new LinkedHashMap<>();
                        row.put("FiscalDate",  safe(rs.getString("A")));
                        row.put("FiscalYear",  safe(rs.getString("B")));
                        row.put("WeekInYear",  safe(rs.getString("C")));
                        row.put("DayInWeek",   safe(rs.getString("D")));
                        row.put("DayInYear",   safe(rs.getString("E")));
                        row.put("CalQuarter",  safe(rs.getString("F")));
                        fiscalCalendar.add(row);
                    }
                }

                Map<String, Object> result = new LinkedHashMap<>();
                result.put("SubClass", subClass);
                result.put("FiscalCalendar", fiscalCalendar);
                return result;
            });
    }

    private String safe(String val) {
        return val != null ? val.trim() : "";
    }
}
