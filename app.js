// ---------------- CONFIG ----------------
const API = {
  bins: "http://localhost:3000/api/bins",
  schedules: "http://localhost:3000/api/schedules",
  settings: "http://localhost:3000/api/settings",
};

const MAX_CAPACITY_KG = 25; // keep consistent with backend
let map, markers = {}, chart;
let currentSettings = { criticalFillPercent: 80, refreshSeconds: 30 };
let refreshTimer;

// ---------------- HELPERS ----------------
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

function getPercent(bin) {
  return Math.min(100, Math.round((bin.weight / MAX_CAPACITY_KG) * 100));
}
function getColor(p) { return p >= 80 ? "red" : p >= 50 ? "orange" : "green"; }

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Network error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("Fetch failed:", url, err);
    if (url.includes("/bins") || url.includes("/schedules")) return [];
    return {};
  }
}

// ---------------- SECTION HANDLER ----------------
function showSection(id, el) {
  $all("section").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  $all(".sidebar button").forEach(b => b.classList.remove("active"));
  el.classList.add("active");

  if (id === "map") refreshMap();
  if (id === "route") planRoute();
  if (id === "analytics") loadAnalytics();
  if (id === "schedule") loadSchedules();
}

// ---------------- DASHBOARD KPIs ----------------
async function loadKpis() {
  const bins = await safeFetch(API.bins);
  if (!bins.length) return;

  const total = bins.length;
  const avg = Math.round(bins.reduce((s, b) => s + getPercent(b), 0) / Math.max(1, total));
  const critical = bins.filter(b => getPercent(b) >= currentSettings.criticalFillPercent).length;

  const schedules = await safeFetch(API.schedules);
  const next = schedules.find(s => s.status !== "completed");

  $("#kpiTotal").innerText = total;
  $("#kpiAvg").innerText = avg + "%";
  $("#kpiCritical").innerText = critical;
  $("#kpiNext").innerText = next ? `${next.binId} • ${next.date} ${next.window}` : "—";
}

// ---------------- MAP ----------------
function initMap() {
  if (map) return;
  map = L.map("mapEl").setView([11.03, 78.03], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
}

async function refreshMap() {
  initMap();

  // force resize in case section was hidden
  setTimeout(() => { map.invalidateSize(); }, 200);

  const bins = await fetch(API.bins).then(r => r.json());
  bins.forEach(bin => {
    const p = getPercent(bin), color = getColor(p);
    if (markers[bin.id]) {
      markers[bin.id].setLatLng([bin.lat, bin.lng]);
      markers[bin.id].setStyle({ color, fillColor: color });
      markers[bin.id].bindPopup(
        `<b>${bin.id}</b><br>Weight: ${bin.weight} kg<br>Fill: ${p}%`
      );
    } else {
      const m = L.circleMarker([bin.lat, bin.lng], {
        radius: 10, color, fillColor: color, fillOpacity: 0.9
      }).addTo(map);
      m.bindPopup(
        `<b>${bin.id}</b><br>Weight: ${bin.weight} kg<br>Fill: ${p}%`
      );
      markers[bin.id] = m;
    }
  });
}

// ---------------- ROUTE PLANNING ----------------
async function planRoute() {
  const bins = await safeFetch(API.bins);
  if (!bins.length) return;

  const threshold = Number(document.getElementById("routeThreshold").value || 80);
  const selected = bins.filter(b => getPercent(b) >= threshold);
  const depot = { id: "DEPOT", lat: 11.0305, lng: 78.0305 };

  let current = depot;
  const unvisited = [...selected];
  const order = ["DEPOT"];
  let totalDist = 0;
  const d = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);

  while (unvisited.length) {
    unvisited.sort((a, b) => d(current, a) - d(current, b));
    const next = unvisited.shift();
    totalDist += d(current, next);
    order.push(next.id);
    current = next;
  }

  totalDist += d(current, depot);
  order.push("DEPOT");

  document.getElementById("routeOutput").textContent =
    `Planned Route (≥${threshold}%):\n` +
    order.join(" → ") +
    `\nTotal Distance (approx): ${totalDist.toFixed(3)} units`;
}

// ---------------- SCHEDULES ----------------
async function loadSchedules() {
  const tbody = document.querySelector("#scheduleTable tbody");
  tbody.innerHTML = "";
  const rows = await safeFetch(API.schedules);
  if (!rows.length) return;

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.id}</td>
      <td>${r.binId}</td>
      <td>${r.date}</td>
      <td>${r.window}</td>
      <td>${r.status}</td>
      <td>${
        r.status !== "completed"
          ? `<button data-id="${r.id}" class="complete">Complete</button>`
          : "—"
      }</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button.complete").forEach(btn =>
    btn.addEventListener("click", async (e) => {
      const id = e.target.getAttribute("data-id");
      await fetch(`${API.schedules}/${id}/complete`, { method: "POST" });
      loadSchedules();
      loadKpis();
      refreshMap();
    })
  );
}

// ---------------- ANALYTICS ----------------
async function loadAnalytics() {
  const bins = await safeFetch(API.bins);
  if (!bins.length) return;

  const labels = bins.map(b => b.id);
  const data = bins.map(b => getPercent(b));
  const ctx = document.getElementById("binChart");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "Bin Fill Level (%)", data, backgroundColor: "#2b7cff" }] },
    options: { scales: { y: { beginAtZero: true, max: 100 } } }
  });
}

// ---------------- SETTINGS ----------------
async function initSettings() {
  const s = await safeFetch(API.settings);
  if (!s) return;
  currentSettings = s;
  const form = document.getElementById("settingsForm");

  form.criticalFillPercent.value = s.criticalFillPercent;
  form.refreshSeconds.value = s.refreshSeconds;
  form.theme.value = s.theme || "light";

  document.documentElement.setAttribute("data-theme", s.theme || "light");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      criticalFillPercent: Number(form.criticalFillPercent.value),
      refreshSeconds: Number(form.refreshSeconds.value),
      theme: form.theme.value,
    };
    const updated = await fetch(API.settings, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    currentSettings = updated;
    document.documentElement.setAttribute("data-theme", updated.theme);
    loadKpis();
    startAutoRefresh(); // restart with new refresh interval
  });
}

// ---------------- AUTO REFRESH ----------------
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(async () => {
    await loadKpis();
    await refreshMap();
    if ($("#analytics").classList.contains("active")) loadAnalytics();
  }, currentSettings.refreshSeconds * 1000);
}

// ---------------- INIT ----------------
window.addEventListener("DOMContentLoaded", async () => {
  await initSettings();
  await loadKpis();
  refreshMap();
  loadSchedules();
  // Don't load analytics here → only load when analytics tab is active
  document.getElementById("btnPlan").addEventListener("click", planRoute);
  startAutoRefresh();
});
