require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const vesselRoutes = require('./routes/vessels');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check — visit your Replit URL to confirm it's running
app.get('/', (req, res) => {
  res.json({
    status: 'AMC Engine Log API running',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Routes
app.use('/api/auth',    authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/logs',    logRoutes);
app.use('/api/admin',   adminRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Server error', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AMC Engine Log server running on port ${PORT}`);
});
