import { todayKey, monthKey } from './core.js';
import { icon } from './icons.js';
import { AppStore } from './store.js';
import { CloudSync } from './cloud.js';
import { applyTheme, toast } from './ui/common.js';
import { renderItemsScreen } from './ui/items.js';
import { renderLedgerScreen } from './ui/ledger.js';
import { renderSettingsScreen } from './ui/settings.js';

const main = document.querySelector('#main');
const tabbar = document.querySelector('#tabbar');
const store = new AppStore();
const cloud = new CloudSync(store);
const ui = {
  tab: 'items',
  itemStatus: 'all',
  itemCategory: 'all',
  itemSearch: '',
  itemSearchOpen: false,
  ledgerMonth: monthKey(todayKey()),
  ledgerSearch: '',
  ledgerSearchOpen: false,
};

const ctx = { store, cloud, ui, main, refresh: () => renderCurrent() };
Object.defineProperty(ctx, 'state', { get: () => store.getState() });

function renderTabbar() {
  const tabs = [
    { id: 'items', label: '物品', icon: 'box' },
    { id: 'ledger', label: '记账', icon: 'list' },
    { id: 'settings', label: '设置', icon: 'gear' },
  ];
  tabbar.innerHTML = tabs.map((tab) => `
    <button type="button" class="tab-item ${ui.tab === tab.id ? 'is-active' : ''}" data-tab="${tab.id}" aria-current="${ui.tab === tab.id ? 'page' : 'false'}">
      ${icon(tab.icon)}
      <span>${tab.label}</span>
    </button>`).join('');
}

function renderCurrent() {
  applyTheme(store.getState().settings.theme);
  if (ui.tab === 'items') renderItemsScreen(ctx);
  else if (ui.tab === 'ledger') renderLedgerScreen(ctx);
  else renderSettingsScreen(ctx);
  renderTabbar();
}

tabbar.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  ui.tab = button.dataset.tab;
  renderCurrent();
});

store.subscribe((state, event) => {
  renderCurrent();
  if (event.source === 'local' && cloud.isSignedIn()) cloud.scheduleSync(state);
});

cloud.setStatusListener(() => {
  if (ui.tab === 'settings') renderCurrent();
});

let cloudRefreshQueued = false;
function queueCloudRefresh() {
  if (cloudRefreshQueued || ui.tab !== 'settings') return;
  cloudRefreshQueued = true;
  requestAnimationFrame(() => {
    cloudRefreshQueued = false;
    renderCurrent();
  });
}

window.addEventListener('online', () => {
  if (cloud.isSignedIn()) cloud.syncNow().catch(() => {});
});
window.addEventListener('offline', () => {
  if (ui.tab === 'settings') queueCloudRefresh();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && cloud.isSignedIn()) {
    cloud.syncNow().catch(() => {});
  }
});
setInterval(() => {
  if (document.visibilityState === 'visible' && cloud.isSignedIn()) cloud.syncNow().catch(() => {});
}, 60_000);

window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.message) toast(event.reason.message, 'close');
});

async function boot() {
  await store.init();
  renderCurrent();
  await cloud.init();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

window.youwu = { store, cloud, ui };
boot().catch((error) => {
  toast(error.message ?? '启动失败', 'close');
  renderCurrent();
});
