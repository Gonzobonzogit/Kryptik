const PBKDF2_ITERATIONS = 600000;
const enc = new TextEncoder();
const dec = new TextDecoder();

let sessionKey = null;

const b64= (buf) => btoa(String.fromCharCode(... new Uint8Array(buf)));
const unb64 = (str) => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');


const generateSalt = () => b64(crypto.getRandomValues(new Uint8Array(32)));

const deriveMasterSecret = async(masterPassword, saltB64) => {
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey, 256
  );
};


const hkdf = (master) => {
  return crypto.subtle.importKey(
    'raw', 
    master, 
    'HKDF', 
    false, 
    [ 'deriveBits', 'deriveKey' ]
  );
};

const deriveAuthVerifier = async(masterPassword, saltB64) => {
  const authBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('kryptik-auth-v1') },
    await hkdf(await deriveMasterSecret(masterPassword, saltB64)),
    256
  );
  return toHex(await crypto.subtle.digest('SHA-256', authBits));
};

const deriveSessionKey = async(masterPassword, saltB64) => {
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode('kryptik-enc-v1') },
    await hkdf(await deriveMasterSecret(masterPassword, saltB64)),
    { name: 'AES-GCM', length: 256 },
    true, 
    ['encrypt', 'decrypt']
  );
};

const encryptString = async(plaintext) => {
  if(!sessionKey) throw new Error('Vault is Locked. Please log in.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, enc.encode(plaintext));
  const packed = new Uint8Array(12 + ct.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ct), 12);
  return b64(packed);
};

const decryptString = async(packedB64) => {
  if(!sessionKey) throw new Error("Vault is locked. Please log in.")
  const packed = unb64(packedB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packed.slice(0, 12) }, sessionKey, packed.slice(12) 
  );
  return dec.decode(pt);
};

const setSessionKey = async (key) => {
  sessionKey = key;
  const raw = await crypto.subtle.exportKey('raw', key);
  sessionStorage.setItem('pf_key', b64(raw));
};

const clearSessionKey = () => { 
  sessionKey = null;
  sessionStorage.removeItem('pf_key');
};

const restoreSessionKey = async () => {
  const stored = sessionStorage.getItem('pf_key');
  if(stored) sessionKey = await crypto.subtle.importKey('raw', unb64(stored), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};
restoreSessionKey();


window.PF = { generateSalt, deriveAuthVerifier, deriveSessionKey, setSessionKey, clearSessionKey, encryptString, decryptString };
