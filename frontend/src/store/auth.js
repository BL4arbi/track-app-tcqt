import { defineStore } from 'pinia';

function readStored(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function hasElectronSession() {
  return typeof window !== 'undefined' && !!window.electronAPI?.setSession;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    // Synchronous initial read covers plain-browser (LAN) usage. The
    // Electron desktop app overrides this via restoreSession() below,
    // since its persistence is async (IPC to the main process).
    token: readStored('token'),
    user: JSON.parse(readStored('user') || 'null'),
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
    isManager: (state) => state.user?.role === 'manager',
  },
  actions: {
    async restoreSession() {
      if (!hasElectronSession()) return;
      const stored = await window.electronAPI.getSession();
      if (stored) {
        this.token = stored.token;
        this.user = stored.user;
      }
    },
    // remember=true persists across app restarts; remember=false keeps the
    // session for this run only (in-memory in Electron — nothing written
    // to disk; sessionStorage in a plain browser).
    async setSession(token, user, remember = true) {
      this.token = token;
      this.user = user;

      if (hasElectronSession()) {
        if (remember) {
          await window.electronAPI.setSession({ token, user });
        } else {
          await window.electronAPI.clearSession();
        }
        return;
      }

      const active = remember ? localStorage : sessionStorage;
      const inactive = remember ? sessionStorage : localStorage;
      inactive.removeItem('token');
      inactive.removeItem('user');
      active.setItem('token', token);
      active.setItem('user', JSON.stringify(user));
    },
    async logout() {
      this.token = null;
      this.user = null;
      if (hasElectronSession()) {
        await window.electronAPI.clearSession();
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    },
  },
});
