require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// ── Health check ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'hiddenatlas-api' });
});

// ── Routes ────────────────────────────────────────────────────
app.use('/api/itineraries',    require('./routes/itineraries'));
app.use('/api/purchase',       require('./routes/purchase'));
app.use('/api/custom-request', require('./routes/customRequest'));
app.use('/api/my-trips',       require('./routes/myTrips'));

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
