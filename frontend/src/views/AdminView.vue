<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';

const auth = useAuthStore();

const overview = ref(null);
const users = ref([]);
const loading = ref(true);
const error = ref('');
const savingId = ref(null);

const STATUS_LABELS = { active: 'En cours', paused: 'En pause', done: 'Terminé' };

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [overviewRes, usersRes] = await Promise.all([
      api.get('/api/admin/overview'),
      api.get('/api/users'),
    ]);
    overview.value = overviewRes.data;
    users.value = usersRes.data.users;
  } catch (e) {
    error.value = e.response?.data?.error || "Échec du chargement des données d'administration";
  } finally {
    loading.value = false;
  }
}

async function updateUser(user, changes) {
  savingId.value = user.id;
  try {
    const { data } = await api.patch(`/api/users/${user.id}`, changes);
    Object.assign(user, data.user);
  } catch (e) {
    error.value = e.response?.data?.error || "Échec de la mise à jour de l'utilisateur";
  } finally {
    savingId.value = null;
  }
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('fr-FR');
}

onMounted(load);
</script>

<template>
  <div>
    <h1>Admin</h1>
    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else>
      <div class="card">
        <h2>Vue d'ensemble</h2>
        <div class="form-row" style="margin-bottom:16px">
          <div class="field"><label>Utilisateurs</label><div>{{ overview.totals.active_users }} actifs / {{ overview.totals.total_users }} au total</div></div>
          <div class="field"><label>Clients</label><div>{{ overview.totals.total_clients }}</div></div>
          <div class="field"><label>Tâches</label><div>{{ overview.totals.total_tasks }}</div></div>
        </div>

        <div class="form-row">
          <div style="flex:1">
            <h2 style="font-size:14px">Tâches par statut</h2>
            <table>
              <tbody>
                <tr v-for="s in overview.tasks_by_status" :key="s.status">
                  <td><span class="badge" :class="s.status">{{ STATUS_LABELS[s.status] }}</span></td>
                  <td>{{ s.count }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="flex:1">
            <h2 style="font-size:14px">Tâches actives par client</h2>
            <table>
              <tbody>
                <tr v-for="c in overview.tasks_by_client" :key="c.client_name">
                  <td>{{ c.client_name }}</td>
                  <td>{{ c.active_tasks }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="flex:1">
            <h2 style="font-size:14px">Tâches actives par personne</h2>
            <table>
              <tbody>
                <tr v-for="u in overview.tasks_by_user" :key="u.full_name">
                  <td>{{ u.full_name }}</td>
                  <td>{{ u.active_tasks }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <p class="muted" style="margin-top:12px">
          Des statistiques plus poussées (temps par étape, goulots d'étranglement) arriveront plus tard, une fois qu'il y aura plus d'historique.
        </p>
      </div>

      <div class="card">
        <h2>Équipe ({{ users.length }})</h2>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Vérifié</th>
              <th>Actif</th>
              <th>Arrivée</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.full_name }}</td>
              <td>{{ u.company_email }}</td>
              <td>
                <select
                  :value="u.role"
                  :disabled="savingId === u.id || u.id === auth.user.id"
                  @change="updateUser(u, { role: $event.target.value })"
                >
                  <option value="engineer">Ingénieur</option>
                  <option value="manager">Manager</option>
                </select>
              </td>
              <td>
                <span v-if="u.email_verified">Oui</span>
                <button
                  v-else
                  type="button"
                  class="link-button"
                  :disabled="savingId === u.id"
                  @click="updateUser(u, { email_verified: true })"
                  title="À utiliser si le lien de vérification par email n'a pas fonctionné"
                >
                  Non — marquer comme vérifié
                </button>
              </td>
              <td>
                <label style="display:flex; align-items:center; gap:6px; font-weight:normal">
                  <input
                    type="checkbox"
                    :checked="u.active"
                    :disabled="savingId === u.id || u.id === auth.user.id"
                    @change="updateUser(u, { active: $event.target.checked })"
                  />
                  {{ u.active ? 'Actif' : 'Désactivé' }}
                </label>
              </td>
              <td>{{ formatDate(u.created_at) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
