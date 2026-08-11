// navigation.js — screen switching (splash -> setup -> results)
"use strict";

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// Splash -> Setup
// Bug fix: the CSS fadeOut animation on #splash starts at 2.05s and takes
// .5s to finish, but the screen swap used to happen at the same 2050ms
// mark — so #splash was set to display:none the instant the fade began,
// and the "smooth transition" never actually got to play. We now wait
// for the animation to finish (via `animationend`) before swapping
// screens, with a timeout fallback in case the event doesn't fire
// (e.g. the tab was backgrounded, or reduced-motion disabled the
// animation entirely).
const splash = document.getElementById('splash');
let splashDone = false;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function goToSetup() {
  if (splashDone) return;
  splashDone = true;
  showScreen('setup');
}

splash.addEventListener('animationend', (e) => {
  if (e.target === splash && e.animationName === 'fadeOut') goToSetup();
});

// Fallback in case the animation never fires, and the baseline timing
// for reduced-motion users (who see no fade animation at all).
setTimeout(goToSetup, prefersReducedMotion ? 900 : 2600);

// Tap anywhere on the splash to skip it immediately.
splash.addEventListener('click', goToSetup);

document.getElementById('backBtn').addEventListener('click', () => showScreen('setup'));
