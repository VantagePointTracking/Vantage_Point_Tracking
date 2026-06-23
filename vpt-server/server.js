require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const vesselRoutes = require('./routes/vessels');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');
const maintenanceRoutes = require('./routes/maintenance');
const fleetRoutes = require('./routes/fleet');
const tripsRoutes = require('./routes/trips');
const aiRoutes = require('./routes/ai');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/vessels', vesselRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/fleet', fleetRoutes);
app.use('/api/trips', tripsRoutes);
app.use('/api/ai', aiRoutes);

app.get(['/','/api', '/app', '/login'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
