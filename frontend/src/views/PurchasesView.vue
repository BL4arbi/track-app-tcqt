<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';

const purchases = ref([]);
const loading = ref(true);
const error = ref('');

const STATUS_LABELS = {
  a_commander: 'À commander',
  commande: 'Commandé',
  en_cours_livraison: 'En cours de livraison',
  recu: 'Reçu',
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR');
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get('/api/purchases');
    purchases.value = data.purchases;
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec du chargement des commandes';
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Commandes</h1>
      <button class="secondary" @click="load">Actualiser</button>
    </div>
    <p class="muted" style="margin-top:-8px">
      Tous les achats de toutes les tâches — les lignes surlignées signalent qu'une autre tâche a besoin de la même référence, pour éviter de commander en double.
    </p>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>
    <p v-else-if="!purchases.length" class="muted">Aucun achat pour l'instant.</p>

    <table v-else>
      <thead>
        <tr>
          <th>Statut</th>
          <th>Description</th>
          <th>Ref</th>
          <th>Qté</th>
          <th>Fournisseur</th>
          <th>Tâche</th>
          <th>Assigné à</th>
          <th>Machine</th>
          <th>Ajouté le</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in purchases" :key="p.id" :class="{ 'purchase-row--duplicate': p.other_tasks_count > 0 }">
          <td><span class="badge part-status-select" :class="p.status" style="display:inline-block">{{ STATUS_LABELS[p.status] }}</span></td>
          <td>
            {{ p.description }}
            <div v-if="p.other_tasks_count > 0" class="reminder-overdue" style="font-size:12px">
              ⚠ Aussi demandé par {{ p.other_tasks_count }} autre{{ p.other_tasks_count > 1 ? 's' : '' }} tâche{{ p.other_tasks_count > 1 ? 's' : '' }}
            </div>
          </td>
          <td>{{ p.ref || '—' }}</td>
          <td>{{ p.quantity }}</td>
          <td>
            <a v-if="p.supplier_link" :href="p.supplier_link" target="_blank" rel="noopener">{{ p.supplier_name }}</a>
            <template v-else>{{ p.supplier_name || '—' }}</template>
          </td>
          <td><RouterLink :to="`/tasks/${p.task_id}`">{{ p.task_title }}</RouterLink></td>
          <td>{{ p.assigned_user_name }}</td>
          <td>{{ p.machine || '—' }}</td>
          <td class="muted">{{ formatDate(p.created_at) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.purchase-row--duplicate { background: rgba(200, 16, 46, 0.06); }
</style>
