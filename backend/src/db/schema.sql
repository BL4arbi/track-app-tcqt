-- SolidWorks Team Tracker — schema v1 (see handout section 3)

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  full_name       TEXT NOT NULL,
  company_email   TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  role            TEXT NOT NULL DEFAULT 'engineer' CHECK (role IN ('engineer', 'manager')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clients (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL,
  notes   TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id               SERIAL PRIMARY KEY,
  client_id        INTEGER NOT NULL REFERENCES clients(id),
  assigned_user_id INTEGER NOT NULL REFERENCES users(id),
  parent_task_id   INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  title            TEXT NOT NULL, -- "numéro d'affaire"
  label            TEXT,          -- "titre" — free-text, separate from the business number
  notes            TEXT,          -- general comment on the task as a whole
  current_step     TEXT,
  next_step        TEXT,
  due_date         DATE,  -- "date exécution chantier"
  final_date       DATE,  -- "date finale"
  reminder_date    DATE,  -- manually-set reminder, independent of due/final date
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS reminder_date DATE;

CREATE TABLE IF NOT EXISTS task_history (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  old_step    TEXT,
  new_step    TEXT,
  old_status  TEXT,
  new_status  TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Elements manufactured in-house for a task (e.g. between "Commande reçu"
-- and "Départ chantier"), with an optional comment per item. status tracks
-- the procurement/manufacturing stage of the raw material/part itself —
-- 'fabrique' (manufactured) is the final state. machine is a free-text
-- grouping label (e.g. "MACHINE ORBITALE 8") — pieces are organized by
-- machine within a task, matching how the team's own spreadsheet works.
CREATE TABLE IF NOT EXISTS task_parts (
  id            SERIAL PRIMARY KEY,
  task_id       INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  machine       TEXT,
  name          TEXT NOT NULL,
  comment       TEXT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  material_type TEXT, -- coarse category, e.g. "Aluminium" — separate from the free-text shape/dimensions below
  brut          TEXT, -- raw stock needed, e.g. "Plat étiré 80x30"
  done          BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'a_commander' CHECK (status IN ('a_commander', 'commande', 'en_fabrication', 'fabrique')),
  cad_path      TEXT,
  cad_filename  TEXT,
  plan_path     TEXT,
  plan_filename TEXT,
  preview_path  TEXT, -- image generated from the CAD file (e.g. via SolidWorks automation)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS preview_path TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS material_type TEXT;

ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'a_commander';
-- Widen the CHECK constraint for databases created before 'en_fabrication'
-- existed (the CREATE TABLE above only applies to brand-new databases).
ALTER TABLE task_parts DROP CONSTRAINT IF EXISTS task_parts_status_check;
ALTER TABLE task_parts ADD CONSTRAINT task_parts_status_check CHECK (status IN ('a_commander', 'commande', 'en_fabrication', 'fabrique'));
-- One-time backfill for rows created before `status` existed: preserve
-- their prior "done" flag as the equivalent final status.
UPDATE task_parts SET status = 'fabrique' WHERE done = true AND status = 'a_commander';

ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS machine TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS brut TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS cad_path TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS cad_filename TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS plan_path TEXT;
ALTER TABLE task_parts ADD COLUMN IF NOT EXISTS plan_filename TEXT;

-- Reusable supplier directory — a purchase can pick one from here (link
-- optional, e.g. their catalogue/product page) or, if it doesn't exist yet,
-- create it inline from the purchase form (name is unique so re-typing an
-- existing supplier's name just reuses that row instead of duplicating it).
CREATE TABLE IF NOT EXISTS suppliers (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Things to buy for a task (hardware, consumables, raw stock) — a separate
-- list from task_parts, not tied to one specific piece, though it can
-- optionally be tagged with the same free-text "machine" grouping.
-- supplier_name is always stored directly (denormalized) so a purchase
-- still shows its supplier even if picked as free text rather than from
-- the suppliers table; supplier_id is set only when linked to a directory
-- entry (used to show its link, and for the global duplicate-detection
-- view to match purchases across tasks by supplier + ref).
CREATE TABLE IF NOT EXISTS task_purchases (
  id              SERIAL PRIMARY KEY,
  task_id         INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  machine         TEXT,
  description     TEXT NOT NULL,
  quantity        INTEGER NOT NULL DEFAULT 1,
  ref             TEXT,
  supplier_id     INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name   TEXT,
  status          TEXT NOT NULL DEFAULT 'a_commander' CHECK (status IN ('a_commander', 'commande', 'en_cours_livraison', 'recu')),
  created_by      INTEGER NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id                  SERIAL PRIMARY KEY,
  task_id             INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by         INTEGER NOT NULL REFERENCES users(id),
  original_filename   TEXT NOT NULL,
  file_type           TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  preview_image_path  TEXT,
  model_path          TEXT,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS model_path TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_final_date ON tasks(final_date);
CREATE INDEX IF NOT EXISTS idx_tasks_reminder_date ON tasks(reminder_date);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_parts_task ON task_parts(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_task ON documents(task_id);
CREATE INDEX IF NOT EXISTS idx_task_purchases_task ON task_purchases(task_id);
CREATE INDEX IF NOT EXISTS idx_task_purchases_status ON task_purchases(status);
CREATE INDEX IF NOT EXISTS idx_task_purchases_ref ON task_purchases(ref);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);

-- keep tasks.updated_at current on every row update
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
