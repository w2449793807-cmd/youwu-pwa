export const SCHEMA_VERSION = 1;
export const BACKUP_FORMAT = 'youwu-backup-v1';

const DAY_MS = 86_400_000;

export const DEFAULT_ITEM_CATEGORIES = [
  { id: 'item-digital', name: '数码', kind: 'item', icon: 'device', color: '#4E6E80', updatedAt: 0 },
  { id: 'item-home', name: '家居', kind: 'item', icon: 'home', color: '#5D765F', updatedAt: 0 },
  { id: 'item-clothes', name: '衣物', kind: 'item', icon: 'shirt', color: '#9A723E', updatedAt: 0 },
  { id: 'item-sport', name: '运动', kind: 'item', icon: 'activity', color: '#6A6784', updatedAt: 0 },
  { id: 'item-collect', name: '收藏', kind: 'item', icon: 'sparkles', color: '#855F6B', updatedAt: 0 },
  { id: 'item-other', name: '其他', kind: 'item', icon: 'box', color: '#70747A', updatedAt: 0 },
];

export const DEFAULT_LEDGER_CATEGORIES = [
  { id: 'exp-food', name: '餐饮', kind: 'expense', icon: 'food', color: '#9A723E', updatedAt: 0 },
  { id: 'exp-transport', name: '交通', kind: 'expense', icon: 'car', color: '#4E6E80', updatedAt: 0 },
  { id: 'exp-shopping', name: '购物', kind: 'expense', icon: 'bag', color: '#855F6B', updatedAt: 0 },
  { id: 'exp-home', name: '居住', kind: 'expense', icon: 'home', color: '#5D765F', updatedAt: 0 },
  { id: 'exp-fun', name: '娱乐', kind: 'expense', icon: 'game', color: '#6A6784', updatedAt: 0 },
  { id: 'exp-health', name: '医疗', kind: 'expense', icon: 'health', color: '#4F7A81', updatedAt: 0 },
  { id: 'exp-study', name: '学习', kind: 'expense', icon: 'book', color: '#5C668B', updatedAt: 0 },
  { id: 'exp-other', name: '其他', kind: 'expense', icon: 'ellipsis', color: '#70747A', updatedAt: 0 },
  { id: 'inc-salary', name: '工资', kind: 'income', icon: 'briefcase', color: '#5D765F', updatedAt: 0 },
  { id: 'inc-bonus', name: '奖金', kind: 'income', icon: 'gift', color: '#A57F3E', updatedAt: 0 },
  { id: 'inc-invest', name: '理财', kind: 'income', icon: 'chart', color: '#4E6E80', updatedAt: 0 },
  { id: 'inc-other', name: '其他', kind: 'income', icon: 'ellipsis', color: '#70747A', updatedAt: 0 },
];

export const DEFAULT_ACCOUNTS = [
  { id: 'account-cash', name: '现金', icon: 'cash', color: '#5D765F', updatedAt: 0 },
  { id: 'account-wechat', name: '微信', icon: 'message', color: '#56755C', updatedAt: 0 },
  { id: 'account-alipay', name: '支付宝', icon: 'wallet', color: '#537386', updatedAt: 0 },
  { id: 'account-bank', name: '银行卡', icon: 'bank', color: '#967343', updatedAt: 0 },
];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  currency: 'CNY',
  settingsUpdatedAt: 0,
};

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDateOnly(value) {
  const match = String(value ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return ms;
}

export function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function monthKey(value = todayKey()) {
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : todayKey().slice(0, 7);
}

export function calculateItemMetrics(item = {}, now = new Date()) {
  const price = numeric(item.price);
  const extraCost = numeric(item.extraCost);
  const salePrice = numeric(item.salePrice);
  const totalCost = price + extraCost - salePrice;
  const start = parseDateOnly(item.purchaseDate) ?? parseDateOnly(todayKey(now)) ?? Date.now();
  const terminalStatus = item.status === 'sold' || item.status === 'retired';
  const end = terminalStatus ? (parseDateOnly(item.endDate) ?? start) : (parseDateOnly(todayKey(now)) ?? Date.now());
  const days = Math.max(1, Math.floor((Math.max(start, end) - Math.min(start, end)) / DAY_MS) + 1);
  const uses = Math.max(0, Math.floor(numeric(item.uses)));
  return {
    days,
    totalCost,
    dailyCost: totalCost / days,
    perUseCost: uses > 0 ? totalCost / uses : null,
  };
}

export function calculateMonthSummary(transactions = [], selectedMonth = monthKey()) {
  const byCategory = new Map();
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (tx.deletedAt || !String(tx.date ?? '').startsWith(selectedMonth)) continue;
    const amount = Math.max(0, numeric(tx.amount));
    if (tx.type === 'income') {
      income += amount;
      continue;
    }
    if (tx.type !== 'expense') continue;
    expense += amount;
    byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + amount);
  }
  return {
    income,
    expense,
    balance: income - expense,
    byCategory: [...byCategory.entries()]
      .map(([categoryId, amount]) => ({ categoryId, type: 'expense', amount }))
      .sort((a, b) => b.amount - a.amount),
  };
}

