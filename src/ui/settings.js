import { createBackup, mergeState, parseBackup, todayKey } from '../core.js';
import { icon } from '../icons.js';
import {
  actionSheet,
  confirmAction,
  downloadFile,
  escapeHtml,
  formatShortDateTime,
  maskEmail,
  openSheet,
  toast,
} from './common.js';

function cloudStatusLabel(cloud) {
  if (!cloud.isConfigured?.()) return '未配置';
  if (!cloud.isSignedIn()) return '未登录';
  return ({
    syncReady: '等待同步',
    syncing: '同步中',
    synced: '已同步',
    offline: '离线',
    error: cloud.error || '同步失败',
  })[cloud.status] ?? '已登录';
}

function cloudBadge(ctx) {
  const signedIn = ctx.cloud.isSignedIn();
  const failed = ctx.cloud.status === 'error';
  const className = failed ? 'is-error' : signedIn ? 'is-on' : '';
  const name = failed ? 'cloudOff' : signedIn ? 'cloud' : 'cloudOff';
  return `<span class="cloud-badge ${className}">${icon(name)}<span>${escapeHtml(cloudStatusLabel(ctx.cloud))}</span></span>`;
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvEscape).join(',')).join('\n')}`;
}

async function exportBackup(ctx) {
  const backup = createBackup(ctx.store.getState());
  const stamp = todayKey();
  downloadFile(`有物备份-${stamp}.json`, JSON.stringify(backup, null, 2));
  await ctx.store.update((state) => {
    state.settings.lastBackupAt = new Date().toISOString();
    state.settings.settingsUpdatedAt = Date.now();
  });
  toast('备份已导出', 'download');
}

async function exportCsv(ctx) {
  const selected = await actionSheet({
    title: '导出 CSV',
    actions: [
      { label: '账本', value: 'ledger', icon: 'list' },
      { label: '物品', value: 'items', icon: 'box' },
    ],
  });
  if (!selected) return;
  const state = ctx.store.getState();
  const stamp = todayKey();
  if (selected === 'ledger') {
    const categories = new Map(state.categories.map((category) => [category.id, category.name]));
    const accounts = new Map(state.accounts.map((account) => [account.id, account.name]));
    const rows = [
      ['日期', '类型', '分类', '账户', '金额', '备注'],
      ...state.transactions
        .filter((tx) => !tx.deletedAt)
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .map((tx) => [
          tx.date,
          tx.type === 'income' ? '收入' : '支出',
          categories.get(tx.categoryId) ?? '',
          accounts.get(tx.accountId) ?? '',
          tx.amount,
          tx.note,
        ]),
    ];
    downloadFile(`有物账本-${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  } else {
    const categories = new Map(state.categories.map((category) => [category.id, category.name]));
    const rows = [
      ['名称', '分类', '状态', '购入日期', '价格', '附加费', '卖出价', '使用次数', '备注'],
      ...state.items
        .filter((item) => !item.deletedAt)
        .map((item) => [
          item.name,
          categories.get(item.categoryId) ?? '',
          item.status,
          item.purchaseDate,
          item.price,
          item.extraCost,
          item.salePrice,
          item.uses,
          item.notes,
        ]),
    ];
    downloadFile(`有物物品-${stamp}.csv`, toCsv(rows), 'text/csv;charset=utf-8');
  }
  toast('CSV 已导出', 'download');
}

async function importBackup(ctx) {
  const input = document.querySelector('#backup-input');
  input.value = '';
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const imported = parseBackup(await file.text());
      const mode = await actionSheet({
        title: '导入备份',
        actions: [
          { label: '合并', value: 'merge', icon: 'sync', detail: '保留两边记录' },
          { label: '覆盖', value: 'replace', icon: 'upload', detail: '替换本机数据' },
        ],
      });
      if (!mode) return;
      if (mode === 'replace') {
        const confirmed = await confirmAction({
          title: '覆盖本机数据',
          message: '当前设备上的数据会被备份内容替换。',
          confirmLabel: '覆盖',
          destructive: true,
        });
        if (!confirmed) return;
        await ctx.store.replace(imported, 'local');
      } else {
        await ctx.store.update(() => mergeState(ctx.store.getState(), imported));
      }
      toast('已导入', 'check');
    } catch (error) {
      toast(error.message ?? '导入失败', 'close');
    } finally {
      input.value = '';
    }
  };
  input.click();
}

