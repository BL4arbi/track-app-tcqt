import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
// The "preview" attached to a document can be an image (rendered as a
// thumbnail) or a PDF (rendered inline in an embed on Task Detail).
const PREVIEW_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.pdf']);
const MODEL_EXTENSIONS = new Set(['.stl']);

// multer/busboy decode multipart filename metadata as Latin-1 regardless of
// the browser sending UTF-8 bytes — this reverses that mojibake (e.g. "ç"
// arriving as "Ã§"). Safe to always apply: it's the documented root cause.
function fixFilenameEncoding(name) {
  return Buffer.from(name, 'latin1').toString('utf8');
}

function destSubdir(fieldname) {
  if (fieldname === 'previewImage') return 'previews';
  if (fieldname === 'previewModel') return 'models';
  return '';
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'tasks', req.params.id, destSubdir(file.fieldname)));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(fixFilenameEncoding(file.originalname)).toLowerCase()}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
  // The main "file" field accepts any file type — no whitelist.
  if (file.fieldname === 'previewImage' && !PREVIEW_EXTENSIONS.has(ext)) {
    return cb(new Error(`L'aperçu doit être un png/jpg/pdf, reçu : ${ext}`));
  }
  if (file.fieldname === 'previewModel' && !MODEL_EXTENSIONS.has(ext)) {
    return cb(new Error(`Le modèle 3D doit être un .stl, reçu : ${ext}`));
  }
  cb(null, true);
}

// multer needs the destination directory to exist beforehand.
function ensureDirs(req, _res, next) {
  mkdirSync(path.join(UPLOAD_DIR, 'tasks', req.params.id, 'previews'), { recursive: true });
  mkdirSync(path.join(UPLOAD_DIR, 'tasks', req.params.id, 'models'), { recursive: true });
  next();
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });

// Checked before multer even starts writing files to disk — anyone can
// view/download a task's documents (e.g. from the Dashboard), but only
// the task's owner or a manager can add new ones.
async function requireTaskEditAccess(req, res, next) {
  const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const task = rows[0];
  if (!task) return res.status(404).json({ error: "Tâche introuvable" });
  const canEdit = req.user.role === 'manager' || task.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez ajouter des documents qu'à vos propres tâches" });
  req.task = task;
  next();
}

router.post(
  '/tasks/:id/documents',
  requireTaskEditAccess,
  ensureDirs,
  upload.fields([
    { name: 'file', maxCount: 20 },
    { name: 'previewImage', maxCount: 1 },
    { name: 'previewModel', maxCount: 1 },
  ]),
  async (req, res) => {
    const nativeFiles = req.files?.file || [];
    const previewImage = req.files?.previewImage?.[0];
    const previewModel = req.files?.previewModel?.[0];
    if (!nativeFiles.length) return res.status(400).json({ error: "Le fichier est obligatoire" });

    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');

    // Multiple native files can be uploaded together, but the preview
    // (image/PDF) and 3D model only make sense attached to one document —
    // they land on the first file in the batch.
    const documents = [];
    for (let i = 0; i < nativeFiles.length; i++) {
      const nativeFile = nativeFiles[i];
      const fixedName = fixFilenameEncoding(nativeFile.originalname);
      const { rows } = await pool.query(
        `INSERT INTO documents (task_id, uploaded_by, original_filename, file_type, storage_path, preview_image_path, model_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          req.params.id,
          req.user.id,
          fixedName,
          path.extname(fixedName).slice(1).toLowerCase(),
          toRelative(nativeFile),
          i === 0 && previewImage ? toRelative(previewImage) : null,
          i === 0 && previewModel ? toRelative(previewModel) : null,
        ]
      );
      documents.push(rows[0]);
    }
    res.status(201).json({ document: documents[0], documents });
  }
);

const previewOnlyStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'tasks', String(req.document.task_id), 'previews'));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(fixFilenameEncoding(file.originalname)).toLowerCase()}`);
  },
});
function previewOnlyFilter(_req, file, cb) {
  const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
  if (!PREVIEW_EXTENSIONS.has(ext)) return cb(new Error(`L'aperçu doit être un png/jpg/pdf, reçu : ${ext}`));
  cb(null, true);
}
const uploadPreviewOnly = multer({ storage: previewOnlyStorage, fileFilter: previewOnlyFilter, limits: { fileSize: 50 * 1024 * 1024 } });

async function loadDocumentForEdit(req, res, next) {
  const { rows } = await pool.query(
    `SELECT d.*, t.assigned_user_id
     FROM documents d JOIN tasks t ON t.id = d.task_id
     WHERE d.id = $1`,
    [req.params.id]
  );
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: "Document introuvable" });
  const canEdit = req.user.role === 'manager' || doc.assigned_user_id === req.user.id;
  if (!canEdit) return res.status(403).json({ error: "Vous ne pouvez modifier que les documents de vos propres tâches" });
  req.document = doc;
  next();
}

function ensurePreviewDirs(req, _res, next) {
  mkdirSync(path.join(UPLOAD_DIR, 'tasks', String(req.document.task_id), 'previews'), { recursive: true });
  next();
}

// Attach/replace a preview image on an existing document without
// re-uploading the native file — for documents uploaded before a preview
// was required, or to swap in a better snapshot.
router.patch(
  '/documents/:id/preview',
  loadDocumentForEdit,
  ensurePreviewDirs,
  uploadPreviewOnly.single('previewImage'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "L'image d'aperçu est obligatoire" });
    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');
    const { rows } = await pool.query(
      `UPDATE documents SET preview_image_path = $1 WHERE id = $2 RETURNING *`,
      [toRelative(req.file), req.document.id]
    );
    res.json({ document: rows[0] });
  }
);

