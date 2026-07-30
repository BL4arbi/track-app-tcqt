<script setup>
import { ref, computed, reactive, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api/client';
import { useAuthStore } from '../store/auth';
import { WORKFLOW_STEPS } from '../utils/workflowSteps';
import ModelViewer from '../components/ModelViewer.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const task = ref(null);
const history = ref([]);
const documents = ref([]);
const subtasks = ref([]);
const parts = ref([]);
const newPartMachine = ref('');
const newPartName = ref('');
const newPartComment = ref('');
const newPartQuantity = ref(1);
const newPartBrut = ref('');
const addingPart = ref(false);
const partError = ref('');
const editingPartId = ref(null);
const editPartMachine = ref('');
const editPartName = ref('');
const editPartComment = ref('');
const editPartQuantity = ref(1);
const editPartBrut = ref('');
const savingPart = ref(false);
const uploadingPartFileFor = ref(null);

const purchases = ref([]);
const suppliers = ref([]);
const newPurchaseMachine = ref('');
const newPurchaseDescription = ref('');
const newPurchaseQuantity = ref(1);
const newPurchaseRef = ref('');
const newPurchaseSupplierChoice = ref('');
const newPurchaseSupplierNewName = ref('');
const addingPurchase = ref(false);
const purchaseError = ref('');
const editingPurchaseId = ref(null);
const editPurchaseDraft = reactive({});
const savingPurchase = ref(false);

const teamMembers = ref([]);
const parentOptions = ref([]);
const loading = ref(true);
const error = ref('');

const nativeFiles = ref([]);
const previewFile = ref(null);
const previewModel = ref(null);
const uploadError = ref('');
const uploading = ref(false);

function addNativeFiles(fileList) {
  nativeFiles.value = [...nativeFiles.value, ...Array.from(fileList)];
}
function removeNativeFile(index) {
  nativeFiles.value = nativeFiles.value.filter((_, i) => i !== index);
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
const generatingPreview = ref(false);
const generatePreviewError = ref('');

const addingPreviewFor = ref(null);
const previewOnlyFile = ref(null);
const previewOnlyError = ref('');
const previewOnlySaving = ref(false);

const deletingId = ref(null);
const deleteError = ref('');

const viewingModelFor = ref(null);
const viewingPdfFor = ref(null);

const editing = ref(false);
const editDraft = reactive({});
const saving = ref(false);
const saveError = ref('');

const deletingTask = ref(false);
const deleteTaskError = ref('');

const settingReminder = ref(false);
const reminderDraft = ref('');
const savingReminder = ref(false);
const reminderError = ref('');

const STATUS_LABELS = { active: 'En cours', paused: 'En pause', done: 'Terminé' };
const PART_STATUS_LABELS = {
  a_commander: 'À commander',
  commande: 'Commandé (non livré)',
  en_fabrication: 'En fabrication',
  fabrique: 'Fabriqué',
};
const PURCHASE_STATUS_LABELS = {
  a_commander: 'À commander',
  commande: 'Commandé',
  en_cours_livraison: 'En cours de livraison',
  recu: 'Reçu',
};
const NO_MACHINE = '— Sans machine —';

// Parts are ordered by machine from the backend (NULLS LAST) — group them
// into sections here for display, matching the team's own spreadsheet
// layout (a header row per machine, its pieces listed under it).
const partsByMachine = computed(() => {
  const groups = [];
  let current = null;
  for (const p of parts.value) {
    const key = p.machine || NO_MACHINE;
    if (!current || current.machine !== key) {
      current = { machine: key, items: [] };
      groups.push(current);
    }
    current.items.push(p);
  }
  return groups;
});

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR');
}
function formatDueDate(dateKey) {
  if (!dateKey) return '—';
  const [y, m, d] = dateKey.split('-');
  return `${d}/${m}/${y}`;
}
function statusLabel(s) {
  return s ? STATUS_LABELS[s] : '—';
}

const currentStepIndex = computed(() => task.value ? WORKFLOW_STEPS.indexOf(task.value.current_step) : -1);
const canEdit = computed(() => task.value && (auth.isManager || task.value.assigned_user_id === auth.user?.id));

function previewUrl(doc) {
  if (!doc.preview_image_path) return null;
  return `${api.defaults.baseURL}/uploads/${doc.preview_image_path}`;
}

function isPdfPreview(doc) {
  return !!doc.preview_image_path && doc.preview_image_path.toLowerCase().endsWith('.pdf');
}

function modelUrl(doc) {
  if (!doc.model_path) return null;
  return `${api.defaults.baseURL}/uploads/${doc.model_path}`;
}

function downloadUrl(doc) {
  return `${api.defaults.baseURL}/api/documents/${doc.id}/download`;
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const requests = [api.get(`/api/tasks/${route.params.id}`), api.get('/api/tasks/mine'), api.get('/api/suppliers')];
    if (auth.isManager) requests.push(api.get('/api/users/directory'));
    const [taskRes, mineRes, suppliersRes, teamRes] = await Promise.all(requests);
    task.value = taskRes.data.task;
    history.value = taskRes.data.history;
    documents.value = taskRes.data.documents;
    subtasks.value = taskRes.data.subtasks;
    parts.value = taskRes.data.parts;
    purchases.value = taskRes.data.purchases;
    suppliers.value = suppliersRes.data.suppliers;
    parentOptions.value = mineRes.data.tasks.filter((t) => t.id !== task.value.id);
    if (teamRes) teamMembers.value = teamRes.data.users;
  } catch (e) {
    error.value = e.response?.data?.error || 'Échec du chargement de la tâche';
  } finally {
    loading.value = false;
  }
}

