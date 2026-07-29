<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './store/auth';
import { setTheme } from './utils/theme';

const auth = useAuthStore();
const router = useRouter();
const isAuthenticated = computed(() => auth.isAuthenticated);

const theme = ref(document.documentElement.getAttribute('data-theme') || 'light');

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  setTheme(theme.value);
}

async function logout() {
  await auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <header v-if="isAuthenticated" class="topbar">
      <div class="topbar-brand">
        <img src="/logo.png" alt="Tacquet Industries" />
        SolidWorks Tracker
      </div>
      <nav class="topbar-nav">
        <RouterLink to="/">Tableau de bord</RouterLink>
        <RouterLink to="/my-tasks">Mes tâches</RouterLink>
        <RouterLink to="/calendar">Calendrier</RouterLink>
        <RouterLink v-if="auth.isManager" to="/admin">Admin</RouterLink>
      </nav>
      <div class="topbar-user">
        <button
          class="link-button"
          type="button"
          :title="theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode sombre'"
          @click="toggleTheme"
        >
          {{ theme === 'dark' ? 'Mode jour' : 'Mode sombre' }}
        </button>
        <span>{{ auth.user?.full_name }}</span>
        <button class="link-button" @click="logout">Déconnexion</button>
      </div>
    </header>
    <main class="page">
      <RouterView />
    </main>
  </div>
</template>
