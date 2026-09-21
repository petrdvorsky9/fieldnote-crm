const form = document.querySelector('#login-form');
const submit = document.querySelector('#submit');
const error = document.querySelector('#error');
const password = document.querySelector('#password');
let setup = false;
fetch('/api/auth/status').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(status => {
  if (status.authenticated) return location.replace('/#dashboard');
  setup = status.setup;
  if (setup) {
    document.querySelector('#heading').textContent = 'Make yourself at home.';
    document.querySelector('#description').textContent = 'Create your private account to open your studio. This one-time setup is available only on this computer.';
    password.autocomplete = 'new-password'; password.minLength = 14;
    document.querySelector('#password-hint').hidden = false;
    submit.textContent = 'Create account →';
  }
  submit.disabled = false;
}).catch(() => { error.textContent = 'Unable to connect. Refresh the page to try again.'; });
document.querySelector('#show-password').addEventListener('click', event => {
  const show = password.type === 'password'; password.type = show ? 'text' : 'password';
  event.target.textContent = show ? 'Hide' : 'Show'; event.target.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
form.addEventListener('submit', async event => {
  event.preventDefault(); submit.disabled = true; error.textContent = '';
  try {
    const response = await fetch(`/api/auth/${setup ? 'setup' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
    location.replace('/#dashboard');
  } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
});
