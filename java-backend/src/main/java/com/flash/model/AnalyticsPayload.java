package com.flash.model;

import java.util.List;

/**
 * GraphQL response type for salesAnalytics query.
 * Field names are PascalCase to match the existing Node.js/Apollo response shape.
 */
public record AnalyticsPayload(
    List<String> Labels,
    List<Double> Sales,
    List<Double> Sma
) {}
