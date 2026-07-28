<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api/client';

const route = useRoute();
const status = ref('checking');
const message = ref('');

onMounted(async () => {
  const token = route.query.token;
  if (!token) {
    status.value = 'error';
    message.value = 'Jeton de vérification manquant.';
    return;
  }
  try {
    const { data } = await api.get('/api/auth/verify-email', { params: { token } });
    status.value = 'ok';
    message.value = data.message;
  } catch (e) {
    status.value = 'error';
    message.value = e.response?.data?.error || 'Échec de la vérification';
  }
});
</script>

<template>
  <div class="auth-page">
    <h1>Vérification de l'email</h1>
    <p v-if="status === 'checking'" class="muted">Vérification…</p>
    <p v-else-if="status === 'ok'" class="success-text">{{ message }}</p>
    <p v-else class="error-text">{{ message }}</p>
    <p class="muted" style="margin-top:16px"><RouterLink to="/login">Aller à la connexion</RouterLink></p>
  </div>
</template>
