/* ===================== Battle Script (DB stats + equipment bonuses + end splash -> return) ===================== */
/* ---- Server endpoints ---- */
const BASE = 'https://csunix.mohawkcollege.ca/~sa000854737';
const ENDPOINT_STATS = `${BASE}/stats_get.php`;   // { ok:true, stats:{ health, mana, strength, skill } }
const ENDPOINT_INV   = `${BASE}/inventory.php`;   // [ { equippable, equipped, bonus_hp, bonus_mp, bonus_strength, bonus_skill, ...}, ... ]

/* ---- Player catalogs (as requested) ---- */
const SKILL_CATALOG = {
  slap:     { name: 'Slap',                       mpCost: 10,   dmg: 30  },
  hat_throw:{ name: 'Hat Throw',                  mpCost: 15,   dmg: 36  },
  hoodie:   { name: 'Remembrance of the Hoodie',  mpCost: 100,  dmg: 200 },
  dropped:  { name: 'Tiger Drop',                 mpCost: 1000, dmg: 999999999 },
};

// This stays local (DB later if you want)
const ITEM_CATALOG = {
  dew:      { name: 'Mtn Dew',           hp: 30 },
  dew_volt: { name: 'Mtn Dew Voltage',   mp: 20 },
};

/* ===================== DOM refs ===================== */
const log       = document.getElementById('log');
const pHpText   = document.getElementById('pHpText');
const pMpText   = document.getElementById('pMpText');
const eHpText   = document.getElementById('eHpText');
const eMpText   = document.getElementById('eMpText');
const pHpBar    = document.getElementById('pHpBar');
const pMpBar    = document.getElementById('pMpBar');
const eHpBar    = document.getElementById('eHpBar');
const eMpBar    = document.getElementById('eMpBar');

const npcImgEl  = document.getElementById('npcImg');
const npcNameEl = document.getElementById('npcName');

const btnFight  = document.getElementById('btnFight');
const btnFlee   = document.getElementById('btnFlee');
const btnSkills = document.getElementById('btnSkills');
const btnItems  = document.getElementById('btnItems');

const skillsDlg = document.getElementById('skillsDlg');
const itemsDlg  = document.getElementById('itemsDlg');

const battleEl  = document.querySelector('.battle');

/* ===================== Small helpers ===================== */
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function write(msg, append=false){
  if (!log) return;
  log.textContent = append && log.textContent ? `${log.textContent} ${msg}` : msg;
}
function calcDamageFixed(amount){ return Math.max(0, Math.round(amount)); }
function pickWeighted(items, weightFn){
  const weights = items.map(weightFn).map(w => Math.max(0, w || 0));
  const total = weights.reduce((a,b)=>a+b,0);
  if (total <= 0) return null;
  let r = Math.random()*total;
  for (let i=0;i<items.length;i++){ r -= weights[i]; if (r<=0) return items[i]; }
  return items[items.length-1];
}
async function fetchJSON(url, options = {}){
  const res = await fetch(url, { credentials: 'include', headers:{ 'Accept':'application/json', ...(options.headers||{}) }, ...options });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 401) return { __unauth: true, raw: text };
    throw new Error(`HTTP ${res.status}: ${text.slice(0,160)}`);
  }
  try { return JSON.parse(text); } catch { throw new Error(`Bad JSON: ${text.slice(0,160)}`); }
}

