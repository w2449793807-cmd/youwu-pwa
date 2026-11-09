import { mergeState, normalizeState } from './core.js';

const CONFIG_KEY = 'youwu-cloud-config-v1';

function baseConfig() {
  const fromWindow = globalThis.YOUWU_CONFIG ?? {};
  try {
    const stored = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}');
    return {
      url: String(stored.url || fromWindow.SUPABASE_URL || ''),
      anonKey: String(stored.anonKey || fromWindow.SUPABASE_ANON_KEY || ''),
    };
  } catch {
    return {
      url: String(fromWindow.SUPABASE_URL || ''),
      anonKey: String(fromWindow.SUPABASE_ANON_KEY || ''),
    };
  }
}

export function isValidCloudConfig(config) {
  return Boolean(
    config?.url
    && config?.anonKey
    && /^https?:\/\//.test(config.url)
    && config.anonKey.length > 20,
  );
}

export class CloudSync {
  constructor(store) {
    this.store = store;
    this.client = null;
    this.user = null;
    this.status = 'unconfigured';
    this.error = '';
    this.lastSyncedAt = null;
    this.onStatus = null;
    this.syncPromise = null;
    this.config = baseConfig();
    this.syncTimer = null;
    this.authSubscription = null;
  }

  setStatusListener(listener) {
    this.onStatus = listener;
    this.emitStatus();
  }

  emitStatus(extra = {}) {
    this.onStatus?.({
      status: this.status,
      error: this.error,
      email: this.user?.email ?? '',
      configured: isValidCloudConfig(this.config),
      lastSyncedAt: this.lastSyncedAt,
      ...extra,
    });
  }

  setConfig(nextConfig) {
    this.config = {
      url: String(nextConfig?.url ?? '').trim().replace(/\/+$/, ''),
      anonKey: String(nextConfig?.anonKey ?? '').trim(),
    };
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    } catch {
      // The in-memory config still works for the current session.
    }
    this.client = null;
    this.user = null;
    return this.init();
  }

  async init() {
    if (!isValidCloudConfig(this.config)) {
      this.status = 'unconfigured';
      this.emitStatus();
      return null;
    }
    if (!globalThis.supabase?.createClient) {
      this.status = 'error';
      this.error = '云端组件未加载';
      this.emitStatus();
      return null;
    }
    this.client = globalThis.supabase.createClient(this.config.url, this.config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    this.authSubscription?.unsubscribe?.();
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      this.user = session?.user ?? null;
      this.status = this.user ? 'syncReady' : 'signedOut';
      this.emitStatus();
      if (this.user) this.scheduleSync(this.store.getState(), 50);
    });
    this.authSubscription = data?.subscription ?? null;
    const { data: sessionData, error } = await this.client.auth.getSession();
    if (error) {
      this.status = 'error';
      this.error = error.message;
    } else {
      this.user = sessionData?.session?.user ?? null;
      this.status = this.user ? 'syncReady' : 'signedOut';
    }
    this.emitStatus();
    if (this.user) await this.syncNow();
    return this.user;
  }

  async signInWithPassword(email, password) {
    if (!this.client) throw new Error('请先配置云端');
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanPassword = String(password ?? '');
    if (!cleanEmail) throw new Error('请输入邮箱');
    if (cleanPassword.length < 6) throw new Error('密码至少 6 位');
    const { data, error } = await this.client.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });
    if (error) throw error;
    this.user = data?.user ?? data?.session?.user ?? null;
    this.status = this.user ? 'syncReady' : 'signedOut';
    this.emitStatus();
    if (this.user) await this.syncNow();
    return this.user;
  }

  async signUpWithPassword(email, password, redirectTo) {
    if (!this.client) throw new Error('请先配置云端');
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanPassword = String(password ?? '');
    if (!cleanEmail) throw new Error('请输入邮箱');
    if (cleanPassword.length < 6) throw new Error('密码至少 6 位');
    const { data, error } = await this.client.auth.signUp({
      email: cleanEmail,
      password: cleanPassword,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    });
    if (error) throw error;
    this.user = data?.session?.user ?? null;
    this.status = this.user ? 'syncReady' : 'signedOut';
    this.emitStatus();
    if (this.user) await this.syncNow();
    return { user: this.user, needsConfirmation: !data?.session };
  }

  async signOut() {
    if (!this.client) return;
    await this.client.auth.signOut();
    this.user = null;
    this.status = 'signedOut';
    this.emitStatus();
  }

  scheduleSync(state = this.store.getState(), delay = 900) {
    if (!this.user) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncNow(state).catch((error) => {
        this.status = 'error';
        this.error = error?.message ?? '同步失败';
        this.emitStatus();
      });
    }, delay);
  }

  async syncNow(localState = this.store.getState()) {
    if (!this.client || !this.user) return this.store.getState();
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.runSync(localState).finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  async runSync(localState) {
    if (!navigator.onLine) {
      this.status = 'offline';
      this.emitStatus();
      return this.store.getState();
    }
    this.status = 'syncing';
    this.error = '';
    this.emitStatus();
    const userId = this.user.id;
    const { data: row, error: readError } = await this.client
      .from('user_state')
      .select('data,version,updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) throw readError;
    const remote = normalizeState(row?.data ?? {});
    const merged = mergeState(localState, remote);
    const { error: writeError } = await this.client
      .from('user_state')
      .upsert({
        user_id: userId,
        data: merged,
        version: Number(row?.version ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    if (writeError) throw writeError;
    this.lastSyncedAt = new Date().toISOString();
    this.status = 'synced';
    this.emitStatus();
    if (JSON.stringify(merged) !== JSON.stringify(this.store.getState())) {
      await this.store.replace(merged, 'remote');
    }
    return merged;
  }

  getEmail() {
    return this.user?.email ?? '';
  }

  isConfigured() {
    return isValidCloudConfig(this.config);
  }

  isSignedIn() {
    return Boolean(this.user);
  }
}