export function mergeById(localRecords = [], remoteRecords = []) {
  const merged = new Map();
  for (const record of [...localRecords, ...remoteRecords]) {
    if (!record?.id) continue;
    const current = merged.get(record.id);
    if (!current || timestamp(record.updatedAt) > timestamp(current.updatedAt)) {
      merged.set(record.id, record);
    }
  }
  return [...merged.values()].sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
}

function mergeDefaults(defaults, records) {
  return mergeById(defaults, records).map(({ id, ...record }) => ({ id, ...record }));
}

export function normalizeState(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const categories = Array.isArray(input.categories) ? input.categories : [];
  const accounts = Array.isArray(input.accounts) ? input.accounts : [];
  const settings = input.settings && typeof input.settings === 'object' ? input.settings : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    items: Array.isArray(input.items) ? input.items.map((item) => ({
      id: item.id,
      name: String(item.name ?? ''),
      price: numeric(item.price),
      extraCost: numeric(item.extraCost),
      salePrice: numeric(item.salePrice),
      purchaseDate: String(item.purchaseDate ?? todayKey()),
      endDate: item.endDate ? String(item.endDate) : '',
      status: ['active', 'idle', 'retired', 'sold'].includes(item.status) ? item.status : 'active',
      categoryId: String(item.categoryId ?? 'item-other'),
      uses: Math.max(0, Math.floor(numeric(item.uses))),
      notes: String(item.notes ?? ''),
      photo: typeof item.photo === 'string' ? item.photo : '',
      createdAt: String(item.createdAt ?? ''),
      updatedAt: numeric(item.updatedAt),
      ...(item.deletedAt ? { deletedAt: String(item.deletedAt) } : {}),
    })).filter((item) => item.id) : [],
    transactions: Array.isArray(input.transactions) ? input.transactions.map((tx) => ({
      id: tx.id,
      type: tx.type === 'income' ? 'income' : 'expense',
      amount: Math.max(0, numeric(tx.amount)),
      categoryId: String(tx.categoryId ?? 'exp-other'),
      accountId: String(tx.accountId ?? 'account-cash'),
      date: String(tx.date ?? todayKey()),
      note: String(tx.note ?? ''),
      createdAt: String(tx.createdAt ?? ''),
      updatedAt: numeric(tx.updatedAt),
      ...(tx.deletedAt ? { deletedAt: String(tx.deletedAt) } : {}),
    })).filter((tx) => tx.id) : [],
    categories: mergeDefaults([...DEFAULT_ITEM_CATEGORIES, ...DEFAULT_LEDGER_CATEGORIES], categories).map((category) => ({
      ...category,
      name: String(category.name ?? ''),
      kind: ['item', 'expense', 'income'].includes(category.kind) ? category.kind : 'item',
      icon: String(category.icon ?? 'ellipsis'),
      color: String(category.color ?? '#8E8E93'),
      updatedAt: numeric(category.updatedAt),
    })),
    accounts: mergeDefaults(DEFAULT_ACCOUNTS, accounts).map((account) => ({
      ...account,
      name: String(account.name ?? ''),
      icon: String(account.icon ?? 'wallet'),
      color: String(account.color ?? '#8E8E93'),
      updatedAt: numeric(account.updatedAt),
    })),
    settings: {
      ...DEFAULT_SETTINGS,
      ...settings,
      theme: ['system', 'light', 'dark'].includes(settings.theme) ? settings.theme : 'system',
      currency: String(settings.currency ?? 'CNY'),
      settingsUpdatedAt: numeric(settings.settingsUpdatedAt),
    },
  };
}

export function mergeState(localRaw, remoteRaw) {
  const local = normalizeState(localRaw);
  const remote = normalizeState(remoteRaw);
  return normalizeState({
    schemaVersion: SCHEMA_VERSION,
    items: mergeById(local.items, remote.items),
    transactions: mergeById(local.transactions, remote.transactions),
    categories: mergeById(local.categories, remote.categories),
    accounts: mergeById(local.accounts, remote.accounts),
    settings: timestamp(local.settings.settingsUpdatedAt) >= timestamp(remote.settings.settingsUpdatedAt)
      ? local.settings
      : remote.settings,
  });
}

export function createBackup(state, now = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: normalizeState(state),
  };
}

export function parseBackup(text) {
  let raw;
  try {
    raw = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }
  if (!raw || raw.format !== BACKUP_FORMAT || !raw.data) {
    throw new Error('这不是有物备份文件');
  }
  return normalizeState(raw.data);
}

export function stateStats(state) {
  const normalized = normalizeState(state);
  const activeItems = normalized.items.filter((item) => !item.deletedAt && item.status === 'active');
  const totalCost = normalized.items
    .filter((item) => !item.deletedAt)
    .reduce((sum, item) => sum + calculateItemMetrics(item).totalCost, 0);
  const dailyCost = activeItems.reduce((sum, item) => sum + calculateItemMetrics(item).dailyCost, 0);
  return { activeItems: activeItems.length, totalCost, dailyCost };
}
