<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './store/auth';

const auth = useAuthStore();
const router = useRouter();
const isAuthenticated = computed(() => auth.isAuthenticated);

function logout() {
  auth.logout();
  router.push({ name: 'login' });
}
</script>

<template>
  <div class="app-shell">
    <header v-if="isAuthenticated" class="topbar">
      <div class="topbar-brand">SolidWorks Tracker</div>
      <nav class="topbar-nav">
        <RouterLink to="/">Dashboard</RouterLink>
        <RouterLink to="/my-tasks">My Tasks</RouterLink>
      </nav>
      <div class="topbar-user">
        <span>{{ auth.user?.full_name }}</span>
        <button class="link-button" @click="logout">Log out</button>
      </div>
    </header>
    <main class="page">
      <RouterView />
    </main>
  </div>
</template>
