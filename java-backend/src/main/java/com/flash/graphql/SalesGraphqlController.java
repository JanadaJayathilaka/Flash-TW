package com.flash.graphql;

import com.flash.model.AnalyticsPayload;
import com.flash.service.SalesService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.stereotype.Controller;

/**
 * GraphQL controller for the salesAnalytics query.
 * Replaces the Node.js Apollo Server resolver.
 */
@Controller
public class SalesGraphqlController {
    private static final Logger log = LoggerFactory.getLogger(SalesGraphqlController.class);

    private final SalesService salesService;

    public SalesGraphqlController(SalesService salesService) {
        this.salesService = salesService;
    }

    @QueryMapping
    public AnalyticsPayload salesAnalytics(
            @Argument String startDate,
            @Argument String endDate,
            @Argument String mode,
            @Argument Integer smaPeriod) {

        log.info("[GraphQL] salesAnalytics: startDate={}, endDate={}, mode={}, smaPeriod={}",
                startDate, endDate, mode, smaPeriod);

        return salesService.getAnalyticsData(
                startDate, endDate, mode, smaPeriod != null ? smaPeriod : 7);
    }
}
