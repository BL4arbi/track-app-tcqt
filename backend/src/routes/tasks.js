import { Router } from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { WORKFLOW_STEPS, nextWorkflowStep } from '../utils/workflowSteps.js';

const router = Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const TASK_SELECT = `
  SELECT t.id, t.title, t.label, t.notes, t.current_step, t.next_step,
         t.due_date, t.final_date, t.reminder_date, t.status,
         t.created_at, t.updated_at,
         t.client_id, c.name AS client_name,
         t.assigned_user_id, u.full_name AS assigned_user_name,
         t.parent_task_id, parent.title AS parent_title,
         latest_doc.preview_image_path, latest_doc.model_path
  FROM tasks t
  JOIN clients c ON c.id = t.client_id
  JOIN users u ON u.id = t.assigned_user_id
  LEFT JOIN tasks parent ON parent.id = t.parent_task_id
  LEFT JOIN LATERAL (
    SELECT d.preview_image_path, d.model_path
    FROM documents d
    WHERE d.task_id = t.id AND d.preview_image_path IS NOT NULL
    ORDER BY d.uploaded_at DESC LIMIT 1
  ) latest_doc ON true
`;

// Dashboard: every active task across the team.
router.get('/', async (_req, res) => {
  const { rows } = await pool.query(
    `${TASK_SELECT} WHERE t.status = 'active' ORDER BY u.full_name, t.updated_at DESC`
  );
  res.json({ tasks: rows });
});

// My tasks: everything assigned to me, any status.
router.get('/mine', async (req, res) => {
  const { rows } = await pool.query(
    `${TASK_SELECT} WHERE t.assigned_user_id = $1 ORDER BY t.status, t.updated_at DESC`,
    [req.user.id]
  );
  res.json({ tasks: rows });
});

// Team calendar: every task with an expected date, any status.
router.get('/calendar', async (_req, res) => {
  const { rows } = await pool.query(
    `${TASK_SELECT} WHERE t.due_date IS NOT NULL OR t.final_date IS NOT NULL ORDER BY COALESCE(t.due_date, t.final_date)`
  );
  res.json({ tasks: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [req.params.id]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: "Tâche introuvable" });

  const [{ rows: history }, { rows: documents }, { rows: subtasks }, { rows: parts }] = await Promise.all([
    pool.query(
      `SELECT h.id, h.old_step, h.new_step, h.old_status, h.new_status, h.changed_at,
              u.full_name AS changed_by
       FROM task_history h JOIN users u ON u.id = h.user_id
       WHERE h.task_id = $1 ORDER BY h.changed_at DESC`,
      [task.id]
    ),
    pool.query(
      `SELECT d.id, d.original_filename, d.file_type, d.storage_path, d.preview_image_path,
              d.model_path, d.uploaded_at, u.full_name AS uploaded_by
       FROM documents d JOIN users u ON u.id = d.uploaded_by
       WHERE d.task_id = $1 ORDER BY d.uploaded_at DESC`,
      [task.id]
    ),
    pool.query(
      `SELECT id, title, status FROM tasks WHERE parent_task_id = $1 ORDER BY created_at`,
      [task.id]
    ),
    pool.query(
      `SELECT id, machine, name, comment, quantity, material_type, brut, status,
              cad_path, cad_filename, plan_path, plan_filename, preview_path, model_path, created_at
       FROM task_parts WHERE task_id = $1 ORDER BY machine NULLS LAST, created_at`,
      [task.id]
    ),
  ]);

  // PURCHASE_SELECT is defined further down in this file, but that's fine —
  // it's a module-level const assigned when the file loads, well before any
  // request handler actually runs.
  const { rows: purchases } = await pool.query(
    `${PURCHASE_SELECT} WHERE p.task_id = $1 ORDER BY p.created_at`,
    [task.id]
  );

  res.json({ task, history, documents, subtasks, parts, purchases });
});

