import { calculateItemMetrics, stateStats, todayKey } from '../core.js';
import { icon } from '../icons.js';
import {
  actionSheet,
  compressImage,
  confirmAction,
  escapeHtml,
  formatMoney,
  iconTile,
  nowIso,
  openSheet,
  statusColor,
  statusLabel,
  toast,
  uid,
} from './common.js';

const STATUS_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '在用' },
  { value: 'idle', label: '闲置' },
];

function categories(state) {
  return state.categories.filter((category) => category.kind === 'item' && !category.deletedAt);
}

function categoryFor(state, categoryId) {
  return state.categories.find((category) => category.id === categoryId && !category.deletedAt)
    ?? state.categories.find((category) => category.kind === 'item' && !category.deletedAt);
}

function visibleItems(ctx) {
  const { state, ui } = ctx;
  const query = ui.itemSearch.trim().toLowerCase();
  return state.items
    .filter((item) => !item.deletedAt)
    .filter((item) => ui.itemStatus === 'all' || item.status === ui.itemStatus)
    .filter((item) => ui.itemCategory === 'all' || item.categoryId === ui.itemCategory)
    .filter((item) => {
      if (!query) return true;
      const category = categoryFor(state, item.categoryId);
      return `${item.name} ${item.notes} ${category?.name ?? ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function renderItemRow(ctx, item) {
  const category = categoryFor(ctx.state, item.categoryId);
  const metrics = calculateItemMetrics(item);
  const currency = ctx.state.settings.currency;
  const subtitle = [
    escapeHtml(category?.name ?? ''),
    `<span class="status-dot" style="--status-color:${statusColor(item.status)}"></span>`,
    escapeHtml(statusLabel(item.status)),
    item.uses > 0 ? `${item.uses}次` : '',
  ].filter(Boolean).join(' ');
  const thumb = item.photo
    ? `<span class="thumb"><img src="${escapeHtml(item.photo)}" alt=""></span>`
    : iconTile(category?.icon ?? 'box', category?.color ?? '#0A84FF', 'md');
  return `
    <button type="button" class="list-row" data-action="edit-item" data-id="${escapeHtml(item.id)}">
      ${thumb}
      <span class="list-row-main">
        <span class="row-title">${escapeHtml(item.name || '未命名')}</span>
        <span class="row-subtitle">${subtitle}</span>
      </span>
      <span class="row-trailing">
        <span><strong>${escapeHtml(formatMoney(metrics.dailyCost, currency, { compact: true }))}</strong><span class="row-date">/天</span></span>
        ${icon('right', 'row-chevron')}
      </span>
    </button>`;
}

function renderItemsList(ctx) {
  const items = visibleItems(ctx);
  if (!items.length) {
    return `<div class="empty-state">
      <span class="empty-icon">${icon('box')}</span>
      <p>${ctx.state.items.length ? '没有匹配的物品' : '添加第一件物品'}</p>
      ${ctx.state.items.length ? '' : `<button type="button" class="empty-action" data-action="add-item">${icon('plus')} 添加</button>`}
    </div>`;
  }
  return `<div class="group"><div class="group-list">${items.map((item) => renderItemRow(ctx, item)).join('')}</div></div>`;
}

export async function openItemEditor(ctx, item = null) {
  const editing = Boolean(item);
  const draft = item ? { ...item } : {
    id: uid('item-'),
    name: '',
    price: 0,
    extraCost: 0,
    salePrice: 0,
    purchaseDate: todayKey(),
    endDate: '',
    status: 'active',
    categoryId: categories(ctx.state)[0]?.id ?? 'item-other',
    uses: 0,
    notes: '',
    photo: '',
    createdAt: nowIso(),
    updatedAt: Date.now(),
  };
  let photo = draft.photo ?? '';
  let uses = Number(draft.uses ?? 0);
  let status = draft.status;
  let categoryId = draft.categoryId;
  const itemCategories = categories(ctx.state);
  const categoryButtons = itemCategories.map((category) => `
    <button type="button" class="chip ${category.id === categoryId ? 'is-active' : ''}" data-category="${escapeHtml(category.id)}">
      ${icon(category.icon)}<span>${escapeHtml(category.name)}</span>
    </button>`).join('');
  const body = `
    <div class="form-section">
      <div class="form-row stack">
        <label class="form-label" for="item-name">名称</label>
        <input id="item-name" name="name" autocomplete="off" placeholder="物品名称" value="${escapeHtml(draft.name)}">
      </div>
      <div class="form-row">
        <span class="form-label-inline">${icon('cash')}<span>价格</span></span>
        <span class="amount-input-wrap"><span class="amount-currency">¥</span><input class="amount-input" id="item-price" name="price" inputmode="decimal" placeholder="0" value="${draft.price || ''}"></span>
      </div>
      <div class="form-row">
        <label class="form-label" for="item-date">购入</label>
        <input id="item-date" name="purchaseDate" type="date" value="${escapeHtml(draft.purchaseDate ?? todayKey())}">
      </div>
      <div class="form-row">
        <label class="form-label" for="item-status">状态</label>
        <div class="segmented" id="item-status">
          ${['active', 'idle', 'retired', 'sold'].map((value) => `<button type="button" class="segment ${value === status ? 'is-active' : ''}" data-status="${value}">${statusLabel(value)}</button>`).join('')}
        </div>
      </div>
      <div class="form-row" id="item-end-row" ${status === 'retired' || status === 'sold' ? '' : 'hidden'}>
        <label class="form-label" for="item-end">结束</label>
        <input id="item-end" name="endDate" type="date" value="${escapeHtml(draft.endDate ?? '')}">
      </div>
    </div>

    <div class="form-section">
      <div class="form-row stack">
        <span class="form-label">分类</span>
        <div class="chips" id="item-categories">${categoryButtons}</div>
      </div>
    </div>

    <div class="form-section">
      <div class="form-row stack">
        <span class="form-label">照片</span>
        <button type="button" class="photo-picker" id="item-photo-picker">
          ${photo ? `<img src="${escapeHtml(photo)}" alt=""><span class="photo-overlay" data-clear-photo>${icon('close')}</span>` : icon('photo')}
        </button>
        <input id="item-photo-file" type="file" accept="image/*" hidden>
      </div>
      <div class="form-row">
        <span class="form-label-inline">${icon('activity')}<span>使用次数</span></span>
        <div class="stepper" id="item-uses">
          <button type="button" data-step="-1" aria-label="减少">${icon('minus')}</button>
          <output>${uses}</output>
          <button type="button" data-step="1" aria-label="增加">${icon('plus')}</button>
        </div>
      </div>
    </div>

    <details class="form-section advanced">
      <summary>${icon('ellipsis')}<span>更多</span>${icon('down')}</summary>
      <div class="form-row">
        <label class="form-label" for="item-extra">附加费</label>
        <input id="item-extra" name="extraCost" inputmode="decimal" placeholder="0" value="${draft.extraCost || ''}">
      </div>
      <div class="form-row">
        <label class="form-label" for="item-sale">卖出价</label>
        <input id="item-sale" name="salePrice" inputmode="decimal" placeholder="0" value="${draft.salePrice || ''}">
      </div>
      <div class="form-row stack">
        <label class="form-label" for="item-notes">备注</label>
        <textarea id="item-notes" name="notes" placeholder="可选">${escapeHtml(draft.notes)}</textarea>
      </div>
    </details>

    <div id="item-delete-wrap">${editing ? `<button type="button" class="sheet-delete-button" data-delete-item>${icon('trash')}<span>删除物品</span></button>` : ''}</div>
  `;

  let sheet;
  sheet = openSheet({
    title: editing ? '编辑物品' : '添加物品',
    body,
    primaryLabel: '保存',
    onMount: (content) => {
      const picker = content.querySelector('#item-photo-picker');
      const fileInput = content.querySelector('#item-photo-file');
      const endRow = content.querySelector('#item-end-row');
      const statusGroup = content.querySelector('#item-status');
      const categoriesGroup = content.querySelector('#item-categories');
      const usesOutput = content.querySelector('#item-uses output');

      statusGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-status]');
        if (!button) return;
        status = button.dataset.status;
        statusGroup.querySelectorAll('[data-status]').forEach((node) => node.classList.toggle('is-active', node === button));
        endRow.hidden = !(status === 'retired' || status === 'sold');
        if (!endRow.hidden && !content.querySelector('#item-end').value) {
          content.querySelector('#item-end').value = todayKey();
        }
      });
      categoriesGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-category]');
        if (!button) return;
        categoryId = button.dataset.category;
        categoriesGroup.querySelectorAll('[data-category]').forEach((node) => node.classList.toggle('is-active', node === button));
      });
      content.querySelector('#item-uses').addEventListener('click', (event) => {
        const button = event.target.closest('[data-step]');
        if (!button) return;
        uses = Math.max(0, uses + Number(button.dataset.step));
        usesOutput.textContent = String(uses);
      });
      picker.addEventListener('click', (event) => {
        if (event.target.closest('[data-clear-photo]')) {
          event.stopPropagation();
          photo = '';
          picker.innerHTML = icon('photo');
          return;
        }
        fileInput.click();
      });
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          photo = await compressImage(file, 1000, 0.72);
          picker.innerHTML = `<img src="${escapeHtml(photo)}" alt=""><span class="photo-overlay" data-clear-photo>${icon('close')}</span>`;
        } catch (error) {
          toast(error.message, 'close');
        } finally {
          fileInput.value = '';
        }
      });
      content.querySelector('[data-delete-item]')?.addEventListener('click', async () => {
        const confirmed = await confirmAction({
          title: '删除物品',
          message: '这条记录会从所有设备移除。',
          confirmLabel: '删除',
          destructive: true,
        });
        if (!confirmed) return;
        sheet.close();
        await ctx.store.update((state) => {
          const target = state.items.find((entry) => entry.id === draft.id);
          if (target) {
            target.deletedAt = nowIso();
            target.updatedAt = Date.now();
          }
        });
        toast('已删除', 'trash');
      });
    },
    onPrimary: async (content) => {
      const name = content.querySelector('#item-name').value.trim();
      if (!name) {
        content.querySelector('#item-name').focus();
        toast('填写名称', 'pencil');
        return false;
      }
      const price = Number(content.querySelector('#item-price').value || 0);
      if (!Number.isFinite(price) || price < 0) {
        content.querySelector('#item-price').focus();
        toast('价格不正确', 'pencil');
        return false;
      }
      const next = {
        ...draft,
        name,
        price,
        extraCost: Math.max(0, Number(content.querySelector('#item-extra').value || 0)),
        salePrice: Math.max(0, Number(content.querySelector('#item-sale').value || 0)),
        purchaseDate: content.querySelector('#item-date').value || todayKey(),
        endDate: (status === 'retired' || status === 'sold') ? (content.querySelector('#item-end').value || todayKey()) : '',
        status,
        categoryId,
        uses,
        notes: content.querySelector('#item-notes').value.trim(),
        photo,
        updatedAt: Date.now(),
      };
      await ctx.store.update((state) => {
        const index = state.items.findIndex((entry) => entry.id === next.id);
        if (index >= 0) state.items[index] = next;
        else state.items.push(next);
      });
      toast(editing ? '已保存' : '已添加', 'check');
    },
  });
}

export function renderItemsScreen(ctx) {
  const { state, ui } = ctx;
  const stats = stateStats(state);
  const currency = state.settings.currency;
  const category = state.categories.find((entry) => entry.id === ui.itemCategory && !entry.deletedAt);
  const root = document.createElement('section');
  root.className = 'screen';
  root.innerHTML = `
    <header class="screen-toolbar">
      <h1 class="screen-title">物品</h1>
      <div class="toolbar-actions">
        <button type="button" class="icon-button ${ui.itemSearchOpen ? 'is-muted' : ''}" data-action="toggle-search" aria-label="搜索">${icon('search')}</button>
        <button type="button" class="icon-button" data-action="add-item" aria-label="添加物品">${icon('plus')}</button>
      </div>
    </header>

    ${ui.itemSearchOpen ? `<div class="search-wrap">${icon('search')}<input id="item-search" type="search" placeholder="搜索" value="${escapeHtml(ui.itemSearch)}" autocomplete="off"><button type="button" class="search-clear" data-action="clear-search" aria-label="清除">${icon('close')}</button></div>` : ''}

    <div class="summary-card">
      <div class="summary-hero">
        <div class="summary-hero-label">日均</div>
        <div class="summary-hero-value">${escapeHtml(formatMoney(stats.dailyCost, currency, { compact: true }))}</div>
        <div class="summary-hero-meta">
          <div><span>在用</span><strong>${stats.activeItems}</strong></div>
          <div><span>总成本</span><strong>${escapeHtml(formatMoney(stats.totalCost, currency, { compact: true }))}</strong></div>
        </div>
      </div>
    </div>

    <div class="filter-bar">
      <div class="segmented">
        ${STATUS_FILTERS.map((filter) => `<button type="button" class="segment ${ui.itemStatus === filter.value ? 'is-active' : ''}" data-status-filter="${filter.value}">${filter.label}</button>`).join('')}
      </div>
      <button type="button" class="filter-button ${ui.itemCategory !== 'all' ? 'is-active' : ''}" data-action="filter-category" aria-label="分类筛选">${icon('filter')}</button>
    </div>
    ${category ? `<div class="group-title"><span>${escapeHtml(category.name)}</span><button type="button" class="small-button" data-action="clear-category">清除</button></div>` : ''}
    <div id="items-list">${renderItemsList(ctx)}</div>
  `;
  ctx.main.replaceChildren(root);

  root.addEventListener('click', async (event) => {
    const actionNode = event.target.closest('[data-action]');
    const statusNode = event.target.closest('[data-status-filter]');
    if (statusNode) {
      ui.itemStatus = statusNode.dataset.statusFilter;
      renderItemsScreen(ctx);
      return;
    }
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'add-item') openItemEditor(ctx);
    if (action === 'toggle-search') {
      ui.itemSearchOpen = !ui.itemSearchOpen;
      if (!ui.itemSearchOpen) ui.itemSearch = '';
      renderItemsScreen(ctx);
    }
    if (action === 'clear-search') {
      ui.itemSearch = '';
      renderItemsScreen(ctx);
    }
    if (action === 'filter-category') {
      const options = [
        { label: '全部', value: 'all', icon: 'box' },
        ...categories(state).map((entry) => ({ label: entry.name, value: entry.id, icon: entry.icon })),
      ];
      const selected = await actionSheet({ title: '分类', actions: options });
      if (selected) {
        ui.itemCategory = selected;
        renderItemsScreen(ctx);
      }
    }
    if (action === 'clear-category') {
      ui.itemCategory = 'all';
      renderItemsScreen(ctx);
    }
    if (action === 'edit-item') {
      const item = state.items.find((entry) => entry.id === actionNode.dataset.id && !entry.deletedAt);
      if (item) openItemEditor(ctx, item);
    }
  });

  const search = root.querySelector('#item-search');
  if (search) {
    search.addEventListener('input', () => {
      ui.itemSearch = search.value;
      const list = root.querySelector('#items-list');
      if (list) list.innerHTML = renderItemsList(ctx);
    });
  }
}
