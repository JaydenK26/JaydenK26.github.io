// ========= tiny helpers =========
const qs  = (sel, root=document) => root.querySelector(sel);
const qsa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function writeLog(msg){
  const active = qs('.screen.is-active');
  const log = active && qs('.log', active);
  if (log) log.textContent = msg;
}

function showScreen(id){
  qsa('.screen').forEach(s => s.classList.toggle('is-active', s.id === id));
}

/* ---------------------------------------------------------
   WORLD DATA (your original image-based LOCATIONS)
--------------------------------------------------------- */
const LOCATIONS = [ 
  {
    id: 'grass',
    name: 'Grasslands',
    enterText: 'The scenary brings back a certain nolstalga',
    tiles: [
      { title: 'Grasslands', img: 'grasslands.jpg', imgAlt: 'Waving grass', fit: 'cover' },
      { title: 'Forked Path', img: 'forked.jpg', imgAlt: 'Waving grass', fit: 'cover' },
    ],
    actions: [
      { id:'pick-berries', label:'Dance', log:'You hit a jig!.' },
      { id:'follow-birds', label:'Cry about missing hoodie', log:'You sob about the loss of your favorite hoodie.' },
    ],
    neighbors: ['park','grand']
  },
  {
    id: 'park',
    name: 'Public Park',
    enterText: 'The sound of playing children angers you.',
    tiles: [
      { title: 'Public Park', img: 'park.jpg', imgAlt: 'Waving grass', fit: 'cover' },
      { title: 'Children', img: 'kids.jpg', imgAlt: 'Waving grass', fit: 'cover' }
    ],
    actions: [
      { id:'scan-horizon', label:'Roast Children', log:'Yo mama so fat she takes up 17 seats on the bus!. The children sob' },
      { id:'rest',         label:'Chew on the monkey bars', log:'Why???' },
    ],
    neighbors: ['mcd','grass']
  },
  {
    id: 'mcd',
    name: 'McDonalds',
    enterText: 'The sound of beeping and despair haunt your ear drums.',
    tiles: [
      { title: 'Mcdonalds', img: 'mcdonalds.jpg', imgAlt: 'Waving grass', fit: 'cover' },
      { title: 'Employee', img: 'employeeMc.jpg', imgAlt: 'Waving grass', fit: 'cover' }
    ],
    actions: [
      { type:'interact', id:'talk-trader', label:'Talk with Trader', npcId:'trader', log:'You approach the trader.' },
      { id:'listen', label:'Order a number 9 large', log:'You now weigh 5 pounds extra' },
    ],
    neighbors: ['park','village']
  },
  {
    id: 'grand',
    name: 'Grandmas House',
    enterText: 'A crooked door and sagging roof greet you.',
    tiles: [
      { title: 'Grandmas House', img: 'grandmasHouse.jpg', imgAlt: 'Waving grass', fit: 'cover' },
      { title: 'Grandma', img: 'grandma.jpg', imgAlt: 'Waving grass', fit: 'cover' }
    ],
    actions: [
      { id:'knock-door',  label:'Look at Grandma',  log:'Grandma pulls out the belt and whips you.' },
      { id:'peek-window', label:'Ask Grandma for cookies', log:'Grandma throws the cookies at you like shuriken.' },
    ],
    neighbors: ['grass','village']
  },
  {
    id: 'village',
    name: 'River of Spite',
    enterText: 'The River glares at you.',
    tiles: [
      { title: 'River of Spite', img: 'riverSpite.jpg', imgAlt: 'Waving grass', fit: 'cover' },
      { title: 'River of Pollution', img: 'riverSpitePol.jpg', imgAlt: 'Waving grass', fit: 'cover' },
    ],
    actions: [
      { id:'talk-elder', label:'Glare back', log:'The River splashes water at you'},
      { id:'buy-bread',  label:'Pollute the River', log:'The river turns green and cries.' },
      { type:'interact', id:'talk-trader', label:'Talk with Trader', npcId:'trader', log:'You approach the trader.' }
    ],
    neighbors: ['grand','mcd']
  },
];

/* ---------------------------------------------------------
   Boss mapping: which boss per location (customize freely)
   - Grasslands  -> Egg Sage
   - McDonalds   -> The Creator
   - River of Spite -> The Pope
--------------------------------------------------------- */
const BOSS_BY_LOCATION = {
  grass:   'Egg Sage',
  mcd:     'The Creator',
  village: 'The Pope',
};

