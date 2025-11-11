/* ========= Inventory Script (with stat bonuses) ========= */

/* --- endpoints --- */
const API_ENDPOINT    = 'https://csunix.mohawkcollege.ca/~sa000854737/inventory.php';
const UPDATE_ENDPOINT = 'https://csunix.mohawkcollege.ca/~sa000854737/update_item.php';

/* localStorage keys */
const LS_KEY_ITEMS     = 'inv_cache_v1';
const LS_KEY_BONUSES   = 'rpg_equipped_bonuses_v1';   // total bonuses from equipped items
const LS_KEY_EQUIPPED  = 'rpg_equipped_items_v1';     // list of equipped item ids (optional)

/* --- state --- */
let items = [];          // full dataset
let filtered = [];       // filtered/sorted
let sortMode = 'alpha';  // 'alpha' | 'recent'

/* --- dom refs --- */
const grid     = document.getElementById('grid');
const q        = document.getElementById('q');
const sortBtn  = document.getElementById('sortBtn');
const sortMenu = document.getElementById('sortMenu');
const statusEl = document.getElementById('status');

/* --- utils --- */
const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg; };
const fmtDate = iso => {
  if (!iso) return '';
  try { return new Date(iso.replace(' ', 'T')).toLocaleDateString(); } catch { return iso; }
};
function loadFromLocal(key){
  try{ const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); }catch{}
  return null;
}
function saveToLocal(key, data){
  try{ localStorage.setItem(key, JSON.stringify(data)); }catch{}
}

/* Normalize API rows into typed objects, including optional bonuses */
function normalize(rows){
  return rows.map(r => ({
    ...r,
    id: Number(r.id),
    qty: Number(r.qty),
    equippable: !!r.equippable,
    equipped: !!r.equipped,

    // optional bonus columns from DB (default 0 if missing)
    bonus_hp:        Number(r.bonus_hp ?? 0),
    bonus_mp:        Number(r.bonus_mp ?? 0),
    bonus_strength:  Number(r.bonus_strength ?? 0),
    bonus_skill:     Number(r.bonus_skill ?? 0),
  }));
}

/* sample data so page still works without API (dev only) */
function sampleData(){
  const d = (off) => new Date(Date.now()-86400000*off).toISOString();
  return [
    { id:1, name:'Potion',       qty:3, type:'Consumable', rarity:'Common',    img:'assets/potion.png',   dateAcquired:d(1),  equippable:false, equipped:false,
      bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 },
    { id:2, name:'Ether',        qty:1, type:'Consumable', rarity:'Uncommon',  img:'assets/ether.png',    dateAcquired:d(2),  equippable:false, equipped:false,
      bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 },
    { id:3, name:'Bronze Sword', qty:1, type:'Weapon',     rarity:'Common',    img:'assets/sword.png',    dateAcquired:d(10), equippable:true,  equipped:false,
      bonus_hp:0, bonus_mp:0, bonus_strength:5, bonus_skill:0 },
    { id:4, name:'Leather Cap',  qty:1, type:'Armor',      rarity:'Common',    img:'assets/cap.png',      dateAcquired:d(5),  equippable:true,  equipped:true,
      bonus_hp:10, bonus_mp:0, bonus_strength:0, bonus_skill:0 },
    { id:5, name:'Hi-Potion',    qty:0, type:'Consumable', rarity:'Rare',      img:'assets/hipotion.png', dateAcquired:d(20), equippable:false, equipped:false,
      bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 },
    { id:6, name:'Ancient Map',  qty:1, type:'Key Item',   rarity:'Legendary', img:'assets/map.png',      dateAcquired:d(3),  equippable:false, equipped:false,
      bonus_hp:0, bonus_mp:0, bonus_strength:0, bonus_skill:0 }
  ];
}

/* --- data loading --- */
async function fetchInventory(){
  // Try API
  try{
    const res = await fetch(API_ENDPOINT, { headers:{ 'Accept':'application/json' }, credentials: 'include' });
    if (res.ok){
      const json = await res.json();
      if (Array.isArray(json)){
        const data = normalize(json);
        saveToLocal(LS_KEY_ITEMS, data);
        return data;
      }
    } else {
      setStatus(`Server ${res.status}: falling back to cache`);
    }
  }catch(e){
    setStatus('Offline/API unreachable: using cache or sample data');
  }
  // Fallback to cache
  const cached = loadFromLocal(LS_KEY_ITEMS);
  if (cached) return cached;
  // Last resort: sample
  const data = sampleData();
  saveToLocal(LS_KEY_ITEMS, data);
  return data;
}

