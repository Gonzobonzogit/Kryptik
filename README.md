# Kryptik Passcodes

<p>
  <img src="public/assets/icon/mark-on-dark.svg" alt="Kryptik Passcodes" width="140">
</p>

**Kryptik Passcodes** is a zero-knowledge password toolkit: a live password strength
checker, a cryptographically secure password generator, and an encrypted personal
vault — with no server ever seeing your master password or your secrets.

**Live:** https://kryptikpasscode.app *(deploying)* · **Created by [Gonzo Codes](https://github.com/Gonzobonzogit)**

---

## What it does

| Tool | Who | Notes |
|---|---|---|
| **Strength checker** | Everyone, no account | Live meter, 5 pass/fail rules, forbidden-password detection, one-click "Enhance" to a strong replacement |
| **Password generator** | Everyone, no account | Web Crypto CSPRNG (`getRandomValues`), rejection-sampled uniform draws, at-least-one-per-class guarantee, Fisher–Yates shuffle |
| **Encrypted vault** | Account required | Save site / username / password entries as client-side ciphertext; show/copy/delete with per-entry controls |

## The zero-knowledge model

The master password exists only in your browser tab. It is never transmitted,
never stored, and never logged. What the server actually holds:

```
master password (browser only)
        │
        ▼  PBKDF2-SHA256, 600,000 iterations, 256-bit random salt
     master bits
        │
        ├──► HKDF-SHA256 (info: passforge-auth-v1) ──► SHA-256 ──► "verifier"  ──► stored
        │        (proves you know the password; can't reverse it)
        │
        └──► HKDF-SHA256 (info: passforge-enc-v1) ──► AES-256-GCM key ──► encrypts
                 every vault entry client-side before upload (never leaves)
```

- **Signup** sends the server `{ username, salt, verifier }` — the salt is public,
  the verifier is a one-way proof.
- **Login** fetches your salt, re-derives in the browser, sends the verifier; the
  server compares with a **constant-time** equality check.
- **Vault writes** send AES-256-GCM ciphertext (random 12-byte IV packed into each
  payload, base64). The server stores blobs and can decrypt none of them — not
  even us.
- The vault key lives only for the tab's lifetime (`sessionStorage`, cleared on
  close; explicitly wiped on logout). Close the tab, the vault is sealed.

### Cryptographic parameters

| Parameter | Value |
|---|---|
| Key derivation | PBKDF2-HMAC-SHA256 |
| Iterations | 600,000 |
| Salt | 32 random bytes (CSPRNG), base64 |
| Key expansion | HKDF-SHA256, domain-separated via `info` labels |
| Cipher | AES-256-GCM |
| IV | 12 random bytes per encryption, prepended and base64-packed |

**There is no password recovery.** By design — the server cannot reset what it
cannot see. Lose the master password, lose the vault. That is the product being
honest about what zero-knowledge means.

---

## Tech stack