/* ===================== Stats + equipment loading ===================== */
async function loadStatsFromDB(){
  try {
    const data = await fetchJSON(ENDPOINT_STATS);
    if (data && data.__unauth) return { health:10, mana:10, strength:10, skill:10 };
    const s = data?.stats ?? data ?? {};
    return {
      health:   Number(s.health ?? 10),
      mana:     Number(s.mana ?? 10),
      strength: Number(s.strength ?? 10),
      skill:    Number(s.skill ?? 10),
    };
  } catch {
    return { health:10, mana:10, strength:10, skill:10 };
  }
}
function isEquippedFlag(v){ return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE'; }
async function loadEquippedBonusesFromDB(){
  try {
    const rows = await fetchJSON(ENDPOINT_INV);
    if (!Array.isArray(rows)) return { bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 };
    const eq = rows.filter(r => !!r.equippable && isEquippedFlag(r.equipped));
    const totals = { bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 };
    for (const it of eq){
      totals.bonus_hp       += Number(it.bonus_hp ?? 0);
      totals.bonus_mp       += Number(it.bonus_mp ?? 0);
      totals.bonus_strength += Number(it.bonus_strength ?? 0);
      totals.bonus_skill    += Number(it.bonus_skill ?? 0);
    }
    return totals;
  } catch {
    return { bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 };
  }
}
function derivePlayerFromStats({ health, mana, strength, skill }){
  const maxHp      = 80 + health * 5;
  const maxMp      = 40 + mana   * 5;
  const basicDmg   = 6  + Math.floor(strength/2);
  const skillBonus = Math.floor(skill/2); // flat add to skills
  return { maxHp, maxMp, basicDmg, skillBonus };
}
function applyEquippedBonuses(derived, eq){
  return {
    maxHp:      derived.maxHp      + (eq.bonus_hp       || 0),
    maxMp:      derived.maxMp      + (eq.bonus_mp       || 0),
    basicDmg:   derived.basicDmg   + (eq.bonus_strength || 0),
    skillBonus: derived.skillBonus + (eq.bonus_skill    || 0),
  };
}

/* ===================== Player & enemy state ===================== */
let battleOver = false;

let player = {
  hp: 100, maxHp: 100,
  mp: 100, maxMp: 100,
  basicDmg: 10,
  skillBonus: 0
};

/* -------- Enemies (damage/heal only) -------- */
const roster = [
  {
    name: 'Goblin', hp: 50, maxHp: 50, mp: 30, maxMp: 30, alive: true,
    img: 'goblin.png', bg:'field.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Shank',          mpCost:15, dmg:30, weight:3, cooldown:2 },
      { type:'damage', name:'Throwing Knife', mpCost: 5, dmg:10, weight:1, cooldown:0 },
    ]
  },
  {
    name: 'Spud Thrower', hp: 30, maxHp: 30, mp: 50, maxMp: 50, alive: true,
    img: 'spud.jpg', bg:'field.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Throw Large Spud', mpCost:10, dmg:30, weight:3, cooldown:2 },
      { type:'heal',   name:'Eat Spud',         mpCost:20, heal:10, weight:1, cooldown:0 }
    ]
  },
  {
    name: 'Landlord', hp: 100, maxHp: 100, mp: 100, maxMp: 100, alive: true,
    img: 'landlord.jpg', bg:'toronto.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Ignore Dry Wall Damage', mpCost:10, dmg:30, weight:3, cooldown:2 },
      { type:'heal',   name:'1st of The Month',       mpCost:30, heal:40, weight:3, cooldown:2 },
    ]
  },
  {
    name: 'Egg Sage', hp: 300, maxHp: 300, mp: 200, maxMp: 200, alive: true,
    img: 'eggSage.jpg', bg:'eggBack.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Chicken Assault',        mpCost:10,  dmg:30,  weight:3, cooldown:2 },
      { type:'damage', name:'Torrential Egg Volley',  mpCost:50,  dmg:100, weight:3, cooldown:5 },
      { type:'heal',   name:'Birth anew',             mpCost:100, heal:300, weight:3, cooldown:99 },
    ]
  },
  {
    name: 'The Creator', hp: 9999, maxHp: 9999, mp: 9999, maxMp: 9999, alive: true,
    img: 'eggSage.jpg', bg:'dmv.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Spray With Febreeze',          mpCost:0, dmg:1,  weight:3, cooldown:2 },
      { type:'damage', name:'Hit The Sims 3 Dance',         mpCost:0, dmg:1,  weight:3, cooldown:5 },
      { type:'damage', name:'Show Images Of Stolen Hoodie', mpCost:0, dmg:10, weight:3, cooldown:5 },
      { type:'damage', name:'Take a Nap',                   mpCost:1, dmg:0,  weight:3, cooldown:5 },
    ]
  },
  {
    name: 'The Pope', hp: 600, maxHp: 600, mp: 600, maxMp: 600, alive: true,
    img: 'pope.jpg', bg:'church.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Smite',              mpCost:30,  dmg:60,  weight:3, cooldown:2 },
      { type:'damage', name:'No Hats Indoors!',   mpCost:10,  dmg:20,  weight:3, cooldown:1 },
      { type:'damage', name:'Summon Noahs Ark',   mpCost:300, dmg:200, weight:3, cooldown:99 },
      { type:'heal',   name:'Miracle',            mpCost:100, heal:100, weight:3, cooldown:5 },
    ]
  },
  {
    name: 'Stair Stealer', hp: 80, maxHp: 80, mp: 150, maxMp: 150, alive: true,
    img: 'stairs.jpg', bg:'toronto.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Steal Stairs', mpCost:30, dmg:35, weight:3, cooldown:2 }
    ]
  },
  {
    name: 'Weeb', hp: 80, maxHp: 80, mp: 500, maxMp: 500, alive: true,
    img: 'weeb.jpg', bg:'japanWeeb.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Magical Girl Explosion', mpCost:500, dmg:500, weight:10, cooldown:999999 }
    ]
  },
  {
    name: 'Salaryman', hp: 300, maxHp: 300, mp: 100, maxMp: 100, alive: true,
    img: 'salary.jpg', bg:'japan.jpg', basicWeight: 1,
    skills: [
      { type:'damage', name:'Briefcase Slap',       mpCost:10, dmg:30, weight:3, cooldown:1 },
      { type:'heal',   name:'Finally Some Rest...', mpCost: 0, heal:40, weight:0.5, cooldown:2 },
    ]
  }
];

