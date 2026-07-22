// setup.js — trip form: destination, dates, transport, and "Start Trip"
"use strict";

let selectedTransport = null;
const destinationInput = document.getElementById('destinationInput');
const departureInput = document.getElementById('departureInput');
const arrivalInput = document.getElementById('arrivalInput');
const startBtn = document.getElementById('startTripBtn');
const hintText = document.querySelector('.hint-text');

document.getElementById('transportList').addEventListener('click', (e) => {
  const opt = e.target.closest('.transport-opt');
  if (!opt) return;
  document.querySelectorAll('.transport-opt').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  selectedTransport = opt.dataset.t;
});

document.getElementById('swapBtn').addEventListener('click', () => {
  const tmp = departureInput.value;
  departureInput.value = arrivalInput.value;
  arrivalInput.value = tmp;
});

function validateForm() {
  const ok = destinationInput.value.trim().length > 0;
  startBtn.disabled = !ok;
  hintText.textContent = ok
    ? "All set — start your trip whenever you're ready"
    : "Enter your destination to get started";
}
destinationInput.addEventListener('input', validateForm);

document.getElementById('startTripBtn').addEventListener('click', () => {
  const dest = destinationInput.value.trim();
  if (!dest) return;

  let subtitle = dest;
  if (departureInput.value && arrivalInput.value) {
    subtitle = `${dest} · ${departureInput.value} → ${arrivalInput.value}`;
  } else if (departureInput.value) {
    subtitle = `${dest} · from ${departureInput.value}`;
  }
  document.getElementById('resultsSubtitle').textContent = subtitle;

  showScreen('results');   // from navigation.js
  initMapOnce();           // from map.js
  goSearch(dest);          // from map.js
});
