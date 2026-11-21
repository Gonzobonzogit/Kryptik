//THE WALL 

const liEntries = document.getElementById('vaultEntries');
const newVaultForm = document.getElementById('newVaultForm');
const siteNameInput = document.getElementById('websiteName');
const siteUserInput = document.getElementById('siteUser');
const newPassInput = document.getElementById('savedPass');
const generateBtn = document.getElementById('genNewPass');
const saveBtn = document.getElementById('saveNewEntry');
  

const PASSWORD_MASK = '••••••••';


const request = async(url, options = {}) => {
  const res = await fetch(url, {
    ...options,
    credentials: 'same-origin',
  });

  if(res.status === 401) {
      window.location.href = 'log-in.html';
      throw new Error('Session timeout, log in again please.');
  }

  const data = await res.json().catch(() => ({}));

  if(!res.ok){
    throw new Error(data.error || `Request failed(${res.status}).`);
  }

  return data;
};

const decryptOrNull = async(cipherTxt) => {
  try{
    return await PF.decryptString(cipherTxt);
  } catch {
    return null;
  }
};

const cpTxt = async(text) => {
  if(!navigator.clipboard?.writeText){
    throw new Error(
      'Clipboard is unavailable.'
    );
  }

  await navigator.clipboard.writeText(text);
};

const flashCopy = (button, normalLabel) => {
  button.textContent = 'Copied';

  window.setTimeout(() => {
    button.textContent = normalLabel;
  }, 1500);
};

const handleAction = (button, action) => {
  button.addEventListener('click', async() => {
    button.disabled = true;

    try{
      await action(); 
    } catch(err){
      alert(err.message || 'This action cannot be completed.');
    } finally {
      button.disabled = false;
    }
  });
};

const renderVault = async() => {
  if(!window.PF) {
    throw new Error('Your vault did not load. If this persists please open an issue on github.');
  }

  const data = await request('/api/vault');
  const entries = Array.isArray(data.entries) ? data.entries : [];

  liEntries.replaceChildren();

  if(entries.length === 0){
    const newVault = document.createElement('li');
    newVault.className = 'vaultIsNew';
    newVault.textContent = 
      'Welcome to your personal vault. After you forge a password you can save it and your user name to a specific website or service.';
    liEntries.appendChild(newVault);
    return;
  }
  
  for(const entry of entries){
    const [siteTxt, userTxt] = await Promise.all([
      decryptOrNull(entry.site_name),
      decryptOrNull(entry.site_username),
    ]);

    const li = document.createElement('li');
      li.className = 'vaultEntry';

    const site = document.createElement('span');
      site.className = 'websiteEntry';
      site.textContent = siteTxt ?? `[undecryptable]`;

    const user = document.createElement('span');
      user.className = 'usernameEntry';
      user.textContent = userTxt ?? `[undecryptable]`;

    const pass = document.createElement("span");
      pass.className = 'passwdEntry';
      pass.textContent = PASSWORD_MASK;

    let revealed = false;
    let decryptedPasswd = null;

    const hidePasswd = () => {
      revealed = false;
      decryptedPasswd = null;
      pass.textContent = PASSWORD_MASK;
      showEntryBtn.textContent = 'Show';
    };

  const showEntryBtn = document.createElement('button');
  showEntryBtn.type = 'button';
  showEntryBtn.textContent = 'Show';

  handleAction(showEntryBtn, async() => {
    if(revealed){
      hidePasswd();
      return;
    }

    let plaintext;

    try{
      plaintext = await PF.decryptString(entry.enc_pass);
    } catch{
      throw new Error(
        'Could not decrypt password.'
      );
    } 

    decryptedPasswd = plaintext;
    pass.textContent = plaintext;
    revealed = true;
    showEntryBtn.textContent = 'Hide';
  });

  const cpUserBtn = document.createElement('button');
  cpUserBtn.type = 'button';
  cpUserBtn.textContent = 'Copy username';
  cpUserBtn.disabled = userTxt === null;

  handleAction(cpUserBtn, async() => {
    await cpTxt(userTxt);
    flashCopy(cpUserBtn, 'Copy username');
  });

  const cpPassBtn = document.createElement('button');
  cpPassBtn.type = 'button';
  cpPassBtn.textContent = 'Copy password';

  handleAction(cpPassBtn, async() => {
    let plaintext;

    try{
      plaintext =
        decryptedPasswd ?? await PF.decryptString(entry.enc_pass);

      await cpTxt(plaintext);
    } catch(err){
      if(err.message?.includes('Clipboard')) throw err;
      throw new Error('Error decrypting or copying password.');
    }

    flashCopy(cpPassBtn, 'Copy password');
  });

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.textContent = 'Delete';

    handleAction(delBtn, async() => {
      const label = siteTxt ?? ' this entry';
      if(!window.confirm(`Delete ${label}?`)) return;

      await request(`/api/vault/${encodeURIComponent(entry.id)}`, {
        method: "DELETE",
      });

      await renderVault()
    });

    li.append(
      site,
      user,
      pass,
      showEntryBtn,
      cpUserBtn,
      cpPassBtn,
      delBtn
    );

    liEntries.appendChild(li);
  }
};


const handleSave = async(event) => {
  event.preventDefault();

  const siteName = siteNameInput.value.trim();
  const siteUser = siteUserInput.value.trim();
  const newPass = newPassInput.value;

  if(!siteName || !siteUser || !newPass){
    alert('Please Fill in all the fields.');
    return;
  }

  saveBtn.disabled = true;

  try{
    const [site, user, pass] = await Promise.all([
      PF.encryptString(siteName),
      PF.encryptString(siteUser),
      PF.encryptString(newPass),
    ]);

    await request('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type' : 'application/json' },
      body: JSON.stringify({ site, user, pass }),
    });

    newVaultForm.reset();
    newPassInput.type = 'password';
    await renderVault();
  } catch(err){
    alert(err.message || "Error saving this entry. Is it a duplicate?");
  } finally {
    saveBtn.disabled = false;
  }
};

newVaultForm.addEventListener('submit', handleSave);

generateBtn.addEventListener('click', () => {
  newPassInput.value = enhancePasswd(20);
  newPassInput.type = 'text';
  newPassInput.focus();
});

renderVault().catch((err) => {
  alert(err.message || 'Could not load the vault. If issue persists make an issue on  github')
})
