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
  title            TEXT NOT NULL,
  current_step     TEXT,
  next_step        TEXT,
  due_date         DATE,  -- "date exécution chantier"
  final_date       DATE,  -- "date finale"
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'done')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS final_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;

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
-- and "Départ chantier"), with an optional comment per item.
CREATE TABLE IF NOT EXISTS task_parts (
  id          SERIAL PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  comment     TEXT,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_parts_task ON task_parts(task_id);
CREATE INDEX IF NOT EXISTS idx_documents_task ON documents(task_id);

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
