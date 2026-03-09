// ─────────────────────────────────────────────
// EXPRESS API SERVER
// Simple REST API for RewardsFindr mobile/web apps
// ─────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import searchRoutes from './routes/search.js';
import offersRoutes from './routes/offers.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
// Raised from default 100KB to 512KB to handle bank offers HTML payloads
app.use(express.json({ limit: '512kb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/search', searchRoutes);
app.use('/api/offers', offersRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 RewardsFindr API running on http://localhost:${PORT}`);
});
