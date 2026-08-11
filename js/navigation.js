// navigation.js — screen switching (splash -> setup -> results)
"use strict";

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Splash -> Setup (auto after the badge animation, or tap to skip)
const splash = document.getElementById('splash');
let splashDone = false;
function goToSetup() {
  if (splashDone) return;
  splashDone = true;
  showScreen('setup');
}
setTimeout(goToSetup, 2050);
splash.addEventListener('click', goToSetup);

document.getElementById('backBtn').addEventListener('click', () => showScreen('setup'));
