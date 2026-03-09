require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { clerkMiddleware } = require('@clerk/express');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Clerk: parses the Authorization header on every request and
// attaches req.auth (may be null for unauthenticated requests).
// Individual routes enforce auth with requireAuth().
app.use(clerkMiddleware());

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hiddenatlas-api' });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/itineraries',   require('./routes/itineraries'));
app.use('/api/purchase',      require('./routes/purchase'));
app.use('/api/custom-request', require('./routes/customRequest'));
app.use('/api/my-trips',      require('./routes/myTrips'));

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