router.post('/', async (req, res) => {
  const {
    client_id, title, label, notes, current_step, next_step,
    due_date, final_date, reminder_date, parent_task_id, assigned_user_id,
  } = req.body || {};
  if (!client_id || !title) {
    return res.status(400).json({ error: "Le client et le titre sont obligatoires" });
  }

  // Only managers may assign work to someone other than themselves.
  const ownerId = assigned_user_id && req.user.role === 'manager' ? assigned_user_id : req.user.id;

  // The chronology is fixed — derive next_step authoritatively from
  // current_step rather than trusting whatever the client sent. Only fall
  // back to the client-supplied value for unrecognized/legacy free text.
  const derivedNextStep = WORKFLOW_STEPS.includes(current_step)
    ? nextWorkflowStep(current_step)
    : (next_step || null);

  const { rows } = await pool.query(
    `INSERT INTO tasks (client_id, assigned_user_id, title, label, notes, current_step, next_step, due_date, final_date, reminder_date, parent_task_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
    [client_id, ownerId, title, label || null, notes || null, current_step || null, derivedNextStep,
     due_date || null, final_date || null, reminder_date || null, parent_task_id || null]
  );
  const taskId = rows[0].id;

  await pool.query(
    `INSERT INTO task_history (task_id, user_id, old_step, new_step, old_status, new_status)
     VALUES ($1, $2, NULL, $3, NULL, 'active')`,
    [taskId, req.user.id, current_step || null]
  );

  const { rows: full } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [taskId]);
  res.status(201).json({ task: full[0] });
});

router.patch('/:id', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Tâche introuvable" });

  const canEdit = req.user.role === 'manager' || existing.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres tâches" });

  const {
    title, label, notes, current_step, next_step, due_date, final_date, reminder_date,
    parent_task_id, status, client_id, assigned_user_id,
  } = req.body || {};

  if (parent_task_id !== undefined && parent_task_id !== null && Number(parent_task_id) === existing.id) {
    return res.status(400).json({ error: "Une tâche ne peut pas être sa propre tâche parente" });
  }

  const resolvedCurrentStep = current_step ?? existing.current_step;
  const next = {
    title: title ?? existing.title,
    label: label !== undefined ? (label || null) : existing.label,
    notes: notes !== undefined ? (notes || null) : existing.notes,
    current_step: resolvedCurrentStep,
    next_step: WORKFLOW_STEPS.includes(resolvedCurrentStep)
      ? nextWorkflowStep(resolvedCurrentStep)
      : (next_step ?? existing.next_step),
    due_date: due_date !== undefined ? (due_date || null) : existing.due_date,
    final_date: final_date !== undefined ? (final_date || null) : existing.final_date,
    reminder_date: reminder_date !== undefined ? (reminder_date || null) : existing.reminder_date,
    parent_task_id: parent_task_id !== undefined ? (parent_task_id || null) : existing.parent_task_id,
    status: status ?? existing.status,
    client_id: client_id ?? existing.client_id,
    assigned_user_id: req.user.role === 'manager' ? (assigned_user_id ?? existing.assigned_user_id) : existing.assigned_user_id,
  };

  await pool.query(
    `UPDATE tasks SET title = $1, label = $2, notes = $3, current_step = $4, next_step = $5,
                       due_date = $6, final_date = $7, reminder_date = $8,
                       parent_task_id = $9, status = $10, client_id = $11, assigned_user_id = $12
     WHERE id = $13`,
    [next.title, next.label, next.notes, next.current_step, next.next_step,
     next.due_date, next.final_date, next.reminder_date,
     next.parent_task_id, next.status, next.client_id, next.assigned_user_id, existing.id]
  );

  const stepChanged = next.current_step !== existing.current_step;
  const statusChanged = next.status !== existing.status;
  if (stepChanged || statusChanged) {
    await pool.query(
      `INSERT INTO task_history (task_id, user_id, old_step, new_step, old_status, new_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [existing.id, req.user.id, existing.current_step, next.current_step, existing.status, next.status]
    );
  }

  const { rows: full } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [existing.id]);
  res.json({ task: full[0] });
});

// Any user can delete their own task (e.g. once finished or superseded by
// another step) — not manager-only. Managers can delete any task.
router.delete('/:id', async (req, res) => {
  const { rows: existingRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: "Tâche introuvable" });

  const canEdit = req.user.role === 'manager' || existing.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez supprimer que vos propres tâches" });

  const { rows: docs } = await pool.query(
    'SELECT storage_path, preview_image_path, model_path FROM documents WHERE task_id = $1',
    [existing.id]
  );

  // task_history and documents rows cascade-delete via FK ON DELETE CASCADE;
  // sub-tasks (parent_task_id) get their parent link cleared (ON DELETE SET
  // NULL), not deleted themselves. This only needs to clean up disk files.
  await pool.query('DELETE FROM tasks WHERE id = $1', [existing.id]);

  const filePaths = docs.flatMap((d) => [d.storage_path, d.preview_image_path, d.model_path]).filter(Boolean);
  await Promise.all(
    filePaths.map(async (rel) => {
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (existsSync(abs)) {
        try {
          await unlink(abs);
        } catch {
          // best-effort cleanup — the DB rows are already gone either way
        }
      }
    })
  );

  res.status(204).end();
});

// Manufactured-parts checklist: in-house elements to build for a task,
// each with an optional comment and a procurement/manufacturing status.
const PART_STATUSES = ['a_commander', 'commande', 'en_fabrication', 'fabrique'];

