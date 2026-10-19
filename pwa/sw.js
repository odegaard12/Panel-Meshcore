// Service worker mínimo: no guarda nada del panel (está tras login) ni toca la API,
// los WebSocket ni los mapas. Solo, si el panel no responde (sin red, Pi apagada),
// enseña una página clara en vez del error del navegador.
const PAGINA = '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Sin conexión</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0d12;color:#e6ebf1;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px">'
  + '<div><div style="font-size:22px;font-weight:600;margin-bottom:8px">No hay conexión con el panel</div>'
  + '<p style="color:#9aa6b3;max-width:34ch;margin:0 auto 20px">Comprueba que estás en tu red (o con tu VPN) y que la Raspberry está encendida.</p>'
  + '<button onclick="location.reload()" style="background:#3fd67a;color:#04170b;border:0;border-radius:10px;padding:10px 18px;font:600 15px system-ui;cursor:pointer">Reintentar</button></div></body></html>';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.mode !== 'navigate' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(fetch(r).catch(() => new Response(PAGINA, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
