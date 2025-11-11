const openBtn = document.getElementById('openMap');
const panel = document.getElementById('mapPanel');
const log = document.getElementById('log');

// open/close
openBtn.addEventListener('click', () => {
  const open = panel.getAttribute('data-open') === 'true';
  panel.setAttribute('data-open', String(!open));
  openBtn.setAttribute('aria-expanded', String(!open));
});

// travel handler
function travel(name){
  const time = new Date().toLocaleTimeString();
  log.textContent = `[${time}] Traveling to ${name}…`;
}

document.querySelectorAll('.loc').forEach(loc => {
  const name = loc.dataset.loc || loc.querySelector('.loc__title')?.textContent?.trim() || 'Unknown';
  // click on the card
  loc.querySelector('.loc__card').addEventListener('click', () => travel(name));
  // keyboard
  loc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      travel(name);
    }
  });
});
