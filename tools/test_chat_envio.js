// El WIO de envío lo decide una sola función (panel-principal.js); si otro script la redefine, vuelve el fallo de 1.34.6.
const fs = require('fs'), d = __dirname + '/../bridge/';
const cuenta = f => (fs.readFileSync(d + f, 'utf8').match(/activeChatNode\s*=\s*function|function\s+activeChatNode/g) || []).length;
const fallos = [];
for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js')))
  if (cuenta(f) !== (f === 'panel-principal.js' ? 1 : 0)) fallos.push(f);
if (fallos.length) { console.error('activeChatNode mal definida en', fallos); process.exit(1); }
console.log('OK activeChatNode definida una sola vez');

// Comportamiento: se extrae la función real y se prueba con WIO simulados.
const src = fs.readFileSync(d + 'panel-principal.js', 'utf8');
const m = src.match(/function activeChatNode\(\)\{[\s\S]*?\n\}/);
if (!m) { console.error('no encuentro activeChatNode'); process.exit(1); }
const nodo = on => ({ device: { gatt: { connected: on } }, _hydrated: on });
const prueba = (w1, w2, ult) => {
  const wNodes = [null, nodo(w1), nodo(w2)], window = { _chatUltimoWio: ult };
  const n = new Function('wNodes', 'window', m[0] + ';return activeChatNode()')(wNodes, window);
  return n ? wNodes.indexOf(n) : 0;
};
const casos = [[true, true, 1, 1], [true, true, 2, 2], [true, true, undefined, 2], [true, false, 2, 1],
               [false, true, 1, 2], [false, false, 1, 0], [true, true, 7, 2]];
for (const [a, b, u, esperado] of casos)
  if (prueba(a, b, u) !== esperado) { console.error('FALLA', { a, b, u, esperado, obtenido: prueba(a, b, u) }); process.exit(1); }
console.log('OK activeChatNode elige bien en', casos.length, 'casos');
