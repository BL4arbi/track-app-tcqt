import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const NATIVE_EXTENSIONS = new Set(['.sldprt', '.sldasm', '.slddrw', '.pdf']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sub = file.fieldname === 'previewImage' ? 'previews' : '';
    cb(null, path.join(UPLOAD_DIR, 'tasks', req.params.id, sub));
  },
  filename: (_req, file, cb) => {
    cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'file' && !NATIVE_EXTENSIONS.has(ext)) {
    return cb(new Error(`Type de fichier natif non supporté : ${ext}`));
  }
  if (file.fieldname === 'previewImage' && !IMAGE_EXTENSIONS.has(ext)) {
    return cb(new Error(`L'aperçu doit être un png/jpg, reçu : ${ext}`));
  }
  cb(null, true);
}

// multer needs the destination directory to exist beforehand.
function ensureDirs(req, _res, next) {
  mkdirSync(path.join(UPLOAD_DIR, 'tasks', req.params.id, 'previews'), { recursive: true });
  next();
}

const upload = multer({ storage, fileFilter, limits: { fileSize: 200 * 1024 * 1024 } });

router.post(
  '/tasks/:id/documents',
  ensureDirs,
  upload.fields([{ name: 'file', maxCount: 1 }, { name: 'previewImage', maxCount: 1 }]),
  async (req, res) => {
    const { rows: taskRows } = await pool.query('SELECT id FROM tasks WHERE id = $1', [req.params.id]);
    if (!taskRows[0]) return res.status(404).json({ error: "Tâche introuvable" });

    const nativeFile = req.files?.file?.[0];
    const previewImage = req.files?.previewImage?.[0];
    if (!nativeFile) return res.status(400).json({ error: "Le fichier est obligatoire" });

    const toRelative = (f) => path.relative(UPLOAD_DIR, f.path).split(path.sep).join('/');

    const { rows } = await pool.query(
      `INSERT INTO documents (task_id, uploaded_by, original_filename, file_type, storage_path, preview_image_path)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.params.id,
        req.user.id,
        nativeFile.originalname,
        path.extname(nativeFile.originalname).slice(1).toLowerCase(),
        toRelative(nativeFile),
        previewImage ? toRelative(previewImage) : null,
      ]
    );
    res.status(201).json({ document: rows[0] });
  }
);

router.get('/documents/:id/download', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
  const doc = rows[0];
  if (!doc) return res.status(404).json({ error: "Document introuvable" });
  res.download(path.resolve(UPLOAD_DIR, doc.storage_path), doc.original_filename);
});

export default router;