/* --- server update --- */
async function saveServerUpdate(partial){
  const res = await fetch(UPDATE_ENDPOINT, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    credentials: 'include',
    body: JSON.stringify(partial)
  });
  if (!res.ok) throw new Error(`Server ${res.status}`);
  const json = await res.json();
  if (json && json.error) throw new Error(json.message || 'Server error');
  return true;
}

/* --- compute and publish total equipped bonuses --- */
function computeEquippedBonuses(data = items){
  const eq = (data || []).filter(x => x.equippable && x.equipped);

  const totals = {
    bonus_hp:       0,
    bonus_mp:       0,
    bonus_strength: 0,
    bonus_skill:    0,
  };
  for (const it of eq){
    totals.bonus_hp       += Number(it.bonus_hp || 0);
    totals.bonus_mp       += Number(it.bonus_mp || 0);
    totals.bonus_strength += Number(it.bonus_strength || 0);
    totals.bonus_skill    += Number(it.bonus_skill || 0);
  }

  // Persist for battle.html to consume
  saveToLocal(LS_KEY_BONUSES, totals);
  saveToLocal(LS_KEY_EQUIPPED, eq.map(x => x.id));

  // Fire a storage-like custom event (useful if other tabs/pages listen)
  document.dispatchEvent(new CustomEvent('equippedBonusesUpdated', { detail: totals }));

  return totals;
}

/* --- rendering --- */
function cardTemplate(it){
  const equipable = !!it.equippable;
  const equipped  = !!it.equipped;
  const canUse    = it.type === 'Consumable' && it.qty > 0;

  // Build a small bonus summary (only show if any non-zero)
  const b = {
    hp: it.bonus_hp || 0,
    mp: it.bonus_mp || 0,
    str: it.bonus_strength || 0,
    skl: it.bonus_skill || 0
  };
  const hasBonus = (b.hp||b.mp||b.str||b.skl) !== 0;
  const bonusLine = hasBonus
    ? `<p class="card__meta">Bonus: `
      + `${b.hp?`HP +${b.hp} `:''}`
      + `${b.mp?`MP +${b.mp} `:''}`
      + `${b.str?`STR +${b.str} `:''}`
      + `${b.skl?`SKL +${b.skl} `:''}`
      + `</p>`
    : ``;

  return `
  <article class="card ${equipped ? 'is-equipped' : ''}" data-id="${it.id}">
    <div class="card__media">
      ${it.img
        ? `<img class="card__img" src="${it.img}" alt="${it.name}" loading="lazy" decoding="async">`
        : `<div class="placeholder" aria-hidden="true">🎒</div>`}
    </div>
    <h3 class="card__title">${it.name}</h3>
    <p class="card__meta">${it.type} · ${it.rarity}${it.dateAcquired ? ` · ${fmtDate(it.dateAcquired)}` : ''}</p>
    ${bonusLine}

    <div class="badges">
      <span class="badge badge--qty" data-qty>Qty: ${it.qty}</span>
      <span class="badge badge--rar">${it.rarity}</span>
    </div>

    <div class="card__actions">
      <button class="btn btn-use" ${canUse ? '' : 'disabled'}>Use</button>
      ${equipable
        ? `<button class="btn btn-equip">${equipped ? 'Unequip' : 'Equip'}</button>`
        : `<button class="btn" disabled>—</button>`}
    </div>
  </article>`;
}

function render(){
  if (!grid) return;
  grid.innerHTML = filtered.map(cardTemplate).join('');
}

/* --- filter/sort --- */
function applyFilters(){
  const term = (q?.value || '').trim().toLowerCase();
  filtered = items.filter(it => {
    if (!term) return true;
    return (
      it.name?.toLowerCase().includes(term) ||
      it.type?.toLowerCase().includes(term) ||
      it.rarity?.toLowerCase().includes(term)
    );
  });

  if (sortMode === 'alpha'){
    filtered.sort((a,b)=> a.name.localeCompare(b.name));
  } else if (sortMode === 'recent'){
    filtered.sort((a,b)=> new Date(b.dateAcquired||0) - new Date(a.dateAcquired||0));
  }
  render();
}

