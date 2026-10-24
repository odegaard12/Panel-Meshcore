// Estructura del panel: ids únicos (un id repetido hace que el botón equivocado reciba el clic),
// lo que vive en Gestión y no en el Panel, y las zonas que usan los lectores de pantalla.
const fs = require('fs');
const html = fs.readFileSync(__dirname + '/../dashboard.html', 'utf8');
const cuerpo = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
let fallos = 0;
const exige = (c, m) => { if (!c) { console.error('FALLO:', m); fallos++; } };

const ids = [...cuerpo.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const cuenta = {}; ids.forEach(i => cuenta[i] = (cuenta[i] || 0) + 1);
const repetidos = Object.keys(cuenta).filter(i => cuenta[i] > 1);
exige(!repetidos.length, 'ids repetidos: ' + repetidos.join(', '));

const gestion = cuerpo.slice(cuerpo.indexOf('id="tab-gestion"'), cuerpo.indexOf('<footer>'));
for (const id of ['rak-remote-via', 'rak-remote-pass', 'btn-rak-remote-login', 'rak-remote-cmd', 'btn-rak-remote-send',
                  'btn-rak-legal', 'rak-legal-out', 'btn-w1-pausa', 'btn-w2-pausa', 'btn-w1-place', 'btn-w2-place',
                  'btn-w1-export', 'btn-w2-export'])
  exige(gestion.includes('id="' + id + '"'), '«' + id + '» debe estar en Gestión');
const panel = cuerpo.slice(cuerpo.indexOf('id="devpanel-rak"'), cuerpo.indexOf('id="tab-mapa"'));
for (const id of ['btn-rak-remote-login', 'btn-w1-pausa', 'btn-w1-place', 'btn-w1-export'])
  exige(!panel.includes('id="' + id + '"'), '«' + id + '» ya no debe estar en el Panel');
exige(/data-tab="gestion"/.test(cuerpo), 'falta la pestaña Gestión');
exige(['repetidor', 'equipos', 'acceso', 'datos'].every(s => gestion.includes('data-sub="' + s + '"')), 'faltan secciones de Gestión');

exige(/role="main"/.test(cuerpo), 'falta la zona principal (role="main")');
exige(/<nav class="tabs" aria-label=/.test(cuerpo) && /<nav class="top" aria-label=/.test(cuerpo), 'las dos barras de navegación necesitan nombre');
exige(/class="saltar" href="#contenido"/.test(cuerpo), 'falta el enlace para saltar al contenido');
const selects = [...cuerpo.matchAll(/<select\b[^>]*>/g)].map(m => m[0]);
exige(selects.every(s => /aria-label=|id="[^"]+"/.test(s)), 'desplegables sin identificar');
for (const s of selects) {
  const id = (s.match(/id="([^"]+)"/) || [])[1];
  const conLabel = /aria-label=/.test(s) || (id && new RegExp('for="' + id + '"').test(cuerpo));
  exige(conLabel, 'el desplegable #' + id + ' necesita nombre (label o aria-label)');
}
if (fallos) process.exit(1);
console.log('OK', ids.length, 'ids');
