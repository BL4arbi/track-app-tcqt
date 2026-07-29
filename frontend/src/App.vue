<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './store/auth';

const auth = useAuthStore();
const router = useRouter();
const isAuthenticated = computed(() => auth.isAuthenticated);

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
        <span>{{ auth.user?.full_name }}</span>
        <button class="link-button" @click="logout">Déconnexion</button>
      </div>
    </header>
    <main class="page">
      <RouterView />
    </main>
  </div>
</template>
