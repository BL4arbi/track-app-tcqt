<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api/client';
import { buildUserColorMap, initials } from '../utils/userColors';
import { buildMonthGrid, MONTH_NAMES_FR, WEEKDAY_NAMES_FR } from '../utils/calendarGrid';

const tasks = ref([]);
const users = ref([]);
const loading = ref(true);
const error = ref('');

const today = new Date();
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth());

const userColors = computed(() => buildUserColorMap(users.value));
const weeks = computed(() => buildMonthGrid(viewYear.value, viewMonth.value));

const tasksByDate = computed(() => {
  const map = new Map();
  for (const t of tasks.value) {
    if (!t.due_date) continue;
    if (!map.has(t.due_date)) map.set(t.due_date, []);
    map.get(t.due_date).push(t);
  }
  return map;
});

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [tasksRes, usersRes] = await Promise.all([
      api.get('/api/tasks/calendar'),
      api.get('/api/users/directory'),
    ]);
    tasks.value = tasksRes.data.tasks;
    users.value = usersRes.data.users;
  } catch (e) {
    error.value = e.response?.data?.error || 'Impossible de charger le calendrier';
  } finally {
    loading.value = false;
  }
}

function prevMonth() {
  if (viewMonth.value === 0) { viewMonth.value = 11; viewYear.value -= 1; }
  else viewMonth.value -= 1;
}
function nextMonth() {
  if (viewMonth.value === 11) { viewMonth.value = 0; viewYear.value += 1; }
  else viewMonth.value += 1;
}
function goToday() {
  viewYear.value = today.getFullYear();
  viewMonth.value = today.getMonth();
}

onMounted(load);
</script>

<template>
  <div>
    <div class="toolbar">
      <h1>Calendrier</h1>
      <div style="display:flex; gap:8px; align-items:center">
        <button class="secondary" @click="prevMonth">←</button>
        <strong style="min-width:160px; text-align:center; display:inline-block">
          {{ MONTH_NAMES_FR[viewMonth] }} {{ viewYear }}
        </strong>
        <button class="secondary" @click="nextMonth">→</button>
        <button class="secondary" @click="goToday">Aujourd'hui</button>
      </div>
    </div>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else>
      <div class="legend">
        <span v-for="u in users" :key="u.id" class="legend-item">
          <span class="legend-dot" :style="{ background: userColors.get(u.id) }"></span>
          {{ u.full_name }}
        </span>
        <span v-if="!users.length" class="muted">Aucun membre de l'équipe pour l'instant.</span>
      </div>

      <div class="calendar-grid">
        <div class="calendar-week-number">Sem.</div>
        <div v-for="wd in WEEKDAY_NAMES_FR" :key="wd" class="calendar-weekday">{{ wd }}</div>

        <template v-for="week in weeks" :key="week[0].dateKey">
          <div class="calendar-week-number">{{ week.weekNumber }}</div>
          <div
            v-for="cell in week"
            :key="cell.dateKey"
            class="calendar-cell"
            :class="{ 'calendar-cell--out': !cell.inMonth, 'calendar-cell--today': cell.isToday }"
          >
            <div class="calendar-cell-day">{{ cell.day }}</div>
            <RouterLink
              v-for="t in (tasksByDate.get(cell.dateKey) || [])"
              :key="t.id"
              :to="`/tasks/${t.id}`"
              class="calendar-chip"
              :style="{ background: userColors.get(t.assigned_user_id) }"
              :title="`${t.assigned_user_name} — ${t.client_name} — ${t.title}`"
            >
              {{ initials(t.assigned_user_name) }} · {{ t.title }}
            </RouterLink>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