const ENEMY_BIOMES = {
  grass:   ['Goblin', 'Spud Thrower'],
  park:    ['Spud Thrower', 'Landlord'],
  mcd:     ['Landlord', 'Weeb'],
  grand:   ['Goblin'],
  village: ['Landlord', 'Weeb'],
};

let selectedEnemy = {};

/* ===================== UI helpers ===================== */
function render(){
  if (!pHpText) return;
  pHpText.textContent = `${player.hp}/${player.maxHp}`;
  pMpText.textContent = `${player.mp}/${player.maxMp}`;
  eHpText.textContent = `${selectedEnemy.hp}/${selectedEnemy.maxHp}`;
  eMpText.textContent = `${selectedEnemy.mp}/${selectedEnemy.maxMp}`;

  pHpBar.style.width = `${(player.hp/player.maxHp)*100}%`;
  pMpBar.style.width = `${(player.mp/player.maxMp)*100}%`;
  eHpBar.style.width = `${(selectedEnemy.hp/selectedEnemy.maxHp)*100}%`;
  eMpBar.style.width = `${(selectedEnemy.mp/selectedEnemy.maxMp)*100}%`;
}
function setControlsEnabled(enabled){
  [btnFight, btnFlee, btnSkills, btnItems].forEach(b => { if (b) b.disabled = !enabled; });
}
function setBattleBackground(url, { opacity = 0.30, filter = 'none' } = {}){
  if (!battleEl) return;
  battleEl.style.setProperty('--card-bg-image', url ? `url("${url}")` : 'none');
  battleEl.style.setProperty('--card-bg-opacity', opacity);
  battleEl.style.setProperty('--card-bg-filter', filter);
}
function enemySelection(index){
  const base = roster[index];
  if (!base) return;
  selectedEnemy = {
    name: base.name,
    img:  base.img,
    maxHp: base.maxHp,
    maxMp: base.maxMp,
    hp:   base.hp ?? base.maxHp,
    mp:   base.mp ?? base.maxMp,
    alive:true,
    basicWeight: base.basicWeight ?? 1,
    skills: (base.skills || []).map(s => ({ ...s, cd: 0 }))
  };
  if (npcImgEl)  npcImgEl.src = selectedEnemy.img;
  if (npcNameEl) npcNameEl.textContent = selectedEnemy.name;
  setBattleBackground(base.bg || null, { opacity: base.bgOpacity ?? 0.50, filter: base.bgFilter ?? 'none' });
  render();
}

/* ===================== End splash + return ===================== */
function showEndSplash(text, tone='neutral'){
  let ov = document.getElementById('battle-end-splash');
  if (!ov){
    ov = document.createElement('div');
    ov.id = 'battle-end-splash';
    ov.innerHTML = `<div id="battle-end-splash__inner"></div>`;
    document.body.appendChild(ov);
    Object.assign(ov.style, {
      position:'fixed', inset:'0', display:'grid', placeItems:'center',
      background:'rgba(0,0,0,0.35)', backdropFilter:'blur(2px)',
      zIndex:'9999', opacity:'0', transition:'opacity .25s ease'
    });
    const inner = ov.querySelector('#battle-end-splash__inner');
    Object.assign(inner.style, {
      padding:'24px 30px', borderRadius:'16px', border:'1px solid rgba(255,255,255,.5)',
      background:'#ffffff', boxShadow:'0 10px 30px rgba(0,0,0,.25)',
      fontFamily:'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif',
      textAlign:'center', minWidth:'260px'
    });
  }
  const inner = ov.querySelector('#battle-end-splash__inner');
  inner.textContent = text;

  if (tone === 'win'){
    inner.style.color = '#166534'; inner.style.background = '#ecfdf5'; inner.style.borderColor = '#a7f3d0';
  } else if (tone === 'lose'){
    inner.style.color = '#7f1d1d'; inner.style.background = '#fef2f2'; inner.style.borderColor = '#fecaca';
  } else {
    inner.style.color = '#1f2937'; inner.style.background = '#ffffff'; inner.style.borderColor = 'rgba(0,0,0,.1)';
  }

  requestAnimationFrame(()=>{ ov.style.opacity = '1'; });
}

