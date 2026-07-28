<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';

const route = useRoute();
const router = useRouter();
const new_password = ref('');
const error = ref('');
const message = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const { data } = await api.post('/api/auth/reset-password', {
      token: route.query.token,
      new_password: new_password.value,
    });
    message.value = data.message;
    setTimeout(() => router.push({ name: 'login' }), 1500);
  } catch (e) {
    error.value = e.response?.data?.error || 'Reset failed';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="auth-page">
    <h1>Reset password</h1>
    <form v-if="!message" @submit.prevent="submit">
      <div class="field">
        <label for="password">New password</label>
        <input id="password" v-model="new_password" type="password" minlength="8" required autocomplete="new-password" />
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
      <button type="submit" :disabled="loading" style="width:100%">{{ loading ? 'Saving…' : 'Set new password' }}</button>
    </form>
    <p v-else class="success-text">{{ message }}</p>
  </div>
</template>
