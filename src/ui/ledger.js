import { calculateMonthSummary, monthKey, todayKey } from '../core.js';
import { icon } from '../icons.js';
import {
  actionSheet,
  confirmAction,
  escapeHtml,
  formatDate,
  formatMoney,
  formatMonth,
  iconTile,
  nowIso,
  openSheet,
  toast,
  uid,
} from './common.js';

function moveMonth(month, delta) {
  const [year, value] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, value - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function categoriesFor(state, type) {
  return state.categories.filter((category) => category.kind === type && !category.deletedAt);
}

function categoryFor(state, id) {
  return state.categories.find((category) => category.id === id && !category.deletedAt);
}

function accountFor(state, id) {
  return state.accounts.find((account) => account.id === id && !account.deletedAt);
}

function visibleTransactions(ctx) {
  const { state, ui } = ctx;
  const query = ui.ledgerSearch.trim().toLowerCase();
  return state.transactions
    .filter((tx) => !tx.deletedAt && String(tx.date).startsWith(ui.ledgerMonth))
    .filter((tx) => {
      if (!query) return true;
      const category = categoryFor(state, tx.categoryId);
      const account = accountFor(state, tx.accountId);
      return `${tx.note} ${category?.name ?? ''} ${account?.name ?? ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

function groupByDate(transactions) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!groups.has(tx.date)) groups.set(tx.date, []);
    groups.get(tx.date).push(tx);
  }
  return [...groups.entries()];
}

function renderTransactionRow(ctx, tx) {
  const category = categoryFor(ctx.state, tx.categoryId);
  const account = accountFor(ctx.state, tx.accountId);
  const title = tx.note.trim() || category?.name || '未分类';
  const subtitle = [category?.name, account?.name].filter(Boolean).join(' · ');
  const amount = formatMoney(tx.amount, ctx.state.settings.currency);
  return `
    <button type="button" class="list-row" data-action="edit-transaction" data-id="${escapeHtml(tx.id)}">
      ${iconTile(category?.icon ?? 'ellipsis', category?.color ?? '#8E8E93', 'sm')}
      <span class="list-row-main">
        <span class="row-title">${escapeHtml(title)}</span>
        <span class="row-subtitle">${escapeHtml(subtitle)}</span>
      </span>
      <span class="row-trailing">
        <span class="row-amount ${tx.type === 'income' ? 'income' : 'expense'}">${tx.type === 'income' ? '+' : '−'}${escapeHtml(amount)}</span>
        ${icon('right', 'row-chevron')}
      </span>
    </button>`;
}

function renderTransactionList(ctx) {
  const transactions = visibleTransactions(ctx);
  if (!transactions.length) {
    return `<div class="empty-state">
      <span class="empty-icon">${icon('list')}</span>
      <p>${ctx.state.transactions.length ? '没有匹配的记录' : '添加第一笔记录'}</p>
      ${ctx.state.transactions.length ? '' : `<button type="button" class="empty-action" data-action="add-transaction">${icon('plus')} 记一笔</button>`}
    </div>`;
  }
  return groupByDate(transactions).map(([date, rows]) => `
    <div class="group">
      <div class="group-title"><span>${escapeHtml(formatDate(date))}</span><span>${rows.length}笔</span></div>
      <div class="group-list">${rows.map((tx) => renderTransactionRow(ctx, tx)).join('')}</div>
    </div>`).join('');
}

function renderCategoryBreakdown(ctx, summary) {
  if (!summary.byCategory.length) return '';
  const max = summary.byCategory[0]?.amount || 1;
  return `<div class="section-card fade-in">
    <div class="section-card-head"><h2 class="section-card-title">分类</h2><span class="pill">${summary.byCategory.length}</span></div>
    <div class="bar-list">${summary.byCategory.slice(0, 6).map((entry) => {
      const category = categoryFor(ctx.state, entry.categoryId);
      return `<div class="bar-row">
        ${iconTile(category?.icon ?? 'ellipsis', category?.color ?? '#8E8E93', 'sm')}
        <div class="bar-main">
          <div class="bar-head"><span>${escapeHtml(category?.name ?? '未分类')}</span><span>${escapeHtml(formatMoney(entry.amount, ctx.state.settings.currency, { compact: true }))}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, (entry.amount / max) * 100)}%; background:${escapeHtml(category?.color ?? '#0A84FF')}"></div></div>
        </div>
        <span class="row-date">${Math.round((entry.amount / summary.expense) * 100)}%</span>
      </div>`;
    }).join('')}</div>
  </div>`;
}

export async function openTransactionEditor(ctx, transaction = null) {
  const editing = Boolean(transaction);
  const draft = transaction ? { ...transaction } : {
    id: uid('tx-'),
    type: 'expense',
    amount: 0,
    categoryId: categoriesFor(ctx.state, 'expense')[0]?.id ?? 'exp-other',
    accountId: ctx.state.accounts.find((account) => !account.deletedAt)?.id ?? 'account-cash',
    date: todayKey(),
    note: '',
    createdAt: nowIso(),
    updatedAt: Date.now(),
  };
  let type = draft.type;
  let categoryId = draft.categoryId;
  let accountId = draft.accountId;
  let sheet;
  const categoryChips = (selected, currentType) => categoriesFor(ctx.state, currentType)
    .map((category) => `<button type="button" class="chip ${category.id === selected ? 'is-active' : ''}" data-ledger-category="${escapeHtml(category.id)}">${icon(category.icon)}<span>${escapeHtml(category.name)}</span></button>`).join('');
  const accountChips = ctx.state.accounts
    .filter((account) => !account.deletedAt)
    .map((account) => `<button type="button" class="chip ${account.id === accountId ? 'is-active' : ''}" data-account="${escapeHtml(account.id)}">${icon(account.icon)}<span>${escapeHtml(account.name)}</span></button>`).join('');
  const body = `
    <div class="segmented ${type === 'income' ? 'success' : 'danger'}" id="ledger-type">
      <button type="button" class="segment ${type === 'expense' ? 'is-active danger' : ''}" data-ledger-type="expense">支出</button>
      <button type="button" class="segment ${type === 'income' ? 'is-active success' : ''}" data-ledger-type="income">收入</button>
    </div>
    <div class="form-section" style="margin-top:16px">
      <div class="form-row">
        <span class="form-label-inline">${icon('cash')}<span>金额</span></span>
        <span class="amount-input-wrap"><span class="amount-currency">¥</span><input class="amount-input" id="ledger-amount" inputmode="decimal" placeholder="0" value="${draft.amount || ''}"></span>
      </div>
      <div class="form-row">
        <label class="form-label" for="ledger-date">日期</label>
        <input id="ledger-date" type="date" value="${escapeHtml(draft.date ?? todayKey())}">
      </div>
    </div>
    <div class="form-section">
      <div class="form-row stack">
        <span class="form-label">分类</span>
        <div class="chips-scroll" id="ledger-categories">${categoryChips(categoryId, type)}</div>
      </div>
    </div>
    <div class="form-section">
      <div class="form-row stack">
        <span class="form-label">账户</span>
        <div class="chips-scroll" id="ledger-accounts">${accountChips}</div>
      </div>
      <div class="form-row stack">
        <label class="form-label" for="ledger-note">备注</label>
        <textarea id="ledger-note" placeholder="可选">${escapeHtml(draft.note)}</textarea>
      </div>
    </div>
    ${editing ? `<button type="button" class="sheet-delete-button" data-delete-transaction>${icon('trash')}<span>删除记录</span></button>` : ''}
  `;
  sheet = openSheet({
    title: editing ? '编辑记录' : '记一笔',
    body,
    primaryLabel: '保存',
    onMount: (content) => {
      const typeGroup = content.querySelector('#ledger-type');
      const categoryGroup = content.querySelector('#ledger-categories');
      typeGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ledger-type]');
        if (!button) return;
        type = button.dataset.ledgerType;
        typeGroup.querySelectorAll('[data-ledger-type]').forEach((node) => node.classList.toggle('is-active', node === button));
        typeGroup.querySelectorAll('[data-ledger-type]').forEach((node) => {
          node.classList.toggle('danger', type === 'expense' && node === button);
          node.classList.toggle('success', type === 'income' && node === button);
        });
        const available = categoriesFor(ctx.state, type);
        categoryId = available[0]?.id ?? 'exp-other';
        categoryGroup.innerHTML = categoryChips(categoryId, type);
      });
      categoryGroup.addEventListener('click', (event) => {
        const button = event.target.closest('[data-ledger-category]');
        if (!button) return;
        categoryId = button.dataset.ledgerCategory;
        categoryGroup.querySelectorAll('[data-ledger-category]').forEach((node) => node.classList.toggle('is-active', node === button));
      });
      content.querySelector('#ledger-accounts').addEventListener('click', (event) => {
        const button = event.target.closest('[data-account]');
        if (!button) return;
        accountId = button.dataset.account;
        content.querySelectorAll('[data-account]').forEach((node) => node.classList.toggle('is-active', node === button));
      });
      content.querySelector('[data-delete-transaction]')?.addEventListener('click', async () => {
        const confirmed = await confirmAction({
          title: '删除记录',
          message: '这条记录会从所有设备移除。',
          confirmLabel: '删除',
          destructive: true,
        });
        if (!confirmed) return;
        sheet.close();
        await ctx.store.update((state) => {
          const target = state.transactions.find((entry) => entry.id === draft.id);
          if (target) {
            target.deletedAt = nowIso();
            target.updatedAt = Date.now();
          }
        });
        toast('已删除', 'trash');
      });
    },
    onPrimary: async (content) => {
      const amount = Number(content.querySelector('#ledger-amount').value || 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        content.querySelector('#ledger-amount').focus();
        toast('填写金额', 'pencil');
        return false;
      }
      const next = {
        ...draft,
        type,
        amount,
        categoryId,
        accountId,
        date: content.querySelector('#ledger-date').value || todayKey(),
        note: content.querySelector('#ledger-note').value.trim(),
        updatedAt: Date.now(),
      };
      await ctx.store.update((state) => {
        const index = state.transactions.findIndex((entry) => entry.id === next.id);
        if (index >= 0) state.transactions[index] = next;
        else state.transactions.push(next);
      });
      toast(editing ? '已保存' : '已记录', 'check');
    },
  });
}

export function renderLedgerScreen(ctx) {
  const { state, ui } = ctx;
  const summary = calculateMonthSummary(state.transactions, ui.ledgerMonth);
  const currency = state.settings.currency;
  const root = document.createElement('section');
  root.className = 'screen';
  root.innerHTML = `
    <header class="screen-toolbar">
      <h1 class="screen-title">记账</h1>
      <div class="toolbar-actions">
        <button type="button" class="icon-button ${ui.ledgerSearchOpen ? 'is-muted' : ''}" data-action="toggle-ledger-search" aria-label="搜索">${icon('search')}</button>
        <button type="button" class="icon-button" data-action="add-transaction" aria-label="记一笔">${icon('plus')}</button>
      </div>
    </header>

    <div class="month-nav">
      <button type="button" class="icon-button" data-month-step="-1" aria-label="上个月">${icon('left')}</button>
      <strong>${escapeHtml(formatMonth(ui.ledgerMonth))}</strong>
      <button type="button" class="icon-button" data-month-step="1" aria-label="下个月">${icon('right')}</button>
    </div>

    <div class="summary-card">
      <div class="summary-hero">
        <div class="summary-hero-label">支出</div>
        <div class="summary-hero-value">${escapeHtml(formatMoney(summary.expense, currency, { compact: true }))}</div>
        <div class="summary-hero-meta">
          <div><span>收入</span><strong class="amount-positive">${escapeHtml(formatMoney(summary.income, currency, { compact: true }))}</strong></div>
          <div><span>结余</span><strong class="${summary.balance < 0 ? 'amount-negative' : 'amount-positive'}">${escapeHtml(formatMoney(summary.balance, currency, { compact: true }))}</strong></div>
        </div>
      </div>
    </div>

    ${ui.ledgerSearchOpen ? `<div class="search-wrap">${icon('search')}<input id="ledger-search" type="search" placeholder="搜索" value="${escapeHtml(ui.ledgerSearch)}" autocomplete="off"><button type="button" class="search-clear" data-action="clear-ledger-search" aria-label="清除">${icon('close')}</button></div>` : ''}
    ${renderCategoryBreakdown(ctx, summary)}
    <div id="ledger-list">${renderTransactionList(ctx)}</div>
  `;
  ctx.main.replaceChildren(root);

  root.addEventListener('click', async (event) => {
    const monthButton = event.target.closest('[data-month-step]');
    if (monthButton) {
      ui.ledgerMonth = moveMonth(ui.ledgerMonth, Number(monthButton.dataset.monthStep));
      renderLedgerScreen(ctx);
      return;
    }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'add-transaction') openTransactionEditor(ctx);
    if (action === 'toggle-ledger-search') {
      ui.ledgerSearchOpen = !ui.ledgerSearchOpen;
      if (!ui.ledgerSearchOpen) ui.ledgerSearch = '';
      renderLedgerScreen(ctx);
    }
    if (action === 'clear-ledger-search') {
      ui.ledgerSearch = '';
      renderLedgerScreen(ctx);
    }
    if (action === 'edit-transaction') {
      const tx = state.transactions.find((entry) => entry.id === actionNode.dataset.id && !entry.deletedAt);
      if (tx) openTransactionEditor(ctx, tx);
    }
  });

  const search = root.querySelector('#ledger-search');
  if (search) {
    search.addEventListener('input', () => {
      ui.ledgerSearch = search.value;
      const list = root.querySelector('#ledger-list');
      if (list) list.innerHTML = renderTransactionList(ctx);
    });
  }
}