function endAndReturn(result){
  battleOver = true;
  setControlsEnabled(false);
  if (skillsDlg?.open) skillsDlg.close();
  if (itemsDlg?.open)  itemsDlg.close();

  if (result === 'victory') showEndSplash('Victory!', 'win');
  else if (result === 'defeat') showEndSplash('Defeat…', 'lose');
  else showEndSplash('You fled.');

  const params = new URLSearchParams(location.search);
  const fromId = params.get('from') || 'grass';

  setTimeout(()=>{
    location.href = `choiceMap.html?from=${encodeURIComponent(fromId)}&result=${encodeURIComponent(result)}&t=${Date.now()}`;
  }, 2500);
}

/* ===================== Enemy AI ===================== */
function enemyTurn(){
  if (!selectedEnemy.alive || battleOver) return;

  (selectedEnemy.skills || []).forEach(s => s.cd = Math.max(0, (s.cd || 0) - 1));
  const usable = (selectedEnemy.skills || []).filter(s =>
    (s.cd || 0) === 0 && (s.mpCost || 0) <= selectedEnemy.mp && (s.type === 'damage' || s.type === 'heal')
  );
  const candidates = [
    ...usable.map(s => ({ kind:'skill', skill:s })),
    { kind:'basic', weight: selectedEnemy.basicWeight ?? 1 }
  ];
  const choice = pickWeighted(candidates, c => c.kind === 'skill' ? (c.skill.weight ?? 1) : (c.weight ?? 1)) || { kind:'basic' };

  let msg = '';
  if (choice.kind === 'skill') {
    const s = choice.skill;
    selectedEnemy.mp = clamp(selectedEnemy.mp - (s.mpCost || 0), 0, selectedEnemy.maxMp);
    s.cd = s.cooldown || 0;

    if (s.type === 'damage') {
      const dmg = calcDamageFixed(s.dmg);
      player.hp = clamp(player.hp - dmg, 0, player.maxHp);
      msg = `${selectedEnemy.name} uses ${s.name}! It hits for ${dmg}.`;
    } else if (s.type === 'heal') {
      const healAmt = Number(s.heal || 0);
      const before = selectedEnemy.hp;
      selectedEnemy.hp = clamp(selectedEnemy.hp + healAmt, 0, selectedEnemy.maxHp);
      const actual = selectedEnemy.hp - before;
      msg = `${selectedEnemy.name} uses ${s.name} and heals ${actual} HP.`;
    } else {
      const dmg = calcDamageFixed(10);
      player.hp = clamp(player.hp - dmg, 0, player.maxHp);
      msg = `${selectedEnemy.name} hits back for ${dmg}.`;
    }
  } else {
    const dmg = calcDamageFixed(10);
    player.hp = clamp(player.hp - dmg, 0, player.maxHp);
    msg = `${selectedEnemy.name} hits back for ${dmg}.`;
  }

  write(` ${msg}`, true);
  render();

  if (player.hp === 0) {
    write(' You were defeated…', true);
    endAndReturn('defeat');
  }
}

