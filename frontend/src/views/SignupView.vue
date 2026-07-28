<script setup>
import { ref } from 'vue';
import { api } from '../api/client';

const full_name = ref('');
const company_email = ref('');
const password = ref('');
const error = ref('');
const message = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  message.value = '';
  loading.value = true;
  try {
    const { data } = await api.post('/api/auth/signup', {
      full_name: full_name.value,
      company_email: company_email.value,
      password: password.value,
    });
    message.value = data.message;
  } catch (e) {
    error.value = e.response?.data?.error || "Échec de l'inscription";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <h1>Créer un compte</h1>
    <form v-if="!message" @submit.prevent="submit">
      <div class="field">
        <label for="name">Nom complet</label>
        <input id="name" v-model="full_name" required />
      </div>
      <div class="field">
        <label for="email">Email professionnel</label>
        <input id="email" v-model="company_email" type="email" required autocomplete="username" />
      </div>
      <div class="field">
        <label for="password">Mot de passe</label>
        <input id="password" v-model="password" type="password" minlength="8" required autocomplete="new-password" />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button type="submit" :disabled="loading" style="width:100%">{{ loading ? 'Création…' : 'Créer le compte' }}</button>
    </form>
    <p v-else class="success-text">{{ message }}</p>
    <p class="muted" style="margin-top:16px"><RouterLink to="/login">Retour à la connexion</RouterLink></p>
  </div>
</template>