function startEdit() {
  Object.assign(editDraft, {
    title: task.value.title,
    label: task.value.label || '',
    notes: task.value.notes || '',
    current_step: task.value.current_step || '',
    due_date: task.value.due_date || '',
    final_date: task.value.final_date || '',
    parent_task_id: task.value.parent_task_id || '',
    status: task.value.status,
    assigned_user_id: task.value.assigned_user_id,
  });
  saveError.value = '';
  editing.value = true;
}

async function saveEdit() {
  saving.value = true;
  saveError.value = '';
  try {
    await api.patch(`/api/tasks/${route.params.id}`, {
      ...editDraft,
      label: editDraft.label || null,
      notes: editDraft.notes || null,
      due_date: editDraft.due_date || null,
      final_date: editDraft.final_date || null,
      parent_task_id: editDraft.parent_task_id || null,
    });
    editing.value = false;
    await load();
  } catch (e) {
    saveError.value = e.response?.data?.error || "Échec de l'enregistrement";
  } finally {
    saving.value = false;
  }
}

function startSetReminder() {
  reminderDraft.value = task.value.reminder_date || '';
  reminderError.value = '';
  settingReminder.value = true;
}

async function saveReminder() {
  savingReminder.value = true;
  reminderError.value = '';
  try {
    await api.patch(`/api/tasks/${route.params.id}`, { reminder_date: reminderDraft.value || null });
    settingReminder.value = false;
    await load();
  } catch (e) {
    reminderError.value = e.response?.data?.error || "Échec de l'enregistrement du rappel";
  } finally {
    savingReminder.value = false;
  }
}

async function clearReminder() {
  savingReminder.value = true;
  try {
    await api.patch(`/api/tasks/${route.params.id}`, { reminder_date: null });
    settingReminder.value = false;
    await load();
  } finally {
    savingReminder.value = false;
  }
}