- **Front end:** vanilla HTML / CSS / JavaScript — no framework
- **Browser crypto:** Web Crypto API only (`PBKDF2`, `HKDF`, `AES-GCM`, `getRandomValues`)
- **Back end:** Node.js + Express 5
- **Database:** PostgreSQL (parameterized queries only, via `pg`)
- **Sessions:** `express-session` + `connect-pg-simple` (sessions live in Postgres,
  not process memory — a restart doesn't log everyone out)
- **Hardening:** Helmet CSP, `express-rate-limit` on auth routes, session-ID
  regeneration on login/signup (fixation defense), `timingSafeEqual` verifier
  comparison, `textContent`-only rendering (no stored-XSS surface)

## Project structure

```
Kryptik/
├── public/
│   ├── index.html            # Strength checker + About (public)
│   ├── contact.html          # Contact page
│   ├── sign-up.html          # Create account
│   ├── log-in.html           # Sign in
│   ├── vault.html            # Encrypted vault (session-gated)
│   └── assets/
│       ├── icon/             # Kryptik Passcodes lockups & marks (SVG)
│       ├── style/darkstyle.css
│       └── logic/
│           ├── crypto.js     # PBKDF2 → HKDF → AES-GCM, key lifecycle
│           ├── auth.js       # Signup / login flows (derive → POST)
│           ├── vault.js      # Vault render + encrypted CRUD
│           ├── nav.js        # Session-aware navbar for every page
│           ├── checker.js    # passwdCheck() + scoreStrength()
│           ├── generator.js  # enhancePasswd() — CSPRNG + Fisher–Yates
│           └── main.js       # Checker page wiring
├── server/
│   ├── server.js             # Express app: auth + vault API, CSP, static
│   └── db.js                 # pg Pool config
├── db/
│   ├── schema.sql            # users / vault_entries / session tables
│   └── migrations/
├── docs/
│   ├── README.md             # pointer to this file
│   └── security/v1Protocols.md
└── test/
```

Script load order matters on each page: `nav.js` in `<body>`, then
dependencies before their consumers (`crypto.js` before `auth.js`/`vault.js`,
`checker.js`/`generator.js` before `main.js`/`vault.js`).

## Run it locally

**Prerequisites:** Node.js 18+ and a reachable PostgreSQL instance.

```bash
git clone https://github.com/Gonzobonzogit/PassForge.git kryptik
cd kryptik
npm install

# configure
cp .env.example .env
#   DATABASE_URL     – postgres://user:pass@localhost:5432/kryptik
#   SESSION_SECRET   – generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#   NODE_ENV=development

# create the database + tables
createdb -h localhost -U postgres kryptik
psql -h localhost -U postgres -d kryptik -f db/schema.sql

# go
npm run dev          # nodemon on http://localhost:3000
curl http://localhost:3000/api/health     # → {"ok":true}
```

### npm scripts

| Script | What it does |
|---|---|
| `start` | Run the production entry (`node server/server.js`) |
| `dev` | Nodemon watch mode |
| `check:syntax` | `node --check` every backend + front-end logic file |
| `test` | Node's built-in test runner |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `SESSION_SECRET` | yes | Cookie-signing secret (≥32 chars enforced at boot) |
| `PORT` | no | Listen port (default 3000) |
| `NODE_ENV` | recommended | `development` / `production` — drives secure cookies and DB TLS |

`.env` is git-ignored; `.env.example` documents the shape. Secrets never live in
the repo and are rotated before public deployment.

## Deployment notes

- **`.app` domains are HSTS-preloaded:** browsers will refuse plain HTTP on
  `kryptikpasscode.app` entirely. Terminate HTTPS at the edge (nginx/Caddy), then
  proxy to the Node process on localhost.
- **TLS is two separate hops.** The domain cert protects *browser ↔ web server*.
  The *Node ↔ Postgres* hop only needs TLS when the database is remote. As built,
  `server/db.js` enables client TLS when `NODE_ENV=production` — if your Postgres
  is co-located, keep it on the same host and local-only; if it's a managed
  remote instance, prefer an explicit `DATABASE_SSL`-style switch with the
  provider's CA pinned instead of keying TLS off the environment.
- Set `NODE_ENV=production` in the deployed environment — that also flips session
  cookies to `secure`.
- Rotate `SESSION_SECRET` and the database password as part of every go-live
  checklist. Sessions reset on rotation; accounts are unaffected.
- The `session` table (cookie-backed sessions) is created automatically by
  `connect-pg-simple` if missing.

## Security notes

- Parameterized SQL only — `$1` placeholders throughout, never string-built queries
- Auth and vault routes rate-limited; unknown usernames receive a dummy salt for
  auth-params so the API can't be used to enumerate accounts
- Vault entry IDs are validated as safe integers; every vault query is scoped by
  the session's user ID
- Error handler never leaks stack traces to clients
- No secrets, plaintext or derived, are ever logged server-side

## Roadmap

- [ ] Update/edit entries (the `updated_at` column is already in the schema)
- [ ] Entry search + tags
- [ ] Encrypted import/export of vault data
- [ ] Account deletion (full zero-knowledge erasure)
- [ ] Automated test suite (`test/` is waiting to be fed)
- [ ] Attach the SearXNG-backed public status page tooling *(unrelated to vault — personal infra)*

---

*Kryptik Passcodes © Gonzo Codes. Built from scratch — vanilla JS, real crypto, no framework shortcuts.*