/* ---------------------------------------------------------
   Add "Enter Combat" to EVERY location
   Add "Fight Boss" ONLY to grass, mcd, village
--------------------------------------------------------- */
LOCATIONS.forEach(loc => {
  const base = loc.actions || [];

  // Always add "Enter Combat" (random enemy, biome-aware)
  base.push({
    id: 'enter-combat',
    label: 'Enter Combat',
    type: 'go',
    href: 'battle.html',
    log: 'You brace for combat…'
  });

  // Boss option (only on specific locations)
  if (BOSS_BY_LOCATION[loc.id]) {
    const bossName = BOSS_BY_LOCATION[loc.id];
    base.push({
      id: 'fight-boss',
      label: 'Fight Boss',
      type: 'go',
      // battle reads ?from=<loc>&boss=<enemy name>
      href: `battle.html?boss=${encodeURIComponent(bossName)}`,
      log: `You challenge ${bossName}!`
    });
  }

  loc.actions = base;
});

let currentId = 'grass';       // starting location
const navStack = [];           // for Back navigation

/* ---------------------------------------------------------
   Tile factory (image-based with alt + object-fit)
--------------------------------------------------------- */
function makeTile({ title, img=null, imgAlt='', fit='contain', gotoId=null }){
  const art = document.createElement('article');
  art.className = 'tile';
  if (gotoId){
    art.tabIndex = 0;
    art.setAttribute('data-goto', gotoId);
    art.setAttribute('aria-label', `Travel to ${title}`);
  }
  const canvasInner = img
    ? `<img class="tile__img" src="${img}" alt="${imgAlt || title}" style="object-fit:${fit};" />`
    : `<div class="placeholder">?</div>`;

  art.innerHTML = `
    <h2 class="tile__title">${title}</h2>
    <div class="tile__canvas" role="img" aria-label="${title}">
      ${canvasInner}
    </div>
  `;
  return art;
}

/* ---------------------------------------------------------
   Build a location screen (tiles + neighbor tiles + actions)
--------------------------------------------------------- */
function buildSingleLocationScreen(loc){
  const section = document.createElement('section');
  section.className = 'screen';
  section.id = `screen-${loc.id}`;
  section.setAttribute('aria-label', loc.name);

  const grid = document.createElement('section');
  grid.className = 'grid';

  // Own tiles
  (loc.tiles || []).forEach(t => grid.appendChild(makeTile(t)));

  // Neighbor tiles (travel)
  (loc.neighbors || []).forEach(nid => {
    const nloc = LOCATIONS.find(l => l.id === nid);
    if (!nloc) return;
    grid.appendChild(makeTile({
      title: nloc.name,
      img: null, imgAlt: nloc.name, fit: 'contain',
      gotoId: `screen-${nloc.id}`
    }));
  });

  // Actions
  const actions = document.createElement('section');
  actions.className = 'actions';
  const titleId = `actions-${loc.id}`;
  actions.setAttribute('aria-labelledby', titleId);

  actions.innerHTML = `
    <h3 id="${titleId}">${loc.name} actions</h3>
    <div class="actions__row">
      ${
        (loc.actions || []).map(a => {
          const safeLog = (a.log || 'You act.').replace(/"/g,'&quot;');

          // Navigate to another page (battle.html)
          if (a.type === 'go') {
            // Always preserve ?from=<loc>, append existing href (may already have ?boss=)
            const join = a.href.includes('?') ? '&' : '?';
            const url  = `${a.href}${join}from=${encodeURIComponent(loc.id)}&t=${Date.now()}`;
            return `
              <button class="action-btn"
                      data-go="${url}"
                      data-log="${safeLog}">
                ${a.label}
              </button>`;
          }

          // Open interact screen with NPC
          if (a.type === 'interact') {
            return `
              <button class="action-btn"
                      data-open-interact
                      data-npc-id="${a.npcId}"
                      data-log="${safeLog}">
                ${a.label}
              </button>`;
          }

          // Local action (log only)
          return `
            <button class="action-btn"
                    data-action="${a.id}"
                    data-log="${safeLog}">
              ${a.label}
            </button>`;
        }).join('')
      }
      <button class="action-btn nav-back">Back</button>
    </div>
    <div class="log" aria-live="polite"></div>
  `;

  section.appendChild(grid);
  section.appendChild(actions);
  return section;
}

