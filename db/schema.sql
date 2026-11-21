ALTER DATABASE "passforge" MODIFY NAME = "kryptik";
DROP TABLE IF EXISTS users CASCADE;
CREATE TABLE users(
id             SERIAL PRIMARY KEY,
username       TEXT NOT NULL UNIQUE,
salt           TEXT NOT NULL,
verifier       TEXT NOT NULL,
created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_entries(
id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
site_name      TEXT NOT NULL CHECK (char_length(site_name) <= 512),
site_username  TEXT NOT NULL CHECK (char_length(site_username) <= 512),
enc_pass       TEXT NOT NULL CHECK (char_length(enc_pass) <= 512),
created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_entries_user_id ON vault_entries(user_id);

CREATE TABLE IF NOT EXISTS "session"(
    "sid"      TEXT NOT NULL PRIMARY KEY,
    "sess"     JSONB NOT NULL,
    "expire"   TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
