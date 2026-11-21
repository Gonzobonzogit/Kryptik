require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const db =require('./db');

//Boot check
for( const key of ['DATABASE_URL', 'SESSION_SECRET']){
  if(!process.env[key]){
    console.error(`Missing required env variable ${key}`);
    process.exit(1);
  }
}

if(process.env.SESSION_SECRET.length < 32){
  console.error('SESSION_SECRET must be at least 32 chars in length.');
  process.exit(1);
}


const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

const SALT_RE = /^[A-Za-z0-9+/]{43}=$/;
const VERIFIER_RE = /^[0-9a-f]{64}$/;
const DUMMY_SALT = 'A'.repeat(43) + '=';
const DUMMY_VERIFIER = 'ab'.repeat(32);


app.use(helmet({
  contentSecurityPolicy:{
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
    },
  },
}));


app.use(express.json({ limit: '16kb' }));


app.use(session({
  store: new PgSession({ pool: db.pool , tableName:'session', createTableIfMissing:true }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie:{
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));


const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error:'Too many unsuccessful attempts. Try again in 15 minutes.' },
});

const requireAuth = (req, res, next) => {
  if(!req.session.userId) return res.status(401).json({ error: 'Not signed in.' });
  next();
};


const USERNAME_RE = /^[A-Za-z0-9._@-]{3,50}$/;

const startSession = (req, user) => new Promise((resolve, reject) => {
  req.session.regenerate((err) => {
    if(err) return reject(err);
    req.session.userId = user.id;
    req.session.username = user.username;
    resolve();
  });
});

app.get('/api/auth-params', authLimiter, async(req, res) => {
  try{
    const username = String(req.query.username || '').trim();
    const result = await db.query('SELECT salt FROM users WHERE username = $1', [username]);
    res.json({ salt: result.rows[0]?.salt ?? DUMMY_SALT })
  } catch (err){
    console.error('Authorization parameter error:', err.message);
    res.status(500).json({ error: 'Server side error.' })
  }
});

app.post('/api/signup', authLimiter, async (req, res) => {
  try{
    const { username, salt, verifier } = req.body || {};
    if(typeof username !== 'string' || typeof salt !== 'string' || typeof verifier !== 'string')
      return res.status(400).json({ error: 'Malformed sign up form.' });
    if(!SALT_RE.test(salt) || !VERIFIER_RE.test(verifier.toLowerCase()))
      return res.status(400).json({ error: 'Malformed sign up.' })

    const clean = username.trim();
    if(!USERNAME_RE.test(clean))
      return res.status(400).json({ error: 'Username can be 3-50 chars: letters, numbers, ._@-' });

    const result = await db.query(
      'INSERT INTO users (username, salt, verifier) VALUES ($1, $2, $3) RETURNING id, username',
      [clean, salt, verifier.toLowerCase()]      
    );
    await startSession(req, result.rows[0]);
    res.status(201).json({username: result.rows[0].username });
  } catch(err){
    if(err.code === '23505') return res.status(409).json({ error: 'Username has been taken. Please use another one.' });
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Server side error.' });
  };
});


app.post('/api/login', authLimiter, async (req, res) => {
  try{
    const { username, verifier } = req.body || {};
    if(typeof username !== 'string' || typeof verifier !== 'string' || !VERIFIER_RE.test(verifier.toLowerCase()))
      return res.status(400).json({ error: "Please enter your username and password." });

    const result = await db.query(
      'SELECT id, username, verifier FROM users WHERE username = $1',
      [username.trim()]
    );
    const user = result.rows[0];
    const given = Buffer.from(verifier.toLowerCase(), 'hex')
    const stored = Buffer.from(user ? user.verifier : DUMMY_VERIFIER, 'hex');
    const ok = given.length === stored.length && crypto.timingSafeEqual(given, stored); 
    if(!user || !ok) return res.status(401).json({ error: 'Incorrect username or password' });

    await startSession(req, user);
    res.json({ username: user.username });
  } catch(err){
    console.error('Login Error:', err.message);
    res.status(500).json({ error: 'Server side error.' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if(!req.session.userId) return res.status(401).json({ error:'Please sign in.' });
  res.json({ username: req.session.username });
});

app.get('/api/health', (req, res) => res.json({ ok: true }));


app.get('/api/vault', requireAuth, async (req, res) => {
  try{
    const result = await db.query(
      'SELECT id, site_name, site_username, enc_pass, created_at FROM vault_entries WHERE user_id = $1 ORDER BY created_at DESC',
      [req.session.userId]
    );
    res.json({ entries: result.rows });
  } catch(err) {
    console.error('Vault read error:', err.message);
    res.status(500).json({ error:'Server side error.' });
  }
});

app.post('/api/vault', requireAuth, async (req, res) => {
  try{
    const { site, user, pass } = req.body || {};
    if(typeof site !== 'string' || typeof user !== 'string' || typeof pass !== 'string')
        return res.status(400).json({ error: "Missing site, user, or password." });
    if(!site.trim() || !user.trim() || !pass)
      return res.status(400).json({ error: "Please fill out all fields" });
    if(site.length > 512 || user.length > 512 || pass.length > 512)
      return res.status(400).json({ error: 'Character limit reached.' });

    const result = await db.query(
      `INSERT INTO vault_entries (user_id, site_name, site_username, enc_pass)
       VALUES($1, $2, $3, $4)
       RETURNING id, site_name, site_username, enc_pass, created_at`,
      [req.session.userId, site.trim(), user.trim(), pass]
    );
    res.status(201).json({ entry: result.rows[0] });
  } catch(err){
    console.error('Error adding vault entry:', err.message);
    res.status(500).json({ error: 'Vault server error.' });
  }
});

app.delete('/api/vault/:id', requireAuth, async (req, res) => {
  try{
    const id = Number(req.params.id);
    if(!Number.isSafeInteger(id) || id < 1)
      return res.status(400).json({ error: "Invalid Id" });

    const result = await db.query(
      'DELETE FROM vault_entries WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.session.userId]
    );
    if(result.rowCount === 0) return res.status(404).json({ error: "Entry not found" });
    res.json({ ok: true });
  } catch(err){
    console.error('Vault delete error', err.message);
    res.status(500).json({ error: "Server side error." });
  }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Does not exist.' }));

//------Static version-------




app.use(express.static(path.join(__dirname, '../public'), { dotfiles: 'deny' }));

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Unknown Error. Please create github issue.'});
});

app.listen(PORT, () => console.log(`Kryptik Passcodes server running at http://localhost:${PORT}`))

