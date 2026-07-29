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
const NATIVE_EXTENSIONS = new Set(['.sldprt', '.sldasm', '.slddrw', '.pdf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
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
  if (file.fieldname === 'file' && !NATIVE_EXTENSIONS.has(ext)) {
    return cb(new Error(`Type de fichier natif non supporté : ${ext}`));
  }
  if (file.fieldname === 'previewImage' && !IMAGE_EXTENSIONS.has(ext)) {
    return cb(new Error(`L'aperçu doit être un png/jpg, reçu : ${ext}`));
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

router.post(
  '/tasks/:id/documents',
  ensureDirs,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'previewImage', maxCount: 1 },
    { name: 'previewModel', maxCount: 1 },
  ]),
  async (req, res) => {
    const { rows: taskRows } = await pool.query('SELECT id FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRows[0]) return res.status(404).json({ error: "Tâche introuvable" });

    const nativeFile = req.files?.file?.[0];
    const previewImage = req.files?.previewImage?.[0];
    const previewModel = req.files?.previewModel?.[0];
    if (!nativeFile) return res.status(400).json({ error: "Le fichier est obligatoire" });

    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');

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
        previewImage ? toRelative(previewImage) : null,
        previewModel ? toRelative(previewModel) : null,
      ]
    );
    res.status(201).json({ document: rows[0] });
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
  if (!IMAGE_EXTENSIONS.has(ext)) return cb(new Error(`L'aperçu doit être un png/jpg, reçu : ${ext}`));
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

export default router;