/* --- sort menu open/close --- */
function closeSortMenu(){
  if (!sortMenu) return;
  sortMenu.hidden = true;
  sortBtn?.setAttribute('aria-expanded','false');
}
function openSortMenu(){
  if (!sortMenu) return;
  sortMenu.hidden = false;
  sortBtn?.setAttribute('aria-expanded','true');
}

/* --- interactions --- */
document.addEventListener('click', async (e)=>{
  // Toggle sort dropdown
  if (e.target.closest('#sortBtn')){
    const isOpen = sortBtn.getAttribute('aria-expanded') === 'true';
    isOpen ? closeSortMenu() : openSortMenu();
    return;
  }
  // Sort choice
  const opt = e.target.closest('#sortMenu .menu__item');
  if (opt){
    sortMode = opt.dataset.sort;
    document.querySelectorAll('#sortMenu .menu__item').forEach(btn=>{
      btn.setAttribute('aria-checked', btn.dataset.sort === sortMode ? 'true' : 'false');
    });
    closeSortMenu();
    applyFilters();
    return;
  }
  // Click outside closes menu
  if (!e.target.closest('.sort')) closeSortMenu();

  // Use button
  const useBtn = e.target.closest('.btn-use');
  if (useBtn){
    const card = useBtn.closest('.card');
    const id   = Number(card.dataset.id);
    const it   = items.find(x => x.id === id);
    if (!it || it.type !== 'Consumable' || it.qty <= 0) return;

    // optimistic UI
    const prevQty = it.qty;
    it.qty = Math.max(0, it.qty - 1);
    saveToLocal(LS_KEY_ITEMS, items);

    const qtyEl = card.querySelector('[data-qty]');
    if (qtyEl) qtyEl.textContent = `Qty: ${it.qty}`;
    if (it.qty === 0) useBtn.disabled = true;
    setStatus(`${it.name} used.`);

    try{
      await saveServerUpdate({ id: it.id, qty: it.qty });
    }catch(err){
      // rollback
      it.qty = prevQty;
      saveToLocal(LS_KEY_ITEMS, items);
      if (qtyEl) qtyEl.textContent = `Qty: ${it.qty}`;
      useBtn.disabled = it.qty === 0;
      setStatus(`Failed to update server: ${err.message}`);
    }
    return;
  }

  // Equip/Unequip button
  const equipBtn = e.target.closest('.btn-equip');
  if (equipBtn){
    const card = equipBtn.closest('.card');
    const id   = Number(card.dataset.id);
    const it   = items.find(x => x.id === id);
    if (!it || !it.equippable) return;

    const prev = !!it.equipped;
    it.equipped = !it.equipped;

    // optimistic UI
    saveToLocal(LS_KEY_ITEMS, items);
    card.classList.toggle('is-equipped', it.equipped);
    equipBtn.textContent = it.equipped ? 'Unequip' : 'Equip';
    setStatus(`${it.equipped ? 'Equipped' : 'Unequipped'} ${it.name}.`);

    // Recompute and publish equipped bonuses immediately
    computeEquippedBonuses(items);

    try{
      await saveServerUpdate({ id: it.id, equipped: it.equipped ? 1 : 0 });
    }catch(err){
      // rollback equip state on failure
      it.equipped = prev;
      saveToLocal(LS_KEY_ITEMS, items);
      card.classList.toggle('is-equipped', it.equipped);
      equipBtn.textContent = it.equipped ? 'Unequip' : 'Equip';

      // recompute again after rollback
      computeEquippedBonuses(items);

      setStatus(`Failed to update server: ${err.message}`);
    }
    return;
  }
});

// Live search
q?.addEventListener('input', applyFilters);

/* --- boot --- */
(async function init(){
  setStatus('Loading items…');
  items = await fetchInventory();
  setStatus(`Loaded ${items.length} items.`);

  // default sort state in menu (if present)
  document.querySelectorAll('#sortMenu .menu__item').forEach(btn=>{
    btn.setAttribute('aria-checked', btn.dataset.sort === sortMode ? 'true' : 'false');
  });

  // First render
  applyFilters();

  // Publish current totals so other tabs/pages can use them right away
  computeEquippedBonuses(items);
})();
