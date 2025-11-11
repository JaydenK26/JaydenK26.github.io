// ============================
// interactScript.js (full)
// ============================

// ----- DOM refs -----
const log = document.getElementById('log');
const btnFetch = document.getElementById('btnFetch');
const btnTrade = document.getElementById('btnTrade');
const tradeDlg = document.getElementById('tradeDlg');
const btnConfirmTrade = document.getElementById('btnConfirmTrade');

// Row that holds action buttons (we'll inject Talk here)
const actionsRow =
  document.getElementById('actionsRow') ||
  document.querySelector('.actions__row');

// Optional header bits (if present in HTML)
const npcImg  = document.getElementById('npcImg');
const npcName = document.getElementById('npcName');
const actionsTitle = document.getElementById('actionsTitle');

// Dialog close buttons (defensive)
document.querySelectorAll('[data-close]').forEach(b =>
  b.addEventListener('click', () => tradeDlg?.close?.())
);

// ----- Utilities -----
function say(msg){ if (log) log.textContent = msg; }

// ----- Fallback NPCs (ensure talk exists even if map didn't send it) -----
const NPC_FALLBACK = {
  trader: {
    id: 'trader',
    name: 'Trader',
    img: 'assets/npc-trader.jpg',   // <- replace with your real path if needed
    canTrade: true,
    canFetch: false,
    greeting: 'Care to barter?',
    talk: [
      { id:'how-are-you', label:'Ask “How are you?”', lines:[
        'All things considered, I’m doing fine.',
        'Business is steady. Could be better, could be worse.',
        'Roads are rough, but the coin still spends.'
      ]},
      { id:'rumors', label:'Ask for rumors', lines:[
        'They say Silver Mountain hides a path only seen at dusk.',
        'Heard the hut dweller found a key with no lock.',
        'Cave’s echo carries voices that aren’t your own.'
      ]},
      { id:'name',    label:'Ask their name', lines:[
        'Name’s Varro. If you need something, I probably know where to get it.'
      ]},
      { id:'goodbye', label:'Say goodbye', lines:[
        'Safe travels. Keep your purse close and your map closer.'
      ]}
    ]
  },

  dog: {
    id: 'dog',
    name: 'Dog',
    img: 'assets/npc-dog.jpg',
    canTrade: false,
    canFetch: true,
    greeting: 'Woof!',
    talk: [
      { id:'how-are-you', label:'Ask “How are you?”', lines:['*happy tail thumps*']},
      { id:'rumors',      label:'Ask for rumors',     lines:['🐾 (the dog stares at your pocket)']},
      { id:'goodbye',     label:'Say goodbye',        lines:['Woof! (They follow a few steps, then sit.)']}
    ]
  }
};

// ----- Read the active NPC and merge with fallback -----
function readActiveNpc(){
  let loaded = null;
  try {
    const raw = sessionStorage.getItem('activeNpc');
    if (raw) loaded = JSON.parse(raw);
  } catch {}

  const queryId = new URLSearchParams(location.search).get('npc');
  const base = (loaded && NPC_FALLBACK[loaded.id]) ||
               (queryId && NPC_FALLBACK[queryId]) ||
               null;

  // Merge fallback -> loaded; then ensure defaults
  const npc = { ...(base || {}), ...(loaded || {}) };

  npc.id        = npc.id        ?? base?.id        ?? 'npc';
  npc.name      = npc.name      ?? base?.name      ?? 'NPC';
  npc.img       = npc.img       ?? base?.img       ?? '';
  npc.canTrade  = npc.canTrade  ?? base?.canTrade  ?? false;
  npc.canFetch  = npc.canFetch  ?? base?.canFetch  ?? false;
  npc.greeting  = npc.greeting  ?? base?.greeting  ?? 'What will you do?';
  npc.talk      = npc.talk      ?? base?.talk      ?? []; // <<< critical

  return npc;
}

// ----- Render NPC header & available actions -----
function renderNpc(npc){
  if (npcImg)  { npcImg.src = npc.img || npcImg.src; npcImg.alt = npc.name || 'NPC'; }
  if (npcName) npcName.textContent = npc.name || 'NPC';
  if (actionsTitle) actionsTitle.textContent = `${npc.name || 'NPC'} — interaction options`;

  // Show/hide built-ins
  if (btnTrade) btnTrade.style.display = npc.canTrade ? '' : 'none';
  if (btnFetch) btnFetch.style.display = npc.canFetch ? '' : 'none';

  // Inject Talk buttons
  renderTalkButtons(npc.talk || []);

  // Opening line
  say(npc.greeting || 'What will you do?');
}

// ----- Inject/refresh Talk buttons -----
function renderTalkButtons(talkDefs){
  if (!actionsRow) return;

  // Remove any previous talk buttons
  actionsRow.querySelectorAll('[data-talk-id]').forEach(el => el.remove());

  if (!talkDefs.length) return;

  const frag = document.createDocumentFragment();
  talkDefs.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';           // matches your styling
    b.setAttribute('data-talk-id', t.id);
    b.textContent = t.label || t.id;
    frag.appendChild(b);
  });
  actionsRow.appendChild(frag);
}

// ----- Talk state (cycle lines per option) -----
const talkStateKey = (npcId, talkId) => `talkState:${npcId}:${talkId}`;
const getTalkIndex = (npcId, talkId) => {
  const n = Number(sessionStorage.getItem(talkStateKey(npcId, talkId)));
  return Number.isFinite(n) ? n : 0;
};
const setTalkIndex = (npcId, talkId, idx) =>
  sessionStorage.setItem(talkStateKey(npcId, talkId), String(idx));

// ----- Built-in actions -----
btnFetch?.addEventListener('click', () => {
  const lines = [
    'You throw a stick. The NPC sprints after it with questionable enthusiasm.',
    'NPC returns with… a different stick. Progress?',
    'You throw the stick again. He keeps the original and brings back a rock.'
  ];
  say(lines[Math.floor(Math.random()*lines.length)]);
});

btnTrade?.addEventListener('click', () => tradeDlg?.showModal?.());

// Toggle chips in trade dialog
tradeDlg?.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if(!chip) return;
  const pressed = chip.getAttribute('aria-pressed') === 'true';
  chip.setAttribute('aria-pressed', String(!pressed));
});

// Confirm trade (fixed syntax)
btnConfirmTrade?.addEventListener('click', () => {
  const offers = [...tradeDlg.querySelectorAll('.chip[aria-pressed="true"][data-offer]')]
                  .map(x => x.dataset.offer);
  const wants  = [...tradeDlg.querySelectorAll('.chip[aria-pressed="true"][data-want]')]
                  .map(x => x.dataset.want);

  if(!offers.length || !wants.length){
    say('Select at least one item to offer and one to receive.');
    return;
  }
  say(`Trade complete: You gave ${offers.join(', ')} and received ${wants.join(', ')}.`);
  tradeDlg.close();
});

// ----- Delegated Talk clicks -----
document.addEventListener('click', (e)=>{
  const talkBtn = e.target.closest('[data-talk-id]');
  if (!talkBtn) return;

  const talkId = talkBtn.getAttribute('data-talk-id');
  const t = (ACTIVE_NPC.talk || []).find(x => x.id === talkId);
  const lines = t?.lines?.length ? t.lines : ['…'];

  let idx = getTalkIndex(ACTIVE_NPC.id, talkId);
  say(lines[idx % lines.length]);
  setTalkIndex(ACTIVE_NPC.id, talkId, (idx + 1) % lines.length);
});

// ----- Boot -----
const ACTIVE_NPC = readActiveNpc();
renderNpc(ACTIVE_NPC);
