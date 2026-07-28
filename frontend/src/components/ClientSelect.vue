<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';

const props = defineProps({ modelValue: [Number, String] });
const emit = defineEmits(['update:modelValue']);

const clients = ref([]);
const addingNew = ref(false);
const newName = ref('');

async function load() {
  const { data } = await api.get('/api/clients');
  clients.value = data.clients;
}

async function addClient() {
  if (!newName.value.trim()) return;
  const { data } = await api.post('/api/clients', { name: newName.value.trim() });
  clients.value.push(data.client);
  emit('update:modelValue', data.client.id);
  newName.value = '';
  addingNew.value = false;
}

onMounted(load);
</script>

<template>
  <div>
    <select v-if="!addingNew" :value="modelValue" @change="emit('update:modelValue', Number($event.target.value))">
      <option value="" disabled selected>Sélectionner un client…</option>
      <option v-for="c in clients" :key="c.id" :value="c.id">{{ c.name }}</option>
    </select>
    <button v-if="!addingNew" type="button" class="link-button" style="margin-left:8px" @click="addingNew = true">+ nouveau client</button>

    <div v-else style="display:flex; gap:8px; align-items:center">
      <input v-model="newName" placeholder="Nom du nouveau client" />
      <button type="button" @click="addClient">Ajouter</button>
      <button type="button" class="secondary" @click="addingNew = false">Annuler</button>
    </div>
  </div>
</template>