// Every distinct "brut" (raw stock) ever typed across every task by every
// user — autocomplete suggestions for the Brut field, so typing "Plat
// étiré 80x30" once means nobody else has to retype it identically from
// memory. Deliberately global (not scoped to a task or user): the whole
// point is reusing what other people already typed.
router.get('/parts/brut-suggestions', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT brut FROM task_parts WHERE brut IS NOT NULL AND brut <> '' ORDER BY brut`
  );
  res.json({ brutOptions: rows.map((r) => r.brut) });
});

// Same idea, for material_type — free text, not a fixed list: the team
// builds up its own vocabulary organically from what's actually typed,
// rather than being constrained to a category list picked in advance.
router.get('/parts/material-suggestions', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT material_type FROM task_parts WHERE material_type IS NOT NULL AND material_type <> '' ORDER BY material_type`
  );
  res.json({ materialOptions: rows.map((r) => r.material_type) });
});

router.post('/:id/parts', async (req, res) => {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ error: "Tâche introuvable" });

  const canEdit = req.user.role === 'manager' || task.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres tâches" });

  const { machine, name, comment, quantity, material_type, brut, status } = req.body || {};
  if (!name) return res.status(400).json({ error: "Le nom de la pièce est obligatoire" });
  if (status !== undefined && !PART_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Statut de pièce invalide' });
  }
  const qty = quantity !== undefined && quantity !== '' ? Number(quantity) : 1;
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'La quantité doit être un entier positif' });
  }

  const { rows } = await pool.query(
    `INSERT INTO task_parts (task_id, machine, name, comment, quantity, material_type, brut, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, machine, name, comment, quantity, material_type, brut, status, cad_path, cad_filename, plan_path, plan_filename, preview_path, created_at`,
    [task.id, machine || null, name, comment || null, qty, material_type || null, brut || null, status || 'a_commander']
  );
  res.status(201).json({ part: rows[0] });
});

async function loadPartForEdit(req, res, next) {
  const { rows } = await pool.query(
    `SELECT p.*, t.assigned_user_id
     FROM task_parts p JOIN tasks t ON t.id = p.task_id
     WHERE p.id = $1`,
    [req.params.partId]
  );
  const part = rows[0];
  if (!part) return res.status(404).json({ error: "Pièce introuvable" });
  const canEdit = req.user.role === 'manager' || part.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que les pièces de vos propres tâches" });
  req.part = part;
  next();
}

router.patch('/parts/:partId', loadPartForEdit, async (req, res) => {
  const { machine, name, comment, quantity, material_type, brut, status } = req.body || {};
  if (status !== undefined && !PART_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Statut de pièce invalide' });
  }
  let qty = req.part.quantity;
  if (quantity !== undefined && quantity !== '') {
    qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'La quantité doit être un entier positif' });
    }
  }
  const next = {
    machine: machine !== undefined ? (machine || null) : req.part.machine,
    name: name ?? req.part.name,
    comment: comment !== undefined ? (comment || null) : req.part.comment,
    quantity: qty,
    material_type: material_type !== undefined ? (material_type || null) : req.part.material_type,
    brut: brut !== undefined ? (brut || null) : req.part.brut,
    status: status ?? req.part.status,
  };
  const { rows } = await pool.query(
    `UPDATE task_parts SET machine = $1, name = $2, comment = $3, quantity = $4, material_type = $5, brut = $6, status = $7 WHERE id = $8
     RETURNING id, machine, name, comment, quantity, material_type, brut, status, cad_path, cad_filename, plan_path, plan_filename, preview_path, created_at`,
    [next.machine, next.name, next.comment, next.quantity, next.material_type, next.brut, next.status, req.part.id]
  );
  res.json({ part: rows[0] });
});

router.delete('/parts/:partId', loadPartForEdit, async (req, res) => {
  await pool.query('DELETE FROM task_parts WHERE id = $1', [req.part.id]);
  await Promise.all(
    [req.part.cad_path, req.part.plan_path, req.part.preview_path, req.part.model_path].filter(Boolean).map(async (rel) => {
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (existsSync(abs)) {
        try {
          await unlink(abs);
        } catch {
          // best-effort cleanup
        }
      }
    })
  );
  res.status(204).end();
});

