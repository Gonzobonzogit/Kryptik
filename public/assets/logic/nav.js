const thisPage = window.location.pathname.split('/').pop() || 'index.html'

const initNav = async() => {

    let username = null;

    try{
      const res = await fetch('/api/me', { credentials: 'same-origin' });
      if (res.ok) username = (await res.json()).username;
    } catch(_) { /*server unreachable -> render as guest*/ }



    const rightSide = username
      ? '<span class="nav-name"></span><button id="nav-logout">Log Out</button>'
      : '<a href="log-in.html" class="nav-link">Log In</a><a href="sign-up.html" class="nav-signup">Sign Up</a>';

    const vaultLink = username ? '<a href="vault.html" class="nav-link">My Vault</a>' : '';

    document.body.insertAdjacentHTML('afterbegin', `
      <nav id="kryptikNav">
        <div class="nav-left">
          <a href="index.html" class="nav-brand">
              <img src="assets/icon/lockup-horizontal-on-dark.svg" alt="app-logo" class="navIcon" width="200px" height="150px">
          </a>
          <a href="index.html" class="nav-link" id="navToChckr">Checker</a>
          ${vaultLink}
          <a href="contact.html" class="nav-link" id="navToContact">Contact Us</a>
          ${contactLink}
        </div>
        <div class="nav-right">
          ${rightSide}
        </div>
      </nav>
    `);


    document.querySelectorAll(`#nav .nav-link`).forEach(link => {
      if(link.getAttribute('href')=== thisPage) link.classList.add("active");
    });


    const navName = document.querySelector('.nav-name'); 
    if(navName) navName.textContent = username;

    const handleLogout = async() => {
      window.PF?.clearSessionKey?.();
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      window.location.href = 'log-in.html';
    };


    const navLogout = document.getElementById('nav-logout');
      if (navLogout)  navLogout.addEventListener('click', handleLogout)
}

initNav();
