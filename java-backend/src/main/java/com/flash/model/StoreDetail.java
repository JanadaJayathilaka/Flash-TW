package com.flash.model;

/**
 * Store detail record from SQL Server GetRegionStoreDetailAndCalendar SP.
 */
public record StoreDetail(
    String storeId,
    String storeName,
    String territory,
    String dateOpened,
    String regionId
) {}
