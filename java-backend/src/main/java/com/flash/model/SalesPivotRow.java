package com.flash.model;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Sales pivot row DTO. Provides toMap() to serialize into the exact JSON shape
 * the frontend expects (UPPER_SNAKE_CASE keys matching Node.js output).
 */
public class SalesPivotRow {
    private String storeId = "";
    private String storeName = "";
    private String territory = "";
    private String regionId = "";
    private String dateOpened = "";

    private double daySalesCy, daySalesLy, daySalesComp;
    private double wtdSalesCy, wtdSalesLy, wtdSalesComp;
    private double qtdSalesCy, qtdSalesLy, qtdSalesComp;
    private double ytdSalesCy, ytdSalesLy, ytdSalesComp;

    private boolean territoryTotal = false;
    private boolean grandTotal = false;

    /**
     * Convert to the same JSON shape the Node.js backend returns.
     * Keys are UPPER_SNAKE_CASE strings matching the frontend contract.
     */
    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("STORE_ID", storeId);
        map.put("STORE_NAME", storeName);
        map.put("TERRITORY", territory);
        map.put("REGION_ID", regionId);
        map.put("DATE_OPENED", dateOpened);
        map.put("DAY_SALES_CY", daySalesCy);
        map.put("DAY_SALES_LY", daySalesLy);
        map.put("DAY_SALES_COMP", daySalesComp);
        map.put("WTD_SALES_CY", wtdSalesCy);
        map.put("WTD_SALES_LY", wtdSalesLy);
        map.put("WTD_SALES_COMP", wtdSalesComp);
        map.put("QTD_SALES_CY", qtdSalesCy);
        map.put("QTD_SALES_LY", qtdSalesLy);
        map.put("QTD_SALES_COMP", qtdSalesComp);
        map.put("YTD_SALES_CY", ytdSalesCy);
        map.put("YTD_SALES_LY", ytdSalesLy);
        map.put("YTD_SALES_COMP", ytdSalesComp);
        map.put("IS_TERRITORY_TOTAL", territoryTotal);
        map.put("IS_GRAND_TOTAL", grandTotal);
        return map;
    }

    // ── Getters and Setters ──

    public String getStoreId() { return storeId; }
    public void setStoreId(String storeId) { this.storeId = storeId; }

    public String getStoreName() { return storeName; }
    public void setStoreName(String storeName) { this.storeName = storeName; }

    public String getTerritory() { return territory; }
    public void setTerritory(String territory) { this.territory = territory; }

    public String getRegionId() { return regionId; }
    public void setRegionId(String regionId) { this.regionId = regionId; }

    public String getDateOpened() { return dateOpened; }
    public void setDateOpened(String dateOpened) { this.dateOpened = dateOpened; }

    public double getDaySalesCy() { return daySalesCy; }
    public void setDaySalesCy(double v) { this.daySalesCy = v; }

    public double getDaySalesLy() { return daySalesLy; }
    public void setDaySalesLy(double v) { this.daySalesLy = v; }

    public double getDaySalesComp() { return daySalesComp; }
    public void setDaySalesComp(double v) { this.daySalesComp = v; }

    public double getWtdSalesCy() { return wtdSalesCy; }
    public void setWtdSalesCy(double v) { this.wtdSalesCy = v; }

    public double getWtdSalesLy() { return wtdSalesLy; }
    public void setWtdSalesLy(double v) { this.wtdSalesLy = v; }

    public double getWtdSalesComp() { return wtdSalesComp; }
    public void setWtdSalesComp(double v) { this.wtdSalesComp = v; }

    public double getQtdSalesCy() { return qtdSalesCy; }
    public void setQtdSalesCy(double v) { this.qtdSalesCy = v; }

    public double getQtdSalesLy() { return qtdSalesLy; }
    public void setQtdSalesLy(double v) { this.qtdSalesLy = v; }

    public double getQtdSalesComp() { return qtdSalesComp; }
    public void setQtdSalesComp(double v) { this.qtdSalesComp = v; }

    public double getYtdSalesCy() { return ytdSalesCy; }
    public void setYtdSalesCy(double v) { this.ytdSalesCy = v; }

    public double getYtdSalesLy() { return ytdSalesLy; }
    public void setYtdSalesLy(double v) { this.ytdSalesLy = v; }

    public double getYtdSalesComp() { return ytdSalesComp; }
    public void setYtdSalesComp(double v) { this.ytdSalesComp = v; }

    public boolean isTerritoryTotal() { return territoryTotal; }
    public void setTerritoryTotal(boolean v) { this.territoryTotal = v; }

    public boolean isGrandTotal() { return grandTotal; }
    public void setGrandTotal(boolean v) { this.grandTotal = v; }
}
