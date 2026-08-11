// map.js — Leaflet + Geoapify integration
"use strict";

// The Geoapify key used to be hardcoded here and shipped straight to every
// visitor's browser (anyone could open devtools and lift it). Requests now
// go through same-origin serverless proxies (/api/geocode, /api/places) so
// the real key only ever lives server-side, in Vercel's environment
// variables. See /api/geocode.js and /api/places.js.
const GEOCODE_ENDPOINT = "/api/geocode";
const PLACES_ENDPOINT = "/api/places";

const CATS = {
  hotel:   { label: "Lodging",          icon: "🛏" },
  transit: { label: "Transportation",   icon: "🚉" },
  safe:    { label: "Safe station",     icon: "🛡" },
  toilet:  { label: "Public restroom",  icon: "🚻" },
};

// Maps our own categories to Geoapify Places API categories
const GEOAPIFY_CATEGORIES = {
  hotel:   "accommodation.hotel,accommodation.hostel,accommodation.guest_house",
  transit: "public_transport",
  safe:    "service.police,healthcare.hospital",
  toilet:  "amenity.toilet",
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

  function toggleChip(chip) {
    const cat = chip.dataset.cat;
    if (activeCats.has(cat)) {
      activeCats.delete(cat);
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    } else {
      activeCats.add(cat);
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    }
    renderBoard();
    renderMarkers();
  }

  document.getElementById('chips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) toggleChip(chip);
  });

  // Keyboard support: chips are role="button" divs, so Enter/Space need
  // manual wiring for a11y (native <button> elements would get this free).
  document.getElementById('chips').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const chip = e.target.closest('.chip');
    if (!chip) return;
    e.preventDefault();
    toggleChip(chip);
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

// ---------- Destination search (via /api/geocode proxy) ----------
async function goSearch(query) {
  if (!query || !query.trim()) return;
  setStatus("Searching destination…", true);
  try {
    const url = `${GEOCODE_ENDPOINT}?text=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.results || data.results.length === 0) { setStatus("That destination wasn't found.", false); return; }

    const lat = data.results[0].lat, lng = data.results[0].lon;
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

// ---------- Nearby places (via /api/places proxy) ----------
async function fetchNearby(lat, lng) {
  setStatus("Searching nearby places…", true);
  document.getElementById('board').innerHTML = `<div class="empty-state">Checking the map…</div>`;
  const radius = 1500;
  const categories = Object.values(GEOAPIFY_CATEGORIES).join(",");
  const url = `${PLACES_ENDPOINT}?categories=${encodeURIComponent(categories)}` +
              `&lat=${lat}&lng=${lng}&radius=${radius}&limit=100`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    processResults(data.features || [], lat, lng);
  } catch (err) {
    console.error(err);
    setStatus("Couldn't load the map right now.", false);
    document.getElementById('board').innerHTML =
      `<div class="empty-state">We couldn't load nearby places. Check your connection and try again.</div>`;
  }
}

function classify(categories) {
  if (!categories || !categories.length) return null;
  if (categories.some(c => c.startsWith("accommodation"))) return "hotel";
  if (categories.some(c => c.startsWith("public_transport"))) return "transit";
  if (categories.some(c => c === "service.police" || c.startsWith("healthcare.hospital"))) return "safe";
  if (categories.some(c => c.startsWith("amenity.toilet"))) return "toilet";
  return null;
}

function processResults(features, lat, lng) {
  results = [];
  features.forEach(f => {
    const p = f.properties;
    const cats = p.categories || [];
    const cat = classify(cats);
    if (!cat) return;

    const name = p.name || (
      cat === "safe" && cats.some(c => c.startsWith("healthcare.hospital")) ? "Hospital" :
      cat === "safe" ? "Police station" :
      cat === "toilet" ? "Public restroom" :
      cat === "transit" ? "Transit stop / station" : "Lodging"
    );

    const flat = p.lat, flng = p.lon;
    const dist = haversine(lat, lng, flat, flng);
    results.push({
      id: p.place_id || `${flat},${flng},${name}`,
      cat, name, lat: flat, lng: flng, dist,
      opening_hours: p.opening_hours || null,
      address: p.address_line2 || p.address_line1 || null
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
    return `<div class="row" data-id="${r.id}" role="button" tabindex="0" aria-label="${escapeHtml(r.name)}, ${CATS[r.cat].label}, ${walkMinutes(r.dist)} min walk">
      <div class="row-bar ${r.cat}"></div>
      <div class="row-icon" aria-hidden="true">${CATS[r.cat].icon}</div>
      <div class="row-main">
        <div class="row-name">${escapeHtml(r.name)}</div>
        <div class="row-sub">${CATS[r.cat].label} · ${walkMinutes(r.dist)} min walk</div>
      </div>
      <div class="row-dist">${d.val}<small>${d.unit}</small></div>
    </div>`;
  }).join("");

  board.querySelectorAll('.row').forEach(row => {
    row.addEventListener('click', () => {
      const item = results.find(r => String(r.id) === row.dataset.id);
      if (item) selectItem(item);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const item = results.find(r => String(r.id) === row.dataset.id);
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
    row.classList.toggle('selected', row.dataset.id === String(item.id)));
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