// Achat: things to buy for a task (hardware, consumables, raw stock) — a
// separate list from task_parts, optionally tagged with a machine and/or
// linked to one specific piece.
const PURCHASE_STATUSES = ['a_commander', 'commande', 'en_cours_livraison', 'recu'];
const PURCHASE_SELECT = `
  SELECT p.id, p.machine, p.part_id, part.name AS part_name, p.description, p.quantity, p.ref, p.status,
         p.supplier_id, COALESCE(s.name, p.supplier_name) AS supplier_name, s.link AS supplier_link,
         p.created_at, u.full_name AS created_by
  FROM task_purchases p
  JOIN users u ON u.id = p.created_by
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  LEFT JOIN task_parts part ON part.id = p.part_id
`;

router.post('/:id/purchases', async (req, res) => {
  const { rows: taskRows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const task = taskRows[0];
  if (!task) return res.status(404).json({ error: "Tâche introuvable" });

  const canEdit = req.user.role === 'manager' || task.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que vos propres tâches" });

  const { machine, part_id, description, quantity, ref, supplier_id, supplier_name, status } = req.body || {};
  if (!description) return res.status(400).json({ error: "La description de l'achat est obligatoire" });
  if (status !== undefined && !PURCHASE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Statut d'achat invalide" });
  }
  const qty = quantity !== undefined && quantity !== '' ? Number(quantity) : 1;
  if (!Number.isInteger(qty) || qty < 1) {
    return res.status(400).json({ error: 'La quantité doit être un entier positif' });
  }
  if (part_id) {
    const { rows: partRows } = await pool.query('SELECT id FROM task_parts WHERE id = $1 AND task_id = $2', [part_id, task.id]);
    if (!partRows[0]) return res.status(400).json({ error: "Cette pièce n'appartient pas à cette tâche" });
  }

  const { rows } = await pool.query(
    `INSERT INTO task_purchases (task_id, machine, part_id, description, quantity, ref, supplier_id, supplier_name, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [task.id, machine || null, part_id || null, description, qty, ref || null, supplier_id || null, supplier_name || null, status || 'a_commander', req.user.id]
  );
  const { rows: full } = await pool.query(`${PURCHASE_SELECT} WHERE p.id = $1`, [rows[0].id]);
  res.status(201).json({ purchase: full[0] });
});

async function loadPurchaseForEdit(req, res, next) {
  const { rows } = await pool.query(
    `SELECT p.*, t.assigned_user_id
     FROM task_purchases p JOIN tasks t ON t.id = p.task_id
     WHERE p.id = $1`,
    [req.params.purchaseId]
  );
  const purchase = rows[0];
  if (!purchase) return res.status(404).json({ error: 'Achat introuvable' });
  const canEdit = req.user.role === 'manager' || purchase.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que les achats de vos propres tâches" });
  req.purchase = purchase;
  next();
}

router.patch('/purchases/:purchaseId', loadPurchaseForEdit, async (req, res) => {
  const { machine, part_id, description, quantity, ref, supplier_id, supplier_name, status } = req.body || {};
  if (status !== undefined && !PURCHASE_STATUSES.includes(status)) {
    return res.status(400).json({ error: "Statut d'achat invalide" });
  }
  let qty = req.purchase.quantity;
  if (quantity !== undefined && quantity !== '') {
    qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'La quantité doit être un entier positif' });
    }
  }
  if (part_id) {
    const { rows: partRows } = await pool.query('SELECT id FROM task_parts WHERE id = $1 AND task_id = $2', [part_id, req.purchase.task_id]);
    if (!partRows[0]) return res.status(400).json({ error: "Cette pièce n'appartient pas à cette tâche" });
  }
  const next = {
    machine: machine !== undefined ? (machine || null) : req.purchase.machine,
    part_id: part_id !== undefined ? (part_id || null) : req.purchase.part_id,
    description: description ?? req.purchase.description,
    quantity: qty,
    ref: ref !== undefined ? (ref || null) : req.purchase.ref,
    supplier_id: supplier_id !== undefined ? (supplier_id || null) : req.purchase.supplier_id,
    supplier_name: supplier_name !== undefined ? (supplier_name || null) : req.purchase.supplier_name,
    status: status ?? req.purchase.status,
  };
  await pool.query(
    `UPDATE task_purchases SET machine = $1, part_id = $2, description = $3, quantity = $4, ref = $5,
                                supplier_id = $6, supplier_name = $7, status = $8
     WHERE id = $9`,
    [next.machine, next.part_id, next.description, next.quantity, next.ref, next.supplier_id, next.supplier_name, next.status, req.purchase.id]
  );
  const { rows: full } = await pool.query(`${PURCHASE_SELECT} WHERE p.id = $1`, [req.purchase.id]);
  res.json({ purchase: full[0] });
});

router.delete('/purchases/:purchaseId', loadPurchaseForEdit, async (req, res) => {
  await pool.query('DELETE FROM task_purchases WHERE id = $1', [req.purchase.id]);
  res.status(204).end();
});

export default router;