router.get('/documents/:id/download', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: "Document introuvable" });
  res.download(path.resolve(UPLOAD_DIR, doc.storage_path), doc.original_filename);
});

router.delete('/documents/:id', loadDocumentForEdit, async (req, res) => {
  const doc = req.document;
  await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]);

  const filePaths = [doc.storage_path, doc.preview_image_path, doc.model_path].filter(Boolean);
  await Promise.all(
    filePaths.map(async (rel) => {
      const abs = path.resolve(UPLOAD_DIR, rel);
      if (existsSync(abs)) {
        try {
          await unlink(abs);
        } catch {
          // best-effort cleanup — the DB row is already gone either way
        }
      }
    })
  );

  res.status(204).end();
});

// CAD file / PDF plan attached directly to a manufactured-parts checklist
// entry (task_parts), not the general task documents list — each part gets
// its own single CAD slot and single plan slot, replaced wholesale on
// re-upload (the old file is cleaned up from disk afterward).
async function loadPartForFileEdit(req, res, next) {
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

function ensurePartDirs(req, _res, next) {
  mkdirSync(path.join(UPLOAD_DIR, 'tasks', String(req.part.task_id), 'parts'), { recursive: true });
  next();
}

const partFileStorage = multer.diskStorage({
  destination: (req, _file, cb) => {
    cb(null, path.join(UPLOAD_DIR, 'tasks', String(req.part.task_id), 'parts'));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(fixFilenameEncoding(file.originalname)).toLowerCase()}`);
  },
});
function partFileFilter(_req, file, cb) {
  if (file.fieldname === 'previewImage') {
    const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
    if (!PREVIEW_EXTENSIONS.has(ext)) return cb(new Error(`L'aperçu doit être un png/jpg, reçu : ${ext}`));
  }
  if (file.fieldname === 'previewModel') {
    const ext = path.extname(fixFilenameEncoding(file.originalname)).toLowerCase();
    if (!MODEL_EXTENSIONS.has(ext)) return cb(new Error(`Le modèle 3D doit être un .stl, reçu : ${ext}`));
  }
  cb(null, true);
}
const uploadPartFile = multer({ storage: partFileStorage, fileFilter: partFileFilter, limits: { fileSize: 200 * 1024 * 1024 } });

const PART_SELECT_COLUMNS = 'id, machine, name, comment, quantity, material_type, brut, status, cad_path, cad_filename, plan_path, plan_filename, preview_path, model_path, created_at';

async function unlinkIfExists(relPath) {
  if (!relPath) return;
  const abs = path.resolve(UPLOAD_DIR, relPath);
  if (existsSync(abs)) {
    try {
      await unlink(abs);
    } catch {
      // best-effort cleanup
    }
  }
}

router.patch(
  '/tasks/parts/:partId/cad',
  loadPartForFileEdit,
  ensurePartDirs,
  uploadPartFile.fields([
    { name: 'file', maxCount: 1 },
    { name: 'previewImage', maxCount: 1 },
    { name: 'previewModel', maxCount: 1 },
  ]),
  async (req, res) => {
    const file = req.files?.file?.[0];
    const previewImage = req.files?.previewImage?.[0];
    const previewModel = req.files?.previewModel?.[0];
    if (!file) return res.status(400).json({ error: 'Le fichier CAO est obligatoire' });
    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');
    const fixedName = fixFilenameEncoding(file.originalname);
    const { rows } = await pool.query(
      `UPDATE task_parts SET cad_path = $1, cad_filename = $2, preview_path = COALESCE($3, preview_path), model_path = COALESCE($4, model_path)
       WHERE id = $5 RETURNING ${PART_SELECT_COLUMNS}`,
      [toRelative(file), fixedName, previewImage ? toRelative(previewImage) : null, previewModel ? toRelative(previewModel) : null, req.part.id]
    );
    await unlinkIfExists(req.part.cad_path);
    if (previewImage) await unlinkIfExists(req.part.preview_path);
    if (previewModel) await unlinkIfExists(req.part.model_path);
    res.json({ part: rows[0] });
  }
);

router.patch(
  '/tasks/parts/:partId/plan',
  loadPartForFileEdit,
  ensurePartDirs,
  uploadPartFile.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Le plan est obligatoire' });
    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');
    const fixedName = fixFilenameEncoding(req.file.originalname);
    const { rows } = await pool.query(
      `UPDATE task_parts SET plan_path = $1, plan_filename = $2 WHERE id = $3 RETURNING ${PART_SELECT_COLUMNS}`,
      [toRelative(req.file), fixedName, req.part.id]
    );
    await unlinkIfExists(req.part.plan_path);
    res.json({ part: rows[0] });
  }
);

router.get('/tasks/parts/:partId/cad/download', async (req, res) => {
  const { rows } = await pool.query('SELECT cad_path, cad_filename FROM task_parts WHERE id = $1', [req.params.partId]);
  const part = rows[0];
  if (!part?.cad_path) return res.status(404).json({ error: 'Fichier CAO introuvable' });
  res.download(path.resolve(UPLOAD_DIR, part.cad_path), part.cad_filename);
});

router.get('/tasks/parts/:partId/plan/download', async (req, res) => {
  const { rows } = await pool.query('SELECT plan_path, plan_filename FROM task_parts WHERE id = $1', [req.params.partId]);
  const part = rows[0];
  if (!part?.plan_path) return res.status(404).json({ error: 'Plan introuvable' });
  res.download(path.resolve(UPLOAD_DIR, part.plan_path), part.plan_filename);
});

export default router;
