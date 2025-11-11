// --- Demo data ---
const buyStock = [
  { id: 1, type: 'Consumable', name: 'Eggplant', price: 25 },
  { id: 2, type: 'Weapon',     name: 'Broom Spear', price: 120 },
  { id: 3, type: 'Accessory',  name: 'Left Sock of Luck', price: 60 },
  { id: 4, type: 'Consumable', name: 'Mystery Juice', price: 45 },
];

let inventory = [
  { id: 'i1', type: 'Consumable', name: 'Old Bread', price: 5 },
  { id: 'i2', type: 'Weapon', name: 'Twig', price: 3 }
];

let gold = 1354;
let mode = 'buy';     // 'buy' | 'sell'
let selected = null;

// --- DOM ---
const listEl   = document.getElementById('itemList');
const dType    = document.getElementById('dType');
const dName    = document.getElementById('dName');
const dPrice   = document.getElementById('dPrice');
const qtyInput = document.getElementById('qty');
const actBtn   = document.getElementById('actBtn');
const goldEl   = document.getElementById('gold');
const hint     = document.getElementById('hint');
const toast    = document.getElementById('toast');

// Tabs
const tabBuy  = document.getElementById('tabBuy');
const tabSell = document.getElementById('tabSell');

tabBuy.addEventListener('click', () => switchMode('buy'));
tabSell.addEventListener('click', () => switchMode('sell'));

function switchMode(newMode){
  mode = newMode;
  tabBuy.classList.toggle('is-active', mode==='buy');
  tabSell.classList.toggle('is-active', mode==='sell');
  actBtn.textContent = mode === 'buy' ? 'Buy' : 'Sell';
  selected = null;
  qtyInput.value = 1;
  paintList();
  paintDetails();
}

function paintList(){
  listEl.innerHTML = '';
  const items = mode === 'buy' ? buyStock : inventory;
  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.setAttribute('role','option');
    row.setAttribute('tabindex','0');
    row.setAttribute('aria-selected', selected?.id === it.id);
    row.innerHTML = `
      <span>${it.name}</span>
      <span>${it.type}</span>
      <span>${it.price}g</span>
    `;
    row.addEventListener('click', () => { selected = it; paintDetails(); paintList(); });
    row.addEventListener('keydown', e => {
      if(e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selected = it; paintDetails(); paintList(); }
    });
    listEl.appendChild(row);
  });
}

function paintDetails(){
  if(!selected){
    dType.textContent = '—';
    dName.textContent = '—';
    dPrice.textContent = '—';
    hint.style.display = 'block';
    actBtn.disabled = true;
    return;
  }
  hint.style.display = 'none';
  dType.textContent = selected.type;
  dName.textContent = selected.name;
  dPrice.textContent = `${selected.price}g`;
  actBtn.disabled = false;
}

actBtn.addEventListener('click', () => {
  if(!selected) return;
  const qty = Math.max(1, Number(qtyInput.value)||1);
  const total = selected.price * qty;

  if(mode === 'buy'){
    if(gold < total){ ping('Not enough gold!'); return; }
    gold -= total;
    // add to inventory
    inventory.push({ id: 'i' + Math.random().toString(36).slice(2,7), ...selected });
    ping(`Bought ${qty} × ${selected.name} for ${total}g.`);
  } else { // sell
    // remove one-by-one for simplicity
    let sold = 0;
    for(let i=inventory.length-1; i>=0 && sold<qty; i--){
      if(inventory[i].name === selected.name){
        inventory.splice(i,1); sold++;
      }
    }
    if(sold === 0){ ping('You do not own that item.'); return; }
    const earnings = selected.price * sold;
    gold += earnings;
    ping(`Sold ${sold} × ${selected.name} for ${earnings}g.`);
  }
  goldEl.textContent = gold.toLocaleString();
  paintList();
});

function ping(msg){
  toast.textContent = msg;
  toast.setAttribute('data-show','true');
  setTimeout(()=> toast.removeAttribute('data-show'), 1400);
}

// initial paint
goldEl.textContent = gold.toLocaleString();
switchMode('buy');
