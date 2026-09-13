const form = document.querySelector('#lead-form');
const success = document.querySelector('#success');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  const payload = Object.fromEntries(new FormData(form).entries());
  button.disabled = true;
  button.textContent = 'Odesílám…';
  try {
    const response = await fetch('/api/leads', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) throw new Error('Lead API unavailable');
    form.hidden = true; success.hidden = false;
    window.parent.postMessage({type:'fieldnote:lead-created',lead:payload}, '*');
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Odeslat poptávku →';
    alert('Formulář se nepodařilo odeslat. Zkuste to prosím později.');
  }
});
