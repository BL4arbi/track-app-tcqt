import { defineStore } from 'pinia';

function readStored(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: readStored('token'),
    user: JSON.parse(readStored('user') || 'null'),
  }),
  getters: {
    isAuthenticated: (state) => !!state.token,
    isManager: (state) => state.user?.role === 'manager',
  },
  actions: {
    // remember=true persists across browser restarts (localStorage);
    // remember=false is cleared when the browser/tab closes (sessionStorage).
    setSession(token, user, remember = true) {
      this.token = token;
      this.user = user;
      const active = remember ? localStorage : sessionStorage;
      const inactive = remember ? sessionStorage : localStorage;
      inactive.removeItem('token');
      inactive.removeItem('user');
      active.setItem('token', token);
      active.setItem('user', JSON.stringify(user));
    },
    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    },
  },
});
