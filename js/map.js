// map.js — Leaflet + OpenStreetMap integration
"use strict";

const CATS = {
  hotel:   { label: "Lodging",         icon: "🛏" },
  transit: { label: "Transportation",  icon: "🚉" },
  safe:    { label: "Safe station",    icon: "🛡" },
  toilet:  { label: "Public restroom", icon: "🚻" },
};
const activeCats = new Set(Object.keys(CATS));
let userLatLng = null;
let map, userMarker, mapInitialized = false;
let markers = [];
let results = [];

// ---------- Map setup (Leaflet + OpenStreetMap public tile API) ----------
function initMapOnce() {
  if (mapInitialized) return;
  mapInitialized = true;

  map = L.map("resultsMap", { zoomControl: true, attributionControl: true })
    .setView([40.7128, -74.0060], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19,
  }).addTo(map);

  setTimeout(() => map.invalidateSize(), 200);

  document.getElementById('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const cat = chip.dataset.cat;
    if (activeCats.has(cat)) { activeCats.delete(cat); chip.classList.remove('active'); }
    else { activeCats.add(cat); chip.classList.add('active'); }
    renderBoard();
    renderMarkers();
  });

  document.getElementById('closeDetail').addEventListener('click', () => {
    document.getElementById('detailCard').classList.remove('show');
  });
}

function pinIcon(cat, isMe) {
  const cls = isMe ? "pin me" : `pin ${cat}`;
  const glyph = isMe ? "" : CATS[cat].icon;
  return L.divIcon({
    className: 'leaflet-div-icon',
    html: `<div class="${cls}"><span>${glyph}</span></div>`,
    iconSize: [26, 26], iconAnchor: [13, 26], popupAnchor: [0, -24]
  });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function fmtDist(m) { return m < 1000 ? { val: Math.round(m), unit: "m" } : { val: (m / 1000).toFixed(1), unit: "km" }; }
function walkMinutes(m) { return Math.max(1, Math.round(m / 80)); }
function setStatus(text, live) {
  document.getElementById('statusText').textContent = text;
  document.getElementById('statusDot').classList.toggle('off', !live);
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Destination search (Nominatim — free public geocoding API) ----------
async function goSearch(query) {
  setStatus("Searching destination…", true);
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
    const data = await resp.json();
    if (data.length === 0) { setStatus("That destination wasn't found.", false); return; }

    const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
    userLatLng = { lat, lng };
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([lat, lng], { icon: pinIcon(null, true) })
      .addTo(map)
      .bindPopup(query);
    map.setView([lat, lng], 15);
    fetchNearby(lat, lng);
  } catch (err) {
    console.error(err);
    setStatus("Error searching for destination.", false);
  }
}

// ---------- Nearby places (Overpass — free public OpenStreetMap data API) ----------
async function fetchNearby(lat, lng) {
  setStatus("Searching nearby places…", true);
  document.getElementById('board').innerHTML = `<div class="empty-state">Checking the map…</div>`;
  const radius = 1500;
  const query = `
    [out:json][timeout:25];
    (
      node["tourism"~"hotel|guest_house|hostel"](around:${radius},${lat},${lng});
      node["public_transport"="station"](around:${radius},${lat},${lng});
      node["railway"~"station|subway_entrance|tram_stop"](around:${radius},${lat},${lng});
      node["highway"="bus_stop"](around:${radius},${lat},${lng});
      node["amenity"="police"](around:${radius},${lat},${lng});
      node["amenity"="hospital"](around:${radius},${lat},${lng});
      node["amenity"="toilets"](around:${radius},${lat},${lng});
    );
    out body;
  `;
  try {
    const resp = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: "data=" + encodeURIComponent(query)
    });
    if (!resp.ok) throw new Error("overpass_error");
    const data = await resp.json();
    processResults(data.elements || [], lat, lng);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't load the map right now.", false);
    document.getElementById('board').innerHTML =
      `<div class="empty-state">We couldn't load nearby places. Check your connection and try again.</div>`;
  }
}

