// El destino de un mensaje privado se compara entero: «· a Ana» no es «· a Anabel».
// (1.30.1: borrar el chat de Ana borraba también lo enviado a Anabel.)
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../dashboard.html', 'utf8');
const m = src.match(/function metaEsA\(meta,n\)\{[^\n]*\}/);
if (!m) { console.error('FALLO: no encuentro metaEsA en dashboard.html'); process.exit(1); }
const metaEsA = new Function(m[0] + '; return metaEsA;')();
const casos = [
  ['13:40 · enviado por WIO1 · a Ana', 'Ana', true],
  ['13:40 · enviado por WIO1 · a Anabel', 'Ana', false],
  ['13:40 · enviado por WIO1 · a Anabel', 'Anabel', true],
  ['13:40 · enviado por WIO1 · a Ana María', 'Ana', false],
  ['13:40 · enviado por WIO1 · a Ana  ', 'Ana', true],   // espacios sobrantes
  ['13:40 · enviado por WIO1', 'Ana', false],
  [null, 'Ana', false],
];
let fallos = 0;
for (const [meta, n, esperado] of casos) {
  const v = metaEsA(meta, n);
  if (v !== esperado) { console.error('FALLO:', JSON.stringify(meta), n, '->', v, 'esperado', esperado); fallos++; }
}
if (fallos) process.exit(1);
console.log('OK', casos.length, 'casos');
