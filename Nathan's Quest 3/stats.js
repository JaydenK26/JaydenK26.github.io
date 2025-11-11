/* ===== Stats screen wired to DB (with local fallback) ===== */

/* --- API endpoints (adjust paths if needed) --- */
const API_GET_STATS = 'https://csunix.mohawkcollege.ca/~sa000854737/stats_get.php';
const API_SET_STATS = 'https://csunix.mohawkcollege.ca/~sa000854737/stats_update.php';

/* --- Local cache fallback key --- */
const STATS_KEY = 'rpg_stats_v1';

/* --- UI state --- */
const state = {
  role: 'player',                // 'player' | 'cheater'
  pointsLeft: 5,                 // only enforced in UI; server stores only stats
  stats: { health: 10, strength: 10, skill: 10, mana: 10 }
};

/* --- DOM refs --- */
const panel          = document.getElementById('statsPanel');
const openBtn        = document.getElementById('openPanel');
const pointsLeftEl   = document.getElementById('pointsLeft');
const cheaterToggle  = document.getElementById('cheaterToggle');

/* ---------- Helpers ---------- */
async function fetchStatsOrLocal() {
  try {
    const res = await fetch(API_GET_STATS, { credentials: 'include' });
    const data = await res.json();
    if (res.ok && data.ok && data.stats) {
      // normalize numbers
      const s = {
        health:   Number(data.stats.health ?? 10),
        strength: Number(data.stats.strength ?? 10),
        skill:    Number(data.stats.skill ?? 10),
        mana:     Number(data.stats.mana ?? 10)
      };
      localStorage.setItem(STATS_KEY, JSON.stringify(s)); // cache
      return s;
    }
  } catch (e) {
    // ignore -> fallback to local
  }
  try { return JSON.parse(localStorage.getItem(STATS_KEY) || 'null'); }
  catch { return null; }
}

async function pushStatsToServer(statsObj){
  try {
    const res = await fetch(API_SET_STATS, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      credentials: 'include',
      body: JSON.stringify(statsObj)
    });
    const data = await res.json();
    return res.ok && data.ok;
  } catch {
    return false;
  }
}

/* ----- Open / close panel ----- */
openBtn?.addEventListener('click', () => {
  const open = panel.getAttribute('data-open') === 'true';
  panel.setAttribute('data-open', String(!open));
  openBtn.setAttribute('aria-expanded', String(!open));
});

/* ----- Cheater toggle (demo) ----- */
cheaterToggle?.addEventListener('change', (e) => {
  state.role = e.target.checked ? 'cheater' : 'player';
  render();
});

/* ----- Wire up “+” buttons ----- */
document.querySelectorAll('[data-add]').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const row = e.currentTarget.closest('.stat-row');
    const key = row.getAttribute('data-key');
    if (!key) return;

    if (state.role !== 'cheater' && state.pointsLeft <= 0) return;

    state.stats[key] = Number(state.stats[key] || 0) + 1;
    if (state.role !== 'cheater') state.pointsLeft -= 1;

    // Optimistic render
    render();

    // Try server; fallback to local cache
    const ok = await pushStatsToServer(state.stats);
    if (!ok) {
      localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
    } else {
      // also keep local cache in sync for battle fallback
      localStorage.setItem(STATS_KEY, JSON.stringify(state.stats));
    }
  });
});

/* ----- Initial boot ----- */
(async function init() {
  const serverStats = await fetchStatsOrLocal();
  if (serverStats) state.stats = serverStats;
  render();
})();

/* ----- Render ----- */
function render(){
  // Update stat numbers
  document.querySelectorAll('.stat-row').forEach(row => {
    const key = row.getAttribute('data-key');
    row.querySelector('[data-value]').textContent = state.stats[key];

    // Show + only when points remain (unless cheater)
    const add = row.querySelector('[data-add]');
    const shouldShow = state.role === 'cheater' || state.pointsLeft > 0;
    add.hidden   = !shouldShow;
    add.disabled = !shouldShow;
  });

  // Points remaining (cheater sees 99,999,999)
  const shownPoints = state.role === 'cheater' ? 99999999 : state.pointsLeft;
  pointsLeftEl.textContent = shownPoints.toLocaleString();
}