/* ===================== Player UI: skills & items lists ===================== */
function renderPlayerSkills(){
  const list = document.querySelector('#skillsDlg .list');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(SKILL_CATALOG).forEach(([id, s])=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <button class="list__btn"
        data-skill="${s.name}" data-skill-id="${id}"
        data-mp="${s.mpCost}" data-dmg="${s.dmg}">
        ${s.name} (${s.mpCost} MP)
      </button>`;
    list.appendChild(li);
  });
}
function renderPlayerItems(){
  const list = document.querySelector('#itemsDlg .list');
  if (!list) return;
  list.innerHTML = '';
  Object.entries(ITEM_CATALOG).forEach(([id, it])=>{
    const li = document.createElement('li');
    const effect = it.hp ? `+${it.hp} HP` : it.mp ? `+${it.mp} MP` : '';
    li.innerHTML = `
      <button class="list__btn"
        data-item="${it.name}"
        ${it.hp ? `data-hp="${it.hp}"` : ''} ${it.mp ? `data-mp="${it.mp}"` : ''}>
        ${it.name} (${effect})
      </button>`;
    list.appendChild(li);
  });
}

/* ===================== Wire interactions ===================== */
function wireListeners(){
  btnFight?.addEventListener('click', ()=>{
    if(!selectedEnemy.alive || battleOver) return;
    const dmg = calcDamageFixed(player.basicDmg);
    selectedEnemy.hp = clamp(selectedEnemy.hp - dmg, 0, selectedEnemy.maxHp);
    write(`You attack! Dealt ${dmg} damage.`);

    if(selectedEnemy.hp === 0){
      selectedEnemy.alive = false;
      write(` ${selectedEnemy.name} defeated!`, true);
      render();
      endAndReturn('victory');
    } else {
      render();
      enemyTurn();
    }
  });

  btnFlee?.addEventListener('click', ()=>{
    if (battleOver) return;
    write('You fled the battle!');
    endAndReturn('flee');
  });

  btnSkills && skillsDlg && btnSkills.addEventListener('click', ()=>{ if (!battleOver) skillsDlg.showModal(); });
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', e => e.target.closest('dialog')?.close())
  );

  skillsDlg?.addEventListener('click', e=>{
    if (battleOver) return;
    const btn = e.target.closest('[data-skill]');
    if(!btn) return;

    const cost = Number(btn.dataset.mp || 0);
    if(player.mp < cost){ write('Not enough MP!'); return; }
    player.mp = clamp(player.mp - cost, 0, player.maxMp);

    const base = Number(btn.dataset.dmg || 0);
    const dmg  = calcDamageFixed(base + player.skillBonus);

    selectedEnemy.hp = clamp(selectedEnemy.hp - dmg, 0, selectedEnemy.maxHp);
    write(`${btn.dataset.skill}! Dealt ${dmg} damage.`);
    skillsDlg.close();

    if(selectedEnemy.hp === 0){
      selectedEnemy.alive = false;
      write(` ${selectedEnemy.name} defeated!`, true);
      render();
      endAndReturn('victory');
    } else {
      render();
      enemyTurn();
    }
  });

  btnItems && itemsDlg && btnItems.addEventListener('click', ()=>{ if (!battleOver) itemsDlg.showModal(); });
  itemsDlg?.addEventListener('click', e=>{
    if (battleOver) return;
    const btn = e.target.closest('[data-item]');
    if(!btn) return;

    if(btn.dataset.hp){
      player.hp = clamp(player.hp + Number(btn.dataset.hp || 0), 0, player.maxHp);
      write('You used an item. HP restored!');
    } else if(btn.dataset.mp){
      player.mp = clamp(player.mp + Number(btn.dataset.mp || 0), 0, player.maxMp);
      write('You used an item. MP restored!');
    }
    itemsDlg.close();
    if (selectedEnemy.alive) enemyTurn();
    render();
  });
}

/* ===================== Boot: fetch stats + equipment, then start ===================== */
(async function bootBattle(){
  const [baseStats, eqBonuses] = await Promise.all([
    loadStatsFromDB(),
    loadEquippedBonusesFromDB()
  ]);

  const derived = derivePlayerFromStats(baseStats);
  const merged  = applyEquippedBonuses(derived, eqBonuses);

  player = {
    hp: merged.maxHp, maxHp: merged.maxHp,
    mp: merged.maxMp, maxMp: merged.maxMp,
    basicDmg: merged.basicDmg,
    skillBonus: merged.skillBonus
  };

  const headerEl = document.querySelector('.battle__header');
  if (headerEl){
    headerEl.innerHTML = `<h1>HP ${player.maxHp} · MP ${player.maxMp} · ATK ${player.basicDmg} · SKILL +${player.skillBonus}</h1>`;
  }

  renderPlayerSkills();
  renderPlayerItems();

  // Choose enemy pool based on ?from=, or force boss via ?boss=<name>
  const params = new URLSearchParams(location.search);
  const fromId = params.get('from');
  const bossName = params.get('boss'); // <-- if present, force that enemy

  let pickIndex = 0;

  if (bossName) {
    const exact = roster.findIndex(e => e.name === bossName);
    pickIndex = exact >= 0 ? exact : 0;
  } else {
    let pool = roster;
    if (fromId && ENEMY_BIOMES[fromId]) {
      const allowed = new Set(ENEMY_BIOMES[fromId]);
      pool = roster.filter(e => allowed.has(e.name));
    }
    if (pool.length === 0) pool = roster;
    const pick = Math.floor(Math.random() * pool.length);
    pickIndex = roster.indexOf(pool[pick]);
    if (pickIndex < 0) pickIndex = 0;
  }

  enemySelection(pickIndex);

  write(bossName ? `A boss challenges you: ${bossName}!` : 'A foe challenges you!');
  setControlsEnabled(true);

  wireListeners();
})();