function classify(tags) {
  if (!tags) return null;
  if (tags.tourism && /hotel|guest_house|hostel/.test(tags.tourism)) return "hotel";
  if (tags.public_transport === "station") return "transit";
  if (tags.railway && /station|subway_entrance|tram_stop/.test(tags.railway)) return "transit";
  if (tags.highway === "bus_stop") return "transit";
  if (tags.amenity === "police" || tags.amenity === "hospital") return "safe";
  if (tags.amenity === "toilets") return "toilet";
  return null;
}

function processResults(elements, lat, lng) {
  results = [];
  elements.forEach(el => {
    const cat = classify(el.tags);
    if (!cat) return;
    const name = el.tags.name || (
      cat === "safe" && el.tags.amenity === "hospital" ? "Hospital" :
      cat === "safe" ? "Police station" :
      cat === "toilet" ? "Public restroom" :
      cat === "transit" ? "Transit stop / station" : "Lodging"
    );
    const dist = haversine(lat, lng, el.lat, el.lon);
    results.push({
      id: el.id, cat, name, lat: el.lat, lng: el.lon, dist,
      opening_hours: el.tags.opening_hours || null,
      address: [el.tags["addr:street"], el.tags["addr:housenumber"]].filter(Boolean).join(" ") || null
    });
  });
  results.sort((a, b) => a.dist - b.dist);
  setStatus(`${results.length} places found`, true);
  renderCounts();
  renderBoard();
  renderMarkers();
}

// ---------- Rendering ----------
function renderCounts() {
  Object.keys(CATS).forEach(cat => {
    document.getElementById(`count-${cat}`).textContent = results.filter(r => r.cat === cat).length;
  });
}

function renderBoard() {
  const board = document.getElementById('board');
  const visible = results.filter(r => activeCats.has(r.cat));
  document.getElementById('resultMeta').textContent = `${visible.length} of ${results.length}`;

  if (visible.length === 0) {
    board.innerHTML = `<div class="empty-state">No results for the selected categories within 1.5 km.</div>`;
    return;
  }

  board.innerHTML = visible.map(r => {
    const d = fmtDist(r.dist);
    return `<div class="row" data-id="${r.id}">
      <div class="row-bar ${r.cat}"></div>
      <div class="row-icon">${CATS[r.cat].icon}</div>
      <div class="row-main">
        <div class="row-name">${escapeHtml(r.name)}</div>
        <div class="row-sub">${CATS[r.cat].label} · ${walkMinutes(r.dist)} min walk</div>
      </div>
      <div class="row-dist">${d.val}<small>${d.unit}</small></div>
    </div>`;
  }).join("");

  board.querySelectorAll('.row').forEach(row => {
    row.addEventListener('click', () => {
      const item = results.find(r => r.id === Number(row.dataset.id));
      if (item) selectItem(item);
    });
  });
}

function renderMarkers() {
  markers.forEach(m => map.removeLayer(m.layer));
  markers = [];
  results.forEach(r => {
    if (!activeCats.has(r.cat)) return;
    const layer = L.marker([r.lat, r.lng], { icon: pinIcon(r.cat) }).addTo(map);
    layer.on('click', () => selectItem(r));
    markers.push({ layer, item: r });
  });
}

function selectItem(item) {
  document.querySelectorAll('.row').forEach(row =>
    row.classList.toggle('selected', Number(row.dataset.id) === item.id));
  map.panTo([item.lat, item.lng]);

  const card = document.getElementById('detailCard');
  document.getElementById('detailTag').textContent = CATS[item.cat].label;
  document.getElementById('detailName').textContent = item.name;
  const d = fmtDist(item.dist);
  const bits = [`${d.val}${d.unit} · ${walkMinutes(item.dist)} min walk`];
  if (item.address) bits.push(item.address);
  if (item.opening_hours) bits.push(`Hours: ${item.opening_hours}`);
  document.getElementById('detailMeta').textContent = bits.join(" · ");
  card.classList.add('show');

  document.getElementById('directionsBtn').onclick = () => {
    const origin = userLatLng ? `${userLatLng.lat},${userLatLng.lng}` : "";
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${item.lat},${item.lng}`, "_blank");
  };
}