function openInstallSheet() {
  openSheet({
    title: '安装',
    hidePrimary: true,
    secondaryLabel: '关闭',
    body: `<div class="install-art">
      ${icon('share')}
      <p>使用 Safari 打开本页，点 <strong>分享</strong>，再点 <strong>添加到主屏幕</strong>。</p>
    </div>`,
  });
}

function openCloudConfig(ctx) {
  const config = ctx.cloud.config ?? {};
  openSheet({
    title: '云端',
    body: `
      <div class="form-section">
        <div class="form-row stack">
          <label class="form-label" for="cloud-url">Project URL</label>
          <input id="cloud-url" autocomplete="off" spellcheck="false" placeholder="https://…supabase.co" value="${escapeHtml(config.url ?? '')}">
        </div>
        <div class="form-row stack">
          <label class="form-label" for="cloud-key">anon public key</label>
          <textarea id="cloud-key" autocomplete="off" spellcheck="false" placeholder="eyJ…">${escapeHtml(config.anonKey ?? '')}</textarea>
        </div>
      </div>`,
    primaryLabel: '保存',
    onPrimary: async (content) => {
      const url = content.querySelector('#cloud-url').value.trim();
      const anonKey = content.querySelector('#cloud-key').value.trim();
      if (!url || !anonKey) {
        toast('填写云端配置', 'pencil');
        return false;
      }
      try {
        await ctx.cloud.setConfig({ url, anonKey });
        if (ctx.cloud.isSignedIn()) {
          toast('云端已连接', 'cloud');
          return;
        }
        setTimeout(() => openCloudLogin(ctx), 260);
        toast('云端已连接', 'cloud');
      } catch (error) {
        toast(error.message ?? '配置失败', 'close');
        return false;
      }
    },
  });
}

function authError(error) {
  const message = error?.message ?? '';
  if (/invalid login credentials/i.test(message)) return '邮箱或密码不正确';
  if (/email not confirmed/i.test(message)) return '请先确认邮箱';
  if (/already registered/i.test(message)) return '账号已存在，请直接登录';
  return message || '登录失败';
}

function openCloudLogin(ctx) {
  if (!ctx.cloud.isConfigured()) {
    openCloudConfig(ctx);
    return;
  }
  const email = localStorage.getItem('youwu-last-email') || '';
  openSheet({
    title: '登录',
    body: `
      <div class="form-section">
        <div class="form-row stack">
          <label class="form-label" for="cloud-email">邮箱</label>
          <input id="cloud-email" type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" value="${escapeHtml(email)}">
        </div>
        <div class="form-row stack">
          <label class="form-label" for="cloud-password">密码</label>
          <input id="cloud-password" type="password" autocomplete="current-password" placeholder="至少 6 位">
        </div>
      </div>
      <button type="button" class="sheet-secondary-action" id="create-cloud-account">创建账号</button>`,
    primaryLabel: '登录',
    onPrimary: async (content) => {
      const nextEmail = content.querySelector('#cloud-email').value.trim();
      const password = content.querySelector('#cloud-password').value;
      try {
        await ctx.cloud.signInWithPassword(nextEmail, password);
        localStorage.setItem('youwu-last-email', nextEmail);
        toast('已登录', 'check');
      } catch (error) {
        toast(authError(error), 'close');
        return false;
      }
    },
    onMount: (content, _layer, close) => {
      content.querySelector('#create-cloud-account').addEventListener('click', async () => {
        const nextEmail = content.querySelector('#cloud-email').value.trim();
        const password = content.querySelector('#cloud-password').value;
        try {
          const result = await ctx.cloud.signUpWithPassword(
            nextEmail,
            password,
            `${location.origin}${location.pathname}`,
          );
          localStorage.setItem('youwu-last-email', nextEmail);
          if (result.needsConfirmation) {
            toast('确认邮件已发送', 'cloud');
          } else {
            toast('账号已创建', 'check');
          }
          close();
        } catch (error) {
          toast(authError(error), 'close');
        }
      });
    },
  });
}

