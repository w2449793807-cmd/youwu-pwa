import { icon } from '../icons.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function uid(prefix = '') {
  const value = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}${value}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function formatMoney(amount, currency = 'CNY', options = {}) {
  const value = Number.isFinite(Number(amount)) ? Number(amount) : 0;
  const { compact = false, sign = false } = options;
  const formatter = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currency || 'CNY',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 1 : 2,
    notation: 'standard',
  });
  const text = formatter.format(Math.abs(value));
  if (!sign || value === 0) return text;
  return `${value > 0 ? '+' : '−'}${text}`;
}

export function formatDate(dateKey) {
  if (!dateKey) return '';
  const [year, month, day] = String(dateKey).slice(0, 10).split('-');
  if (!year || !month || !day) return String(dateKey);
  return `${Number(month)}月${Number(day)}日`;
}

export function formatMonth(month) {
  const [year, monthNumber] = String(month).split('-');
  return `${year}年${Number(monthNumber)}月`;
}

export function formatShortDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function maskEmail(email) {
  const [name, domain] = String(email ?? '').split('@');
  if (!name || !domain) return email || '';
  return `${name.slice(0, 2)}${'•'.repeat(Math.max(1, Math.min(5, name.length - 2)))}@${domain}`;
}

export function iconTile(iconName, color = '#0A84FF', size = 'md') {
  return `<span class="icon-tile icon-tile-${size}" style="--tile-color:${escapeHtml(color)}">${icon(iconName)}</span>`;
}

export function statusLabel(status) {
  return ({ active: '在用', idle: '闲置', retired: '退役', sold: '已卖出' })[status] ?? '在用';
}

export function statusColor(status) {
  return ({
    active: '#30D158',
    idle: '#FF9F0A',
    retired: '#8E8E93',
    sold: '#0A84FF',
  })[status] ?? '#8E8E93';
}

export function downloadFile(filename, content, mime = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function toast(message, iconName = 'check') {
  const root = document.querySelector('#toast-root');
  if (!root) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `${icon(iconName)}<span>${escapeHtml(message)}</span>`;
  root.append(node);
  requestAnimationFrame(() => node.classList.add('is-visible'));
  setTimeout(() => {
    node.classList.remove('is-visible');
    setTimeout(() => node.remove(), 220);
  }, 2200);
}

function trapFocus(container) {
  const focusable = () => [...container.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((node) => node.offsetParent !== null);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      container.dispatchEvent(new CustomEvent('sheet-close'));
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = focusable();
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}

export function openSheet({
  title = '',
  body = '',
  primaryLabel = '完成',
  secondaryLabel = '取消',
  onPrimary,
  onSecondary,
  className = '',
  hidePrimary = false,
  onMount,
} = {}) {
  const root = document.querySelector('#overlay-root');
  const layer = document.createElement('div');
  layer.className = `sheet-layer ${className}`.trim();
  layer.innerHTML = `
    <div class="sheet-backdrop" data-sheet-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="sheet-grabber" aria-hidden="true"></div>
      <header class="sheet-header">
        <button type="button" class="sheet-cancel" data-sheet-close>${escapeHtml(secondaryLabel)}</button>
        <h2 class="sheet-title">${escapeHtml(title)}</h2>
        ${hidePrimary ? '<span class="sheet-header-spacer"></span>' : `<button type="button" class="sheet-save">${escapeHtml(primaryLabel)}</button>`}
      </header>
      <div class="sheet-content">${body}</div>
    </section>`;
  root.append(layer);
  const sheet = layer.querySelector('.sheet');
  const content = layer.querySelector('.sheet-content');
  const saveButton = layer.querySelector('.sheet-save');
  const releaseFocus = trapFocus(sheet);
  let closed = false;
  const close = (result) => {
    if (closed) return;
    closed = true;
    releaseFocus();
    layer.classList.add('is-closing');
    setTimeout(() => layer.remove(), 220);
    onSecondary?.(result);
  };
  const cancelTargets = layer.querySelectorAll('[data-sheet-close]');
  cancelTargets.forEach((target) => target.addEventListener('click', () => close()));
  layer.addEventListener('sheet-close', () => close());
  saveButton?.addEventListener('click', async () => {
    if (saveButton.disabled) return;
    saveButton.disabled = true;
    saveButton.classList.add('is-busy');
    try {
      const result = await onPrimary?.(content, layer);
      if (result !== false) {
        closed = true;
        releaseFocus();
        layer.classList.add('is-closing');
        setTimeout(() => layer.remove(), 220);
      }
    } finally {
      saveButton.disabled = false;
      saveButton.classList.remove('is-busy');
    }
  });
  requestAnimationFrame(() => {
    layer.classList.add('is-open');
    (content.querySelector('input, textarea, select, button') ?? saveButton)?.focus({ preventScroll: true });
  });
  onMount?.(content, layer, close);
  return { close, layer, content, saveButton };
}

export function confirmAction({
  title = '',
  message = '',
  confirmLabel = '确定',
  destructive = false,
} = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const sheet = openSheet({
      title,
      body: message ? `<p class="dialog-message">${escapeHtml(message)}</p>` : '',
      primaryLabel: confirmLabel,
      secondaryLabel: '取消',
      className: destructive ? 'sheet-destructive' : '',
      onPrimary: () => {
        finish(true);
      },
      onSecondary: () => finish(false),
    });
    sheet.saveButton?.classList.toggle('is-destructive', destructive);
  });
}

export function actionSheet({ title = '', actions = [] } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const buttons = actions.map((action, index) => `
      <button type="button" class="action-item ${action.destructive ? 'is-destructive' : ''}" data-index="${index}">
        ${action.icon ? icon(action.icon) : ''}
        <span>${escapeHtml(action.label)}</span>
        ${action.detail ? `<span class="action-detail">${escapeHtml(action.detail)}</span>` : ''}
      </button>`).join('');
    const sheet = openSheet({
      title,
      body: `<div class="action-list">${buttons}</div>`,
      hidePrimary: true,
      secondaryLabel: '取消',
      onSecondary: () => finish(null),
    });
    sheet.content.querySelectorAll('[data-index]').forEach((button) => {
      button.addEventListener('click', () => {
        const action = actions[Number(button.dataset.index)];
        finish(action?.value ?? null);
        sheet.close();
      });
    });
  });
}

export async function compressImage(file, maxDimension = 1000, quality = 0.74) {
  if (!file?.type?.startsWith('image/')) throw new Error('请选择图片');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片格式不支持'));
    img.src = source;
  });
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || 'system';
}

export function debounce(fn, delay = 300) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function createElementFromHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}
