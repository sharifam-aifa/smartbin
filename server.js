// ---------------- SmartWaste Backend ----------------
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serve frontend

// ---- In-memory demo data ----
const MAX_CAPACITY_KG = 25;

let settings = {
  depot: { lat: 11.0305, lng: 78.0305 },
  criticalFillPercent: 80,
  refreshSeconds: 30,
  theme: "light",
};

// dynamic schedule date (today)
const today = new Date().toISOString().slice(0, 10);

let bins = [
  { id: "Bin-1", lat: 11.030, lng: 78.030, weight: 5 },
  { id: "Bin-2", lat: 11.032, lng: 78.033, weight: 12 },
  { id: "Bin-3", lat: 11.028, lng: 78.028, weight: 20 },
  { id: "Bin-4", lat: 11.035, lng: 78.035, weight: 8 },
  { id: "Bin-5", lat: 11.027, lng: 78.032, weight: 3 },
];

let schedules = [
  { id: "SCH-1001", binId: "Bin-3", window: "09:00–11:00", date: today, status: "scheduled" },
  { id: "SCH-1002", binId: "Bin-2", window: "11:00–13:00", date: today, status: "scheduled" },
  { id: "SCH-1003", binId: "Bin-4", window: "14:00–16:00", date: today, status: "scheduled" },
];

// ---- Helper: distance (for future route logic) ----
const dist = (a, b) => {
  const dx = a.lat - b.lat;
  const dy = a.lng - b.lng;
  return Math.sqrt(dx * dx + dy * dy);
};

// ---------------- API ENDPOINTS ----------------

// Get all bins
app.get("/api/bins", (req, res) => {
  res.json(bins);
});

// Update a bin (weight, lat, lng)
app.post("/api/bins/:id", (req, res) => {
  const { id } = req.params;
  const { weight, lat, lng } = req.body || {};
  const bin = bins.find(b => b.id === id);
  if (!bin) return res.status(404).json({ error: "Bin not found" });

  if (typeof weight === "number") bin.weight = Math.max(0, Math.min(MAX_CAPACITY_KG, weight));
  if (typeof lat === "number") bin.lat = lat;
  if (typeof lng === "number") bin.lng = lng;

  res.json(bin);
});

// Get all schedules
app.get("/api/schedules", (req, res) => {
  res.json(schedules);
});

// Mark a schedule as completed
app.post("/api/schedules/:id/complete", (req, res) => {
  const { id } = req.params;
  const s = schedules.find(x => x.id === id);
  if (!s) return res.status(404).json({ error: "Schedule not found" });

  s.status = "completed";

  // Reset bin weight (simulate emptying)
  const bin = bins.find(b => b.id === s.binId);
  if (bin) bin.weight = 0;

  res.json(s);
});

// Get settings
app.get("/api/settings", (req, res) => {
  res.json(settings);
});

// Update settings
app.post("/api/settings", (req, res) => {
  const { depot, criticalFillPercent, refreshSeconds, theme } = req.body || {};

  if (depot && typeof depot.lat === "number" && typeof depot.lng === "number")
    settings.depot = depot;

  if (typeof criticalFillPercent === "number")
    settings.criticalFillPercent = Math.max(0, Math.min(100, criticalFillPercent));

  if (typeof refreshSeconds === "number")
    settings.refreshSeconds = Math.max(5, refreshSeconds);

  if (theme === "light" || theme === "dark")
    settings.theme = theme;

  res.json(settings);
});

// ---------------- SENSOR SIMULATION ----------------
// Simulate bins gradually filling every 30 seconds
setInterval(() => {
  bins = bins.map(b => {
    // 50% chance to increase weight slightly
    const add = Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 3);
    return { ...b, weight: Math.min(MAX_CAPACITY_KG, b.weight + add) };
  });
  console.log(`[SIM] Updated bin weights at ${new Date().toLocaleTimeString()}`);
}, 30000);

// ---------------- START SERVER ----------------
app.listen(PORT, () => {
  console.log(`✅ SmartWaste backend running at http://localhost:${PORT}`);
});
