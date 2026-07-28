<script setup>
import { ref } from 'vue';
import { api } from '../api/client';

const company_email = ref('');
const message = ref('');
const loading = ref(false);

async function submit() {
  loading.value = true;
  try {
    const { data } = await api.post('/api/auth/forgot-password', { company_email: company_email.value });
    message.value = data.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <h1>Mot de passe oublié</h1>
    <form v-if="!message" @submit.prevent="submit">
      <div class="field">
        <label for="email">Email professionnel</label>
        <input id="email" v-model="company_email" type="email" required />
      </div>
      <button type="submit" :disabled="loading" style="width:100%">{{ loading ? 'Envoi…' : 'Envoyer le lien de réinitialisation' }}</button>
    </form>
    <p v-else class="success-text">{{ message }}</p>
    <p class="muted" style="margin-top:16px"><RouterLink to="/login">Retour à la connexion</RouterLink></p>
  </div>
</template>
