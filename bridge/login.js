(() => {
  'use strict';
  const form = document.getElementById('f');
  const btn  = document.getElementById('b');
  const msg  = document.getElementById('m');

  function fail(text) {
    msg.textContent = text;
    msg.classList.add('on');
    btn.disabled = false;
    document.getElementById('p').value = '';
    document.getElementById('p').focus();
    const c = document.querySelector('.card');   // el formulario se sacude: se ve que no ha entrado
    c.classList.remove('sacude'); void c.offsetWidth; c.classList.add('sacude');
  }

  // Ver u ocultar la contraseña y avisar del Bloq Mayús (en el móvil se teclea peor).
  const pw = document.getElementById('p'), ojo = document.getElementById('ojo'), caps = document.getElementById('caps');
  ojo.addEventListener('click', () => {
    const ver = pw.type === 'password';
    pw.type = ver ? 'text' : 'password';
    ojo.textContent = ver ? 'Ocultar' : 'Ver';
    ojo.setAttribute('aria-label', ver ? 'Ocultar la contraseña' : 'Ver la contraseña');
    pw.focus();
  });
  const revisaCaps = (e) => { caps.hidden = !(e.getModifierState && e.getModifierState('CapsLock')); };
  pw.addEventListener('keydown', revisaCaps);
  pw.addEventListener('keyup', revisaCaps);
  pw.addEventListener('blur', () => { caps.hidden = true; });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    msg.classList.remove('on');
    btn.disabled = true;
    btn.textContent = 'Comprobando...';
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          username: document.getElementById('u').value,
          password: document.getElementById('p').value
        })
      });
      if (r.ok) {
        // ?next= lo pone nginx al redirigir; solo se aceptan rutas internas
        // para que nadie pueda usar el login como redirector abierto.
        const next = new URLSearchParams(location.search).get('next') || '/';
        // '/\\otro.com' o '/%09/otro.com' pasaban el filtro anterior y el navegador
        // los trata como '//otro.com': se resuelve y se exige el mismo origen.
        let destino = '/';
        try { const u = new URL(next, location.origin); if (u.origin === location.origin) destino = u.pathname + u.search + u.hash; } catch (_) {}
        location.replace(destino);
        return;
      }
      const body = await r.json().catch(() => ({}));
      fail(body.error || 'Usuario o contraseña incorrectos.');
    } catch (e) {
      fail('No se puede contactar con el servidor: ' + e.message);
    } finally {
      btn.textContent = 'Entrar';
    }
  });
})();
