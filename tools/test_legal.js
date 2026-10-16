const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync(process.argv[2], 'utf8').replace(/\r\n/g, '\n');
const ini = html.indexOf('let esperaCli=null;');
const fin = html.indexOf("$('#btn-rak-legal').onclick");
assert(ini > 0 && fin > ini);
let enviados = [];
globalThis.rakRemoteCmd = async (via, pk, cmd) => { enviados.push(cmd); };
globalThis.rakRemotePubkey = 'aabbccddeeff00';
globalThis.rakRemoteVia = 1;
eval(html.slice(ini, fin).replace(/^(const|let) /gm, 'var ') + ';globalThis.T={respuestaRepetidor,preguntarRepetidor,veredictoLegal,numerosDe};');
const R=T;

(async () => {
  // Sin datos: no puede salir LEGAL.
  const v0 = R.veredictoLegal([], undefined, undefined, null);
  assert.strictEqual(v0.ok, false); assert.strictEqual(v0.faltan.length, 2);
  // Todo bien: LEGAL.
  const v1 = R.veredictoLegal([869.618, 62.5, 7, 6], 22, 9, 1.2);
  assert.strictEqual(v1.ok, true); assert.strictEqual(v1.faltan.length, 0);
  // Respuesta tardia de get radio mientras se espera get tx: se ignora.
  const uno = t => { const n = R.numerosDe(t); return n.length === 1 && n[0] >= -10 && n[0] <= 40; };
  const p = R.preguntarRepetidor('get tx', 2000, uno);
  R.respuestaRepetidor({ from: 'aabbccddeeff', text: '> 869.618,62.5,7,6' });
  R.respuestaRepetidor({ from: '112233445566', text: '> 20' });   // otro nodo
  R.respuestaRepetidor({ from: 'aabbccddeeff', text: '> 22' });
  assert.strictEqual(await p, '> 22');
  console.log('OK', enviados);
})().catch(e => { console.error('FALLO', e); process.exit(1); });
