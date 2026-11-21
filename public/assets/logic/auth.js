
// ---- SIGNUP ----
const signupForm = document.getElementById('signup-form');

if (signupForm) {
  const userField = document.getElementById('user');
  const passField = document.getElementById('master-pass');

  passField.addEventListener('input', () => {
    if(!passField.value) { scoreStrength(0); return; }
    scoreStrength(passwdCheck(passField.value).score);
  });

  const handleSignup = async (event) => {
    event.preventDefault();
    const username = userField.value.trim();
    const masterPass = passField.value;
    const confirm = document.getElementById('pass-confirm').value;

    if (!username) return alert('Please enter your username.');
    if (masterPass !== confirm) return alert('Master passwords do not match.');

    const report = passwdCheck(masterPass);
    if (report.results.forbidden) return alert('Check forbidden password list. Enter a new password.');
    if (report.strength !== 'Strong') return alert('Master password is too weak.');

    try {
      const salt = PF.generateSalt();
      const verifier = await PF.deriveAuthVerifier(masterPass, salt);
      await PF.setSessionKey(await PF.deriveSessionKey(masterPass, salt));

      const res = await fetch('/api/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type' : 'application/json' },
        body: JSON.stringify({ username, salt, verifier }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        PF.clearSessionKey();
        return alert(data.error || 'Sign up attempt failed. Please try again.');
      }
      window.location.href = 'vault.html';
    } catch(err){
      PF.clearSessionKey();
      alert('Could not reach server. Is it running?');
    }
  };
  signupForm.addEventListener('submit', handleSignup);
}


// ---- LOGIN ----
const loginForm = document.getElementById('login-form');

if (loginForm) {
  const handleLogin = async (event) => {
    event.preventDefault();
    const username = document.getElementById('user-login').value.trim();
    const masterPass = document.getElementById('user-pass').value;
    if(!username || !masterPass) return alert('Please enter your username and master password.');

    try {
      const p = await fetch(`/api/auth-params?username=${encodeURIComponent(username)}`, { credentials: 'same-origin' });
      const { salt } = await p.json().catch(() => ({}));
      if(!salt) return alert('Can not reach server. Is it running?');

      const verifier = await PF.deriveAuthVerifier(masterPass, salt);
      await PF.setSessionKey(await PF.deriveSessionKey(masterPass, salt));

      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, verifier }),
      });
      const data = await res.json().catch(() => ({}));
      if(!res.ok) {
        PF.clearSessionKey();
        return alert(data.error || 'Invalid username or password.');
      }
      window.location.href = 'vault.html';
    } catch (err) {
      alert('Could not reach server. Is it running?');
    }
  };
  loginForm.addEventListener('submit', handleLogin);
}
