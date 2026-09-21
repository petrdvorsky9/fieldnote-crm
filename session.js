(() => {
  const originalFetch = window.fetch.bind(window);
  let expiry = 0, expiryTimer, pendingActivity, lastSent = 0;
  const redirect = () => { document.documentElement.style.visibility = 'hidden'; location.replace('/login'); };
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    if (response.status === 401) redirect();
    return response;
  };
  function schedule(expiresAt) {
    expiry = expiresAt;
    clearTimeout(expiryTimer);
    expiryTimer = setTimeout(() => checkSession(true), Math.max(0, expiry - Date.now()));
  }
  async function checkSession(atDeadline = false) {
    if (atDeadline) document.documentElement.style.visibility = 'hidden';
    try {
      const response = await fetch('/api/auth/status', { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw Error();
      const status = await response.json();
      if (!status.authenticated) return redirect();
      schedule(status.expiresAt);
      document.documentElement.style.visibility = '';
    } catch { if (atDeadline || (expiry && Date.now() >= expiry)) redirect(); }
  }
  async function sendActivity() {
    pendingActivity = null;
    lastSent = Date.now();
    try {
      const response = await fetch('/api/auth/activity', { method: 'POST' });
      if (response.ok) schedule((await response.json()).expiresAt);
    } catch { /* An unreachable server cannot extend the session. */ }
  }
  function activity(event) {
    if (!event.isTrusted || document.hidden) return;
    clearTimeout(pendingActivity);
    if (Date.now() - lastSent >= 1000) sendActivity();
    else pendingActivity = setTimeout(sendActivity, 1000 - (Date.now() - lastSent));
  }
  for (const name of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart']) {
    document.addEventListener(name, activity, { passive: true, capture: true });
  }
  const actions = document.querySelector('.top-actions');
  if (actions) {
    const logout = document.createElement('button');
    logout.textContent = 'Sign out'; logout.className = 'outline-button';
    actions.prepend(logout);
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      clearTimeout(pendingActivity);
      try {
        const response = await fetch('/api/auth/logout', { method: 'POST' });
        if (!response.ok) throw Error();
        redirect();
      } catch { logout.disabled = false; alert('Unable to sign out. Please try again.'); }
    });
  }
  window.addEventListener('pagehide', () => { document.documentElement.style.visibility = 'hidden'; });
  window.addEventListener('pageshow', () => checkSession());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
  setInterval(() => checkSession(), 30000);
  checkSession();
})();
