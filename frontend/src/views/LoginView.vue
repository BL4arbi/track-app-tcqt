<script setup>
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const company_email = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const { data } = await api.post('/api/auth/login', { company_email: company_email.value, password: password.value });
    auth.setSession(data.token, data.user);
    router.push(route.query.redirect || { name: 'dashboard' });
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec de la connexion';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <h1>Connexion</h1>
    <form @submit.prevent="submit">
      <div class="field">
        <label for="email">Email professionnel</label>
        <input id="email" v-model="company_email" type="email" required autocomplete="username" />
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input id="password" v-model="password" type="password" required autocomplete="current-password" />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button type="submit" :disabled="loading" style="width:100%">{{ loading ? 'Connexion…' : 'Se connecter' }}</button>
    </form>
    <p class="muted" style="margin-top:16px">
      <RouterLink to="/forgot-password">Mot de passe oublié ?</RouterLink>
      &nbsp;·&nbsp;
      <RouterLink to="/signup">Créer un compte</RouterLink>
    </p>
  </div>
</template>
