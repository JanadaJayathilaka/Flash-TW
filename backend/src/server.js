require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');

const {
  getLatestDate,
  getStoreDetailsAndCalendar,
  getAvailableDates,
  getSalesPivotSum,
  getAnalyticsData,
} = require('./routes/sales');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Disable caching for all API responses
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GraphQL schema
const typeDefs = `#graphql
  type Store {
    Store_ID: String!
    ASGS_NAME: String
    Store_Name: String
    Date_Opened: String
    Region_ID: String
  }

  type FiscalCalendarDay {
    FiscalDate: String!
    FiscalYear: String
    WeekInYear: String
    DayInWeek: String
    DayInYear: String
    CalQuarter: String
  }

  type CurrencyRate {
    CDate: String!
    AuDEquiv: String
  }

  type StoreDetailsPayload {
    SubClass: [Store!]!
    FiscalCalendar: [FiscalCalendarDay!]!
    Currency_Cal: [CurrencyRate!]!
  }

  type SalesPivotRow {
    STORE_ID: String!
    STORE_NAME: String
    TERRITORY: String
    REGION_ID: String
    DATE_OPENED: String
    DAY_SALES_CY: Float
    DAY_SALES_LY: Float
    DAY_SALES_COMP: Float
    WTD_SALES_CY: Float
    WTD_SALES_LY: Float
    WTD_SALES_COMP: Float
    QTD_SALES_CY: Float
    QTD_SALES_LY: Float
    QTD_SALES_COMP: Float
    YTD_SALES_CY: Float
    YTD_SALES_LY: Float
    YTD_SALES_COMP: Float
    IS_TERRITORY_TOTAL: Boolean
    IS_GRAND_TOTAL: Boolean
  }

  type SalesPivotSumPayload {
    PivotData: [SalesPivotRow!]!
    TotalCount: Int!
  }

  type AnalyticsPayload {
    Labels: [String!]!
    Sales: [Float!]!
    Sma: [Float]!
  }

  type Query {
    latestDate: String
    availableDates: [String!]!
    storeDetails: StoreDetailsPayload!
    salesPivotSum(
      DT_1: String!
      DT_2: String!
      P_WTD_1_S: String!
      P_WTD_1_E: String!
      P_WTD_2_S: String!
      P_WTD_2_E: String!
      P_QTD_1_S: String!
      P_QTD_1_E: String!
      P_QTD_2_S: String!
      P_QTD_2_E: String!
      P_YTD_1_S: String!
      P_YTD_1_E: String!
      P_YTD_2_S: String!
      P_YTD_2_E: String!
    ): SalesPivotSumPayload!
    salesAnalytics(
      startDate: String!
      endDate: String!
      mode: String!
      smaPeriod: Int
    ): AnalyticsPayload!
  }
`;

// GraphQL resolvers
const resolvers = {
  Query: {
    latestDate: async () => {
      console.log('[GraphQL] Query latestDate');
      return await getLatestDate();
    },
    availableDates: async () => {
      console.log('[GraphQL] Query availableDates');
      return await getAvailableDates();
    },
    storeDetails: async () => {
      console.log('[GraphQL] Query storeDetails');
      return await getStoreDetailsAndCalendar();
    },
    salesPivotSum: async (_, args) => {
      console.log('[GraphQL] Query salesPivotSum:', args.DT_1, args.DT_2);
      return await getSalesPivotSum(args);
    },
    salesAnalytics: async (_, { startDate, endDate, mode, smaPeriod }) => {
      console.log(`[GraphQL] salesAnalytics Query: startDate=${startDate}, endDate=${endDate}, mode=${mode}, smaPeriod=${smaPeriod}`);
      return await getAnalyticsData(startDate, endDate, mode, smaPeriod || 7);
    },
  },
};

async function startServer() {
  const apolloServer = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await apolloServer.start();

  // Mount Apollo middleware at /graphql
  app.use('/graphql', expressMiddleware(apolloServer));

  app.listen(PORT, () => {
    console.log(`Flash Sales API running on port ${PORT}`);
    console.log(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