async function upload() {
  uploadError.value = '';
  if (!nativeFiles.value.length) {
    uploadError.value = 'Sélectionnez au moins un fichier à envoyer';
    return;
  }
  const form = new FormData();
  for (const f of nativeFiles.value) form.append('file', f);
  if (previewFile.value) form.append('previewImage', previewFile.value);
  if (previewModel.value) form.append('previewModel', previewModel.value);

  uploading.value = true;
  try {
    await api.post(`/api/tasks/${route.params.id}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    nativeFiles.value = [];
    previewFile.value = null;
    previewModel.value = null;
    await load();
  } catch (e) {
    uploadError.value = e.response?.data?.error || "Échec de l'envoi";
  } finally {
    uploading.value = false;
  }
}

function base64ToBytes(base64) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return bytes;
}

async function deleteTask() {
  if (!confirm(`Supprimer la tâche "${task.value.title}" ? Cette action est irréversible et supprime aussi ses documents.`)) return;
  deletingTask.value = true;
  deleteTaskError.value = '';
  try {
    await api.delete(`/api/tasks/${route.params.id}`);
    router.push({ name: 'my-tasks' });
  } catch (e) {
    deleteTaskError.value = e.response?.data?.error || 'Échec de la suppression';
    deletingTask.value = false;
  }
}

async function generatePreviewFromSolidWorks() {
  generatePreviewError.value = '';
  if (!nativeFiles.value.length) {
    generatePreviewError.value = "Sélectionnez d'abord le fichier natif";
    return;
  }
  const localPath = window.electronAPI.getPathForFile(nativeFiles.value[0]);
  if (!localPath) {
    generatePreviewError.value = "Impossible de résoudre le chemin du fichier sélectionné";
    return;
  }
  generatingPreview.value = true;
  try {
    const result = await window.electronAPI.generateSolidWorksPreview(localPath);
    if (!result.success) {
      generatePreviewError.value = result.error || 'Échec de la génération automatique';
      return;
    }
    previewFile.value = new File([base64ToBytes(result.base64)], 'apercu-solidworks.png', { type: 'image/png' });
    if (result.modelBase64) {
      previewModel.value = new File([base64ToBytes(result.modelBase64)], 'modele-solidworks.stl', { type: 'model/stl' });
    } else if (result.warning) {
      generatePreviewError.value = result.warning;
    }
  } catch (e) {
    generatePreviewError.value = e.message || 'Échec de la génération automatique';
  } finally {
    generatingPreview.value = false;
  }
}

function startAddPreview(docId) {
  addingPreviewFor.value = docId;
  previewOnlyFile.value = null;
  previewOnlyError.value = '';
}

async function saveAddPreview(docId) {
  if (!previewOnlyFile.value) {
    previewOnlyError.value = 'Sélectionnez une image';
    return;
  }
  const form = new FormData();
  form.append('previewImage', previewOnlyFile.value);
  previewOnlySaving.value = true;
  previewOnlyError.value = '';
  try {
    await api.patch(`/api/documents/${docId}/preview`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    addingPreviewFor.value = null;
    await load();
  } catch (e) {
    previewOnlyError.value = e.response?.data?.error || "Échec de l'envoi";
  } finally {
    previewOnlySaving.value = false;
  }
}

async function deleteDocument(doc) {
  if (!confirm(`Supprimer "${doc.original_filename}" ? Cette action est irréversible.`)) return;
  deletingId.value = doc.id;
  deleteError.value = '';
  try {
    await api.delete(`/api/documents/${doc.id}`);
    await load();
  } catch (e) {
    deleteError.value = e.response?.data?.error || 'Échec de la suppression';
  } finally {
    deletingId.value = null;
  }
}

function toggleModel(docId) {
  viewingModelFor.value = viewingModelFor.value === docId ? null : docId;
}

function togglePdf(docId) {
  viewingPdfFor.value = viewingPdfFor.value === docId ? null : docId;
}

async function addPart() {
  partError.value = '';
  if (!newPartName.value.trim()) {
    partError.value = 'Le nom de la pièce est obligatoire';
    return;
  }
  addingPart.value = true;
  try {
    await api.post(`/api/tasks/${route.params.id}/parts`, {
      machine: newPartMachine.value.trim() || null,
      name: newPartName.value.trim(),
      comment: newPartComment.value.trim() || null,
      quantity: newPartQuantity.value || 1,
      brut: newPartBrut.value.trim() || null,
    });
    newPartMachine.value = '';
    newPartName.value = '';
    newPartComment.value = '';
    newPartQuantity.value = 1;
    newPartBrut.value = '';
    await load();
  } catch (e) {
    partError.value = e.response?.data?.error || "Échec de l'ajout";
  } finally {
    addingPart.value = false;
  }
}

function partCadUrl(part) {
  return `${api.defaults.baseURL}/api/tasks/parts/${part.id}/cad/download`;
}
function partPlanUrl(part) {
  return `${api.defaults.baseURL}/api/tasks/parts/${part.id}/plan/download`;
}

async function uploadPartFile(part, kind, file) {
  if (!file) return;
  uploadingPartFileFor.value = `${part.id}-${kind}`;
  const form = new FormData();
  form.append('file', file);
  try {
    await api.patch(`/api/tasks/parts/${part.id}/${kind}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    await load();
  } catch (e) {
    partError.value = e.response?.data?.error || "Échec de l'envoi du fichier";
  } finally {
    uploadingPartFileFor.value = null;
  }
}

async function updatePartStatus(part, status) {
  await api.patch(`/api/tasks/parts/${part.id}`, { status });
  await load();
}

async function deletePart(part) {
  if (!confirm(`Supprimer "${part.name}" de la liste des pièces à fabriquer ?`)) return;
  await api.delete(`/api/tasks/parts/${part.id}`);
  await load();
}

function startEditPart(part) {
  editingPartId.value = part.id;
  editPartMachine.value = part.machine || '';
  editPartName.value = part.name;
  editPartComment.value = part.comment || '';
  editPartQuantity.value = part.quantity;
  editPartBrut.value = part.brut || '';
}

function cancelEditPart() {
  editingPartId.value = null;
}

async function saveEditPart(partId) {
  savingPart.value = true;
  try {
    await api.patch(`/api/tasks/parts/${partId}`, {
      machine: editPartMachine.value.trim() || null,
      name: editPartName.value.trim(),
      comment: editPartComment.value.trim() || null,
      quantity: editPartQuantity.value || 1,
      brut: editPartBrut.value.trim() || null,
    });
    editingPartId.value = null;
    await load();
  } finally {
    savingPart.value = false;
  }
}

// Achat: things to buy for a task, separate from the parts checklist.
async function resolveSupplierId() {
  if (newPurchaseSupplierChoice.value === '__new__') {
    const name = newPurchaseSupplierNewName.value.trim();
    if (!name) return null;
    const { data } = await api.post('/api/suppliers', { name });
    return data.supplier.id;
  }
  return newPurchaseSupplierChoice.value || null;
}

async function addPurchase() {
  purchaseError.value = '';
  if (!newPurchaseDescription.value.trim()) {
    purchaseError.value = "La description de l'achat est obligatoire";
    return;
  }
  addingPurchase.value = true;
  try {
    const supplier_id = await resolveSupplierId();
    await api.post(`/api/tasks/${route.params.id}/purchases`, {
      machine: newPurchaseMachine.value.trim() || null,
      description: newPurchaseDescription.value.trim(),
      quantity: newPurchaseQuantity.value || 1,
      ref: newPurchaseRef.value.trim() || null,
      supplier_id,
    });
    newPurchaseMachine.value = '';
    newPurchaseDescription.value = '';
    newPurchaseQuantity.value = 1;
    newPurchaseRef.value = '';
    newPurchaseSupplierChoice.value = '';
    newPurchaseSupplierNewName.value = '';
    await load();
  } catch (e) {
    purchaseError.value = e.response?.data?.error || "Échec de l'ajout";
  } finally {
    addingPurchase.value = false;
  }
}

async function updatePurchaseStatus(purchase, status) {
  await api.patch(`/api/tasks/purchases/${purchase.id}`, { status });
  await load();
}

async function deletePurchase(purchase) {
  if (!confirm(`Supprimer l'achat "${purchase.description}" ?`)) return;
  await api.delete(`/api/tasks/purchases/${purchase.id}`);
  await load();
}

function startEditPurchase(purchase) {
  editingPurchaseId.value = purchase.id;
  Object.assign(editPurchaseDraft, {
    machine: purchase.machine || '',
    description: purchase.description,
    quantity: purchase.quantity,
    ref: purchase.ref || '',
  });
}

function cancelEditPurchase() {
  editingPurchaseId.value = null;
}

async function saveEditPurchase(purchaseId) {
  savingPurchase.value = true;
  try {
    await api.patch(`/api/tasks/purchases/${purchaseId}`, {
      machine: editPurchaseDraft.machine.trim() || null,
      description: editPurchaseDraft.description.trim(),
      quantity: editPurchaseDraft.quantity || 1,
      ref: editPurchaseDraft.ref.trim() || null,
    });
    editingPurchaseId.value = null;
    await load();
  } finally {
    savingPurchase.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div>
    <button type="button" class="link-button back-link" @click="router.back()">← Retour</button>

    <p v-if="loading" class="muted">Chargement…</p>
    <p v-else-if="error" class="error-text">{{ error }}</p>

    <template v-else-if="task">
      <div class="toolbar">
        <div>
          <h1 style="margin-bottom:2px">{{ task.title }}</h1>
          <div v-if="task.label" class="muted" style="font-size:15px">{{ task.label }}</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center">
          <span class="badge" :class="task.status">{{ statusLabel(task.status) }}</span>
          <button v-if="canEdit && !editing" class="secondary" @click="startEdit">Modifier</button>
          <button
            v-if="canEdit && !editing"
            type="button"
            class="secondary"
            style="color:var(--danger); border-color:var(--danger)"
            :disabled="deletingTask"
            @click="deleteTask"
          >
            {{ deletingTask ? 'Suppression…' : 'Supprimer la tâche' }}
          </button>
        </div>
      </div>
      <p v-if="deleteTaskError" class="error-text">{{ deleteTaskError }}</p>

      <div class="card">
        <h2>Chronologie</h2>
        <div v-if="currentStepIndex === -1" class="muted">Étape libre (hors chronologie standard) : {{ task.current_step || '—' }}</div>
        <ol v-else class="stepper">
          <li
            v-for="(s, i) in WORKFLOW_STEPS"
            :key="s"
            class="stepper-step"
            :class="{ done: i < currentStepIndex, current: i === currentStepIndex, upcoming: i > currentStepIndex }"
          >
            <span class="stepper-dot">{{ i < currentStepIndex ? '✓' : i + 1 }}</span>
            <span class="stepper-label">{{ s }}</span>
          </li>
        </ol>
      </div>

      <div class="card">
        <template v-if="!editing">
          <p><strong>Client :</strong> {{ task.client_name }}</p>
          <p><strong>Assigné à :</strong> {{ task.assigned_user_name }}</p>
          <p><strong>Étape actuelle :</strong> {{ task.current_step || '—' }}</p>
          <p><strong>Étape suivante :</strong> {{ task.next_step || '—' }}</p>
          <p><strong>Date exécution chantier :</strong> {{ formatDueDate(task.due_date) }}</p>
          <p><strong>Date finale :</strong> {{ formatDueDate(task.final_date) }}</p>
          <p v-if="task.parent_task_id">
            <strong>Tâche parente :</strong>
            <RouterLink :to="`/tasks/${task.parent_task_id}`">{{ task.parent_title }}</RouterLink>
          </p>
          <div v-if="task.notes" style="margin:12px 0">
            <strong>Notes :</strong>
            <div class="muted" style="white-space:pre-wrap; margin-top:4px">{{ task.notes }}</div>
          </div>

          <div style="margin:12px 0">
            <strong>Rappel :</strong>
            <span v-if="!settingReminder">
              {{ task.reminder_date ? formatDueDate(task.reminder_date) : '—' }}
              <button v-if="canEdit" type="button" class="link-button" @click="startSetReminder">
                {{ task.reminder_date ? 'Modifier' : 'Définir un rappel' }}
              </button>
            </span>
            <span v-else style="display:inline-flex; gap:8px; align-items:center">
              <input v-model="reminderDraft" type="date" />
              <button type="button" :disabled="savingReminder" @click="saveReminder">Enregistrer</button>
              <button v-if="task.reminder_date" type="button" class="secondary" :disabled="savingReminder" @click="clearReminder">Supprimer</button>
              <button type="button" class="secondary" @click="settingReminder = false">Annuler</button>
            </span>
            <p v-if="reminderError" class="error-text">{{ reminderError }}</p>
          </div>

          <p class="muted">Dernière mise à jour {{ formatDate(task.updated_at) }}</p>
        </template>

        <form v-else @submit.prevent="saveEdit">
          <div class="form-row">
            <div class="field">
              <label>Numéro d'affaire</label>
              <input v-model="editDraft.title" required />
            </div>
            <div class="field">
              <label>Titre</label>
              <input v-model="editDraft.label" placeholder="ex. Banc essai XL" />
            </div>
            <div class="field">
              <label>Statut</label>
              <select v-model="editDraft.status">
                <option value="active">En cours</option>
                <option value="paused">En pause</option>
                <option value="done">Terminé</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="field" style="flex:1">
              <label>Notes</label>
              <textarea v-model="editDraft.notes" rows="3" placeholder="Commentaire général sur la tâche"></textarea>
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Étape actuelle</label>
              <select v-model="editDraft.current_step">
                <option value="">—</option>
                <option v-for="s in WORKFLOW_STEPS" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
            <div class="field">
              <label>Date exécution chantier</label>
              <input v-model="editDraft.due_date" type="date" />
            </div>
            <div class="field">
              <label>Date finale</label>
              <input v-model="editDraft.final_date" type="date" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Tâche parente</label>
              <select v-model="editDraft.parent_task_id">
                <option value="">— aucune —</option>
                <option v-for="pt in parentOptions" :key="pt.id" :value="pt.id">{{ pt.title }}</option>
              </select>
            </div>
            <div v-if="auth.isManager" class="field">
              <label>Assigné à</label>
              <select v-model="editDraft.assigned_user_id">
                <option v-for="m in teamMembers" :key="m.id" :value="m.id">{{ m.full_name }}</option>
              </select>
            </div>
          </div>
          <p v-if="saveError" class="error-text">{{ saveError }}</p>
          <div style="display:flex; gap:8px">
            <button type="submit" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer' }}</button>
            <button type="button" class="secondary" @click="editing = false">Annuler</button>
          </div>
        </form>
      </div>

      <div v-if="subtasks.length" class="card">
        <h2>Sous-tâches ({{ subtasks.length }})</h2>
        <table>
          <tbody>
            <tr v-for="st in subtasks" :key="st.id">
              <td><RouterLink :to="`/tasks/${st.id}`">{{ st.title }}</RouterLink></td>
              <td><span class="badge" :class="st.status">{{ statusLabel(st.status) }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="card">
        <h2>Pièces à fabriquer ({{ parts.length }})</h2>
        <div v-if="!parts.length" class="muted">Aucune pièce à fabriquer en interne pour l'instant.</div>
        <table v-else>
          <thead>
            <tr>
              <th style="width:1%">Statut</th>
              <th>Pièce</th>
              <th>Qté</th>
              <th>Brut</th>
              <th>CAO</th>
              <th>Plan</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in partsByMachine" :key="group.machine">
              <tr>
                <td colspan="7" class="machine-group-header">{{ group.machine }}</td>
              </tr>
              <template v-for="p in group.items" :key="p.id">
                <tr v-if="editingPartId !== p.id">
                  <td style="white-space:nowrap">
                    <select
                      class="part-status-select"
                      :class="p.status"
                      :disabled="!canEdit"
                      :value="p.status"
                      @change="updatePartStatus(p, $event.target.value)"
                    >
                      <option v-for="(lbl, val) in PART_STATUS_LABELS" :key="val" :value="val">{{ lbl }}</option>
                    </select>
                  </td>
                  <td :style="{ textDecoration: p.status === 'fabrique' ? 'line-through' : 'none' }">
                    {{ p.name }}
                    <div v-if="p.comment" class="muted">{{ p.comment }}</div>
                  </td>
                  <td>{{ p.quantity }}</td>
                  <td>{{ p.brut || '—' }}</td>
                  <td style="white-space:nowrap">
                    <a v-if="p.cad_filename" :href="partCadUrl(p)" :title="p.cad_filename">{{ p.cad_filename }}</a>
                    <span v-else class="muted">—</span>
                    <template v-if="canEdit">
                      <input type="file" :id="`cad-input-${p.id}`" style="display:none" @change="uploadPartFile(p, 'cad', $event.target.files[0]); $event.target.value = ''" />
                      <label :for="`cad-input-${p.id}`" class="link-button" style="margin-left:6px; cursor:pointer">
                        {{ uploadingPartFileFor === `${p.id}-cad` ? '…' : (p.cad_filename ? 'Remplacer' : '+ Ajouter') }}
                      </label>
                    </template>
                  </td>
                  <td style="white-space:nowrap">
                    <a v-if="p.plan_filename" :href="partPlanUrl(p)" :title="p.plan_filename">{{ p.plan_filename }}</a>
                    <span v-else class="muted">—</span>
                    <template v-if="canEdit">
                      <input type="file" :id="`plan-input-${p.id}`" style="display:none" @change="uploadPartFile(p, 'plan', $event.target.files[0]); $event.target.value = ''" />
                      <label :for="`plan-input-${p.id}`" class="link-button" style="margin-left:6px; cursor:pointer">
                        {{ uploadingPartFileFor === `${p.id}-plan` ? '…' : (p.plan_filename ? 'Remplacer' : '+ Ajouter') }}
                      </label>
                    </template>
                  </td>
                  <td style="text-align:right; white-space:nowrap">
                    <button v-if="canEdit" type="button" class="link-button" @click="startEditPart(p)">Modifier</button>
                    <button v-if="canEdit" type="button" class="link-button" style="color:var(--danger); margin-left:8px" @click="deletePart(p)">Supprimer</button>
                  </td>
                </tr>
                <tr v-else>
                  <td colspan="7">
                    <div class="form-row">
                      <div class="field">
                        <label style="font-size:13px; font-weight:600">Machine</label>
                        <input v-model="editPartMachine" placeholder="ex. MACHINE ORBITALE 8" />
                      </div>
                      <div class="field">
                        <label style="font-size:13px; font-weight:600">Pièce à fabriquer</label>
                        <input v-model="editPartName" />
                      </div>
                      <div class="field">
                        <label style="font-size:13px; font-weight:600">Qté</label>
                        <input v-model.number="editPartQuantity" type="number" min="1" style="width:70px" />
                      </div>
                    </div>
                    <div class="form-row">
                      <div class="field">
                        <label style="font-size:13px; font-weight:600">Brut</label>
                        <input v-model="editPartBrut" placeholder="ex. Plat étiré 80x30" />
                      </div>
                      <div class="field">
                        <label style="font-size:13px; font-weight:600">Commentaire</label>
                        <input v-model="editPartComment" placeholder="(facultatif)" />
                      </div>
                    </div>
                    <div style="display:flex; gap:8px">
                      <button type="button" :disabled="savingPart" @click="saveEditPart(p.id)">Enregistrer</button>
                      <button type="button" class="secondary" @click="cancelEditPart">Annuler</button>
                    </div>
                  </td>
                </tr>
              </template>
            </template>
          </tbody>
        </table>
        <form v-if="canEdit" @submit.prevent="addPart" style="margin-top:12px">
          <div class="form-row">
            <div class="field">
              <label>Machine</label>
              <input v-model="newPartMachine" placeholder="ex. MACHINE ORBITALE 8" />
            </div>
            <div class="field">
              <label>Pièce à fabriquer</label>
              <input v-model="newPartName" placeholder="ex. Bride support" />
            </div>
            <div class="field">
              <label>Qté</label>
              <input v-model.number="newPartQuantity" type="number" min="1" style="width:70px" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Brut (matière à commander)</label>
              <input v-model="newPartBrut" placeholder="ex. Plat étiré 80x30" />
            </div>
            <div class="field">
              <label>Commentaire (facultatif)</label>
              <input v-model="newPartComment" placeholder="ex. Alu 6mm, 2 exemplaires" />
            </div>
          </div>
          <p v-if="partError" class="error-text">{{ partError }}</p>
          <button type="submit" :disabled="addingPart">{{ addingPart ? 'Ajout…' : 'Ajouter' }}</button>
        </form>
      </div>

      <div class="card">
        <h2>Achat ({{ purchases.length }})</h2>
        <div v-if="!purchases.length" class="muted">Aucun achat pour l'instant.</div>
        <table v-else>
          <thead>
            <tr>
              <th style="width:1%">Statut</th>
              <th>Description</th>
              <th>Machine</th>
              <th>Qté</th>
              <th>Ref</th>
              <th>Fournisseur</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <template v-for="pu in purchases" :key="pu.id">
              <tr v-if="editingPurchaseId !== pu.id">
                <td style="white-space:nowrap">
                  <select
                    class="part-status-select"
                    :class="pu.status"
                    :disabled="!canEdit"
                    :value="pu.status"
                    @change="updatePurchaseStatus(pu, $event.target.value)"
                  >
                    <option v-for="(lbl, val) in PURCHASE_STATUS_LABELS" :key="val" :value="val">{{ lbl }}</option>
                  </select>
                </td>
                <td>{{ pu.description }}</td>
                <td>{{ pu.machine || '—' }}</td>
                <td>{{ pu.quantity }}</td>
                <td>{{ pu.ref || '—' }}</td>
                <td>
                  <a v-if="pu.supplier_link" :href="pu.supplier_link" target="_blank" rel="noopener">{{ pu.supplier_name }}</a>
                  <template v-else>{{ pu.supplier_name || '—' }}</template>
                </td>
                <td style="text-align:right; white-space:nowrap">
                  <button v-if="canEdit" type="button" class="link-button" @click="startEditPurchase(pu)">Modifier</button>
                  <button v-if="canEdit" type="button" class="link-button" style="color:var(--danger); margin-left:8px" @click="deletePurchase(pu)">Supprimer</button>
                </td>
              </tr>
              <tr v-else>
                <td colspan="7">
                  <div class="form-row">
                    <div class="field">
                      <label style="font-size:13px; font-weight:600">Description</label>
                      <input v-model="editPurchaseDraft.description" />
                    </div>
                    <div class="field">
                      <label style="font-size:13px; font-weight:600">Machine</label>
                      <input v-model="editPurchaseDraft.machine" />
                    </div>
                    <div class="field">
                      <label style="font-size:13px; font-weight:600">Qté</label>
                      <input v-model.number="editPurchaseDraft.quantity" type="number" min="1" style="width:70px" />
                    </div>
                    <div class="field">
                      <label style="font-size:13px; font-weight:600">Ref</label>
                      <input v-model="editPurchaseDraft.ref" />
                    </div>
                  </div>
                  <div style="display:flex; gap:8px">
                    <button type="button" :disabled="savingPurchase" @click="saveEditPurchase(pu.id)">Enregistrer</button>
                    <button type="button" class="secondary" @click="cancelEditPurchase">Annuler</button>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
        <form v-if="canEdit" @submit.prevent="addPurchase" style="margin-top:12px">
          <div class="form-row">
            <div class="field">
              <label>Description</label>
              <input v-model="newPurchaseDescription" placeholder="ex. Vis M4x2x80" />
            </div>
            <div class="field">
              <label>Machine (facultatif)</label>
              <input v-model="newPurchaseMachine" placeholder="ex. MACHINE ORBITALE 8" />
            </div>
            <div class="field">
              <label>Qté</label>
              <input v-model.number="newPurchaseQuantity" type="number" min="1" style="width:70px" />
            </div>
          </div>
          <div class="form-row">
            <div class="field">
              <label>Ref</label>
              <input v-model="newPurchaseRef" placeholder="ex. 22400-0125250060" />
            </div>
            <div class="field">
              <label>Fournisseur</label>
              <select v-model="newPurchaseSupplierChoice">
                <option value="">— aucun —</option>
                <option v-for="s in suppliers" :key="s.id" :value="s.id">{{ s.name }}</option>
                <option value="__new__">+ Nouveau fournisseur…</option>
              </select>
            </div>
            <div v-if="newPurchaseSupplierChoice === '__new__'" class="field">
              <label>Nom du nouveau fournisseur</label>
              <input v-model="newPurchaseSupplierNewName" placeholder="ex. NORELEM" />
            </div>
          </div>
          <p v-if="purchaseError" class="error-text">{{ purchaseError }}</p>
          <button type="submit" :disabled="addingPurchase">{{ addingPurchase ? 'Ajout…' : 'Ajouter' }}</button>
        </form>
      </div>

      <div class="card">
        <h2>Documents</h2>
        <p v-if="deleteError" class="error-text">{{ deleteError }}</p>
        <div v-if="!documents.length" class="muted">Aucun document envoyé pour l'instant.</div>
        <template v-for="doc in documents" :key="doc.id">
          <div class="doc-row">
            <img v-if="previewUrl(doc) && !isPdfPreview(doc)" :src="previewUrl(doc)" class="preview-thumb" :alt="doc.original_filename" />
            <div v-else-if="isPdfPreview(doc)" class="preview-thumb" style="display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">PDF</div>
            <div v-else class="preview-thumb" style="display:flex;align-items:center;justify-content:center;font-size:11px" >aucun aperçu</div>
            <div style="flex:1">
              <div>{{ doc.original_filename }}</div>
              <div class="muted">{{ doc.file_type.toUpperCase() }} · envoyé par {{ doc.uploaded_by }} · {{ formatDate(doc.uploaded_at) }}</div>
              <template v-if="!doc.preview_image_path && canEdit">
                <div v-if="addingPreviewFor !== doc.id">
                  <button type="button" class="link-button" @click="startAddPreview(doc.id)">+ ajouter un aperçu</button>
                </div>
                <div v-else style="display:flex; gap:8px; align-items:center; margin-top:6px">
                  <input type="file" @change="previewOnlyFile = $event.target.files[0]" />
                  <button type="button" :disabled="previewOnlySaving" @click="saveAddPreview(doc.id)">{{ previewOnlySaving ? 'Envoi…' : 'Envoyer' }}</button>
                  <button type="button" class="secondary" @click="addingPreviewFor = null">Annuler</button>
                </div>
                <p v-if="addingPreviewFor === doc.id && previewOnlyError" class="error-text">{{ previewOnlyError }}</p>
              </template>
            </div>
            <div style="display:flex; gap:12px; align-items:center; white-space:nowrap">
              <button v-if="isPdfPreview(doc)" type="button" class="link-button" @click="togglePdf(doc.id)">
                {{ viewingPdfFor === doc.id ? "Fermer l'aperçu" : "Voir l'aperçu PDF" }}
              </button>
              <button v-if="doc.model_path" type="button" class="link-button" @click="toggleModel(doc.id)">
                {{ viewingModelFor === doc.id ? 'Fermer la vue 3D' : 'Voir en 3D' }}
              </button>
              <a :href="downloadUrl(doc)">Télécharger</a>
              <button
                v-if="canEdit"
                type="button"
                class="link-button"
                style="color:var(--danger)"
                :disabled="deletingId === doc.id"
                @click="deleteDocument(doc)"
              >
                {{ deletingId === doc.id ? 'Suppression…' : 'Supprimer' }}
              </button>
            </div>
          </div>
          <iframe v-if="viewingPdfFor === doc.id" :src="previewUrl(doc)" style="width:100%; height:600px; border:1px solid var(--border); border-radius:8px; margin-bottom:16px"></iframe>
          <ModelViewer v-if="viewingModelFor === doc.id" :model-url="modelUrl(doc)" style="height:420px; margin-bottom:16px" />
        </template>

        <form v-if="canEdit" @submit.prevent="upload" style="margin-top:16px">
          <div class="form-row">
            <div class="field">
              <label>Fichiers (tous types acceptés, plusieurs à la fois)</label>
              <input type="file" multiple @change="addNativeFiles($event.target.files); $event.target.value = ''" />
              <ul v-if="nativeFiles.length" class="staged-file-list">
                <li v-for="(f, i) in nativeFiles" :key="i">
                  {{ f.name }}
                  <button type="button" class="link-button" style="color:var(--danger)" @click="removeNativeFile(i)">×</button>
                </li>
              </ul>
            </div>
            <div class="field">
              <label>Aperçu (.png / .jpg / .pdf)</label>
              <input type="file" @change="previewFile = $event.target.files[0]" />
              <button
                v-if="isElectron"
                type="button"
                class="secondary"
                style="margin-top:6px"
                :disabled="!nativeFiles.length || generatingPreview"
                @click="generatePreviewFromSolidWorks"
              >
                {{ generatingPreview ? 'Génération…' : 'Générer via SolidWorks (bêta)' }}
              </button>
              <p v-if="generatePreviewError" class="error-text">{{ generatePreviewError }}</p>
              <p v-if="previewFile?.name === 'apercu-solidworks.png'" class="success-text">
                Aperçu généré automatiquement ✓ {{ previewModel ? '(+ modèle 3D)' : '' }}
              </p>
            </div>
          </div>
          <p v-if="uploadError" class="error-text">{{ uploadError }}</p>
          <button type="submit" :disabled="uploading">{{ uploading ? 'Envoi…' : 'Envoyer' }}</button>
        </form>
      </div>

      <div class="card">
        <h2>Historique</h2>
        <div v-if="!history.length" class="muted">Aucun historique pour l'instant.</div>
        <table v-else>
          <thead>
            <tr><th>Quand</th><th>Qui</th><th>Étape</th><th>Statut</th></tr>
          </thead>
          <tbody>
            <tr v-for="h in history" :key="h.id">
              <td>{{ formatDate(h.changed_at) }}</td>
              <td>{{ h.changed_by }}</td>
              <td>{{ h.old_step || '—' }} → {{ h.new_step || '—' }}</td>
              <td>{{ statusLabel(h.old_status) }} → {{ statusLabel(h.new_status) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>
