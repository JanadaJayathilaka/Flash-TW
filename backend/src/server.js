require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');

const salesRoutes = require('./routes/sales');
const { getAnalyticsData } = require('./routes/sales');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use('/api/sales', salesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GraphQL schema
const typeDefs = `#graphql
  type AnalyticsPayload {
    Labels: [String!]!
    Sales: [Float!]!
    Sma: [Float]!
  }

  type Query {
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
    salesAnalytics: async (_, { startDate, endDate, mode, smaPeriod }) => {
      console.log(`[GraphQL] salesAnalytics Query: startDate=${startDate}, endDate=${endDate}, mode=${mode}, smaPeriod=${smaPeriod}`);
      return await getAnalyticsData(startDate, endDate, mode, smaPeriod || 7);
    }
  }
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

startServer().catch(err => {
  console.error('Failed to start server:', err);
});

