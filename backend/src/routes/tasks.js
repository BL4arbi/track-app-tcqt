import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { WORKFLOW_STEPS, nextWorkflowStep } from '../utils/workflowSteps.js';

const router = Router();
router.use(requireAuth);

const TASK_SELECT = `
  SELECT t.id, t.title, t.current_step, t.next_step, t.due_date, t.status,
         t.created_at, t.updated_at,
         t.client_id, c.name AS client_name,
         t.assigned_user_id, u.full_name AS assigned_user_name,
         latest_doc.preview_image_path, latest_doc.model_path
  FROM tasks t
  JOIN clients c ON c.id = t.client_id
  JOIN users u ON u.id = t.assigned_user_id
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
    `${TASK_SELECT} WHERE t.due_date IS NOT NULL ORDER BY t.due_date`
  );
  res.json({ tasks: rows });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`${TASK_SELECT} WHERE t.id = $1`, [req.params.id]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: "Tâche introuvable" });

  const [{ rows: history }, { rows: documents }] = await Promise.all([
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
  ]);

  res.json({ task, history, documents });
});

router.post('/', async (req, res) => {
  const { client_id, title, current_step, next_step, due_date, assigned_user_id } = req.body || {};
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
    `INSERT INTO tasks (client_id, assigned_user_id, title, current_step, next_step, due_date)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [client_id, ownerId, title, current_step || null, derivedNextStep, due_date || null]
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

  const { title, current_step, next_step, due_date, status, client_id, assigned_user_id } = req.body || {};
  const resolvedCurrentStep = current_step ?? existing.current_step;
  const next = {
    title: title ?? existing.title,
    current_step: resolvedCurrentStep,
    next_step: WORKFLOW_STEPS.includes(resolvedCurrentStep)
      ? nextWorkflowStep(resolvedCurrentStep)
      : (next_step ?? existing.next_step),
    due_date: due_date !== undefined ? (due_date || null) : existing.due_date,
    status: status ?? existing.status,
    client_id: client_id ?? existing.client_id,
    assigned_user_id: req.user.role === 'manager' ? (assigned_user_id ?? existing.assigned_user_id) : existing.assigned_user_id,
  };

  await pool.query(
    `UPDATE tasks SET title = $1, current_step = $2, next_step = $3, due_date = $4,
                       status = $5, client_id = $6, assigned_user_id = $7
     WHERE id = $8`,
    [next.title, next.current_step, next.next_step, next.due_date, next.status, next.client_id, next.assigned_user_id, existing.id]
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

export default router;
