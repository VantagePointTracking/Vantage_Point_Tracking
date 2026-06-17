require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require('./routes/auth');
const vesselRoutes = require('./routes/vessels');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');
const maintenanceRoutes = require('./routes/maintenance');
const fleetRoutes = require('./routes/fleet');

const app = express();
app.use('/api/fleet', fleetRoutes);

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/vessels", vesselRoutes);
app.use("/api/logs", logRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/maintenance', maintenanceRoutes);

// Serve index.html at root and /api
app.get(["/", "/api", "/api/", "/app", "/login"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/office", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Server error", message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AMC Engine Log server running on port ${PORT}`);
});