export function renderSettingsScreen(ctx) {
  const { state } = ctx;
  const signedIn = ctx.cloud.isSignedIn();
  const configured = ctx.cloud.isConfigured();
  const email = ctx.cloud.getEmail();
  const root = document.createElement('section');
  root.className = 'screen';
  root.innerHTML = `
    <header class="screen-toolbar"><h1 class="screen-title">设置</h1></header>

    <div class="settings-section">
      <div class="settings-header"><span>云端</span>${cloudBadge(ctx)}</div>
      <div class="group-list">
        ${!configured ? `<button type="button" class="settings-row button" data-action="cloud-config">${icon('cloudOff')}<span class="settings-label">连接云端</span>${icon('right', 'chevron')}</button>` : ''}
        ${configured && !signedIn ? `<button type="button" class="settings-row button" data-action="cloud-login">${icon('person')}<span class="settings-label">登录同步</span>${icon('right', 'chevron')}</button>` : ''}
        ${signedIn ? `
          <div class="settings-row">${icon('person')}<span class="settings-label">${escapeHtml(maskEmail(email))}</span><span class="settings-detail">${escapeHtml(cloudStatusLabel(ctx.cloud))}</span></div>
          <button type="button" class="settings-row button" data-action="sync-now">${icon('sync')}<span class="settings-label">立即同步</span><span class="settings-detail">${escapeHtml(formatShortDateTime(ctx.cloud.lastSyncedAt))}</span></button>
          <button type="button" class="settings-row button" data-action="sign-out">${icon('lock')}<span class="settings-label danger">退出登录</span>${icon('right', 'chevron')}</button>
        ` : ''}
      </div>
      <p class="setting-note">${configured ? '登录后，物品与账本会同步到你的账号。' : '连接云端后，换设备登录即可恢复。'}</p>
    </div>

    <div class="settings-section">
      <div class="settings-header"><span>数据</span></div>
      <div class="group-list">
        <button type="button" class="settings-row button" data-action="backup">${icon('download')}<span class="settings-label">导出备份</span><span class="settings-detail">${state.settings.lastBackupAt ? formatShortDateTime(state.settings.lastBackupAt) : 'JSON'}</span></button>
        <button type="button" class="settings-row button" data-action="restore">${icon('upload')}<span class="settings-label">导入备份</span>${icon('right', 'chevron')}</button>
        <button type="button" class="settings-row button" data-action="csv">${icon('list')}<span class="settings-label">导出 CSV</span>${icon('right', 'chevron')}</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-header"><span>外观</span></div>
      <div class="settings-row" style="padding-top:10px;padding-bottom:10px">
        <div class="segmented" id="theme-control">
          ${['system', 'light', 'dark'].map((theme) => `<button type="button" class="segment ${state.settings.theme === theme ? 'is-active' : ''}" data-theme-value="${theme}">${({ system: '自动', light: '浅色', dark: '深色' })[theme]}</button>`).join('')}
        </div>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-header"><span>应用</span></div>
      <div class="group-list">
        <button type="button" class="settings-row button" data-action="install">${icon('install')}<span class="settings-label">添加到主屏幕</span>${icon('right', 'chevron')}</button>
      </div>
    </div>
  `;
  ctx.main.replaceChildren(root);

  root.addEventListener('click', async (event) => {
    const themeNode = event.target.closest('[data-theme-value]');
    if (themeNode) {
      await ctx.store.update((state) => {
        state.settings.theme = themeNode.dataset.themeValue;
        state.settings.settingsUpdatedAt = Date.now();
      });
      return;
    }
    const actionNode = event.target.closest('[data-action]');
    if (!actionNode) return;
    const action = actionNode.dataset.action;
    if (action === 'cloud-config') openCloudConfig(ctx);
    if (action === 'cloud-login') openCloudLogin(ctx);
    if (action === 'sync-now') {
      try {
        await ctx.cloud.syncNow();
        toast('已同步', 'cloud');
      } catch (error) {
        toast(error.message ?? '同步失败', 'close');
      }
    }
    if (action === 'sign-out') {
      const confirmed = await confirmAction({
        title: '退出登录',
        message: '本机数据会保留，之后可以再次登录同步。',
        confirmLabel: '退出',
      });
      if (confirmed) {
        await ctx.cloud.signOut();
        toast('已退出', 'lock');
      }
    }
    if (action === 'backup') await exportBackup(ctx);
    if (action === 'restore') await importBackup(ctx);
    if (action === 'csv') await exportCsv(ctx);
    if (action === 'install') openInstallSheet();
  });
}