/* ---------------------------------------------------------
   Build all screens + navigation
--------------------------------------------------------- */
function buildAllScreens(){
  const root = qs('#screens-root');
  if (!root) return;
  root.innerHTML = '';
  LOCATIONS.forEach(loc => root.appendChild(buildSingleLocationScreen(loc)));
}

function travelTo(targetScreenId){
  const targetId = targetScreenId.replace(/^screen-/, '');
  const from = LOCATIONS.find(l => l.id === currentId);
  if (!from) return;

  if (!(from.neighbors || []).includes(targetId)) {
    writeLog(`You can’t go there from here.`);
    return;
  }

  navStack.push(currentId);
  currentId = targetId;
  showScreen(`screen-${currentId}`);

  const here = LOCATIONS.find(l => l.id === currentId);
  writeLog(here?.enterText || `You travel to ${here?.name || currentId}.`);
}

function goBack(){
  if (navStack.length === 0){
    writeLog('There’s nowhere to go back to.');
    return;
  }
  currentId = navStack.pop();
  showScreen(`screen-${currentId}`);

  const here = LOCATIONS.find(l => l.id === currentId);
  writeLog(here?.enterText || `You return to ${here?.name || currentId}.`);
}

/* ---------------------------------------------------------
   Events
--------------------------------------------------------- */
// Tile travel (mouse)
document.addEventListener('click', (e)=>{
  const el = e.target.closest('[data-goto]');
  if (!el) return;
  const target = el.getAttribute('data-goto');
  travelTo(target);
});

// Tile travel (keyboard)
document.addEventListener('keydown', (e)=>{
  const el = document.activeElement;
  if (!el?.matches?.('[data-goto]')) return;
  if (e.key === 'Enter' || e.key === ' '){
    e.preventDefault();
    el.click();
  }
});

// Rail: Map → describe neighbors
qs('#btnMap')?.addEventListener('click', ()=>{
  const here = LOCATIONS.find(l => l.id === currentId);
  const names = (here?.neighbors || [])
    .map(id => LOCATIONS.find(l => l.id === id)?.name || id)
    .join(', ');
  writeLog(`You are in ${here?.name}. Paths lead to: ${names || 'nowhere'}.`);
});

// Rail: Bag → inventory.html
qs('#btnBag')?.addEventListener('click', ()=>{
  location.href = 'inventory.html?from=choiceMap';
});

// Rail: Stats → stats.html (panel opens on load)
qs('#btnStats')?.addEventListener('click', ()=>{
  location.href = 'stats.html?from=choiceMap';
});

// Back button
document.addEventListener('click', (e)=>{
  if (e.target.closest('.nav-back')) goBack();
});

// Local action (just writes to log)
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.action-btn[data-action]');
  if (!btn) return;
  const msg = btn.getAttribute('data-log') || 'You act.';
  writeLog(msg);
});

// Enter Combat / Fight Boss → battle.html (with from=<location>, optional boss)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-go]');
  if (!btn) return;
  const msg = btn.getAttribute('data-log') || 'You act.';
  writeLog(msg);
  location.href = btn.getAttribute('data-go');
});

/* ---------------------------------------------------------
   NPC Interact (opens interact.html with NPC data)
--------------------------------------------------------- */
const NPC_REGISTRY = {
  trader: {
    id: 'trader',
    name: 'Trader',
    img: 'assets/npc-trader.jpg',
    canTrade: true,
    canFetch: false,
    greeting: 'Care to barter?'
  }
};

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-open-interact][data-npc-id]');
  if (!btn) return;

  const logMsg = btn.getAttribute('data-log');
  if (logMsg) writeLog(logMsg);

  const id  = btn.dataset.npcId;
  const npc = NPC_REGISTRY[id];
  if (!npc) return;

  sessionStorage.setItem('activeNpc', JSON.stringify(npc));
  location.href = `interact.html?npc=${encodeURIComponent(id)}&from=${encodeURIComponent(currentId)}`;
});

/* ---------------------------------------------------------
   Boot
--------------------------------------------------------- */
buildAllScreens();
showScreen(`screen-${currentId}`);
const start = LOCATIONS.find(l => l.id === currentId);
writeLog(start?.enterText || `You are in ${start?.name || currentId}.`);
