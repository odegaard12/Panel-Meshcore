// node test_gateway_js.js  — ejercita meshcore-ble-gateway.js con un fetch falso.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

globalThis.window = globalThis;
globalThis.document = { getElementById: () => null, querySelector: () => null };
globalThis.$ = () => null;
globalThis.localStorage = { setItem() {} };
globalThis.setInterval = () => 0;
globalThis.setWConnectedUI = () => {};
const realSetImmediate = setImmediate;
globalThis.setTimeout = (f) => realSetImmediate(f);

let pushes = {};           // tipo -> {frame, at}
let alPedir = () => {};    // que pasa tras cada consulta de /pushes
const b64 = (arr) => Buffer.from(arr).toString('base64');
const resp = (obj) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });

globalThis.fetch = async (url, opts = {}) => {
  if (url.endsWith('/status')) return resp({ wios: [{ idx: 1, connected: false }, { idx: 2, connected: false }] });
  if (url.includes('/pushes')) { const r = resp({ pushes: JSON.parse(JSON.stringify(pushes)) }); alPedir(); return r; }
  if (url.includes('/binary_req')) return resp({ ok: true, tag: '41424344' });
  if (url.includes('/trace')) return resp({ ok: true });
  if (url.includes('/login')) return resp({ ok: true });
  throw new Error('url inesperada ' + url);
};

eval(fs.readFileSync(path.join(__dirname, 'meshcore-ble-gateway.js'), 'utf8'));

(async () => {
  // 1) Traceroute: antes lanzaba "Assignment to constant variable".
  let n = 0;
  pushes = {};
  const TAG = 0x01020304;
  const origRandom = Math.random; Math.random = () => TAG / 0xFFFFFFFF;
  alPedir = () => {
    n++;
    const tagLE = [4, 3, 2, 1];
    pushes['137'] = { frame: b64([0x89, 0, 1, 0, ...(n === 1 ? [9, 9, 9, 9] : tagLE), 0, 0, 0, 0, 0xAB, 8, 12]), at: 100 + n };
  };
  const tr = await rakSendTrace(1, 'ab', 60000);
  Math.random = origRandom;
  assert.strictEqual(tr.hops.length, 1);
  assert.strictEqual(tr.hops[0].hash, 'ab');
  console.log('traceroute ok:', JSON.stringify(tr));

  // 2) Estado: una 0x8C ajena (otro tag) no se toma como respuesta.
  n = 0; pushes = {};
  alPedir = () => {
    n++;
    const tag = n === 1 ? [0x5a, 0x5a, 0x5a, 0x5a] : [0x41, 0x42, 0x43, 0x44];
    const cuerpo = new Array(58).fill(0); cuerpo[0] = n === 1 ? 0x10 : 0x74; cuerpo[1] = 0x0e;
    pushes['140'] = { frame: b64([0x8C, 0, ...tag, ...cuerpo]), at: 200 + n };
  };
  const st = await rakRequestStatus(1, 'aa'.repeat(32), 60000);
  assert.strictEqual(st.bat_mv, 0x0e74, 'cogio la respuesta ajena: ' + st.bat_mv);
  console.log('estado ok: bat_mv', st.bat_mv);

  // 3) Login: un exito de antes no vale, y el 0x88 no pisa el veredicto.
  alPedir = () => {};
  pushes = { '133': { frame: '', at: 50 } };
  await rakRemoteLogin(1, 'aa'.repeat(32), 'x');
  let v = rakLoginPushVerdict(await rakGetWioStatus(1));
  assert.strictEqual(v, null, 'login viejo tomado como bueno');
  pushes['133'] = { frame: '', at: 60 }; pushes['136'] = { frame: '', at: 61 };
  v = rakLoginPushVerdict(await rakGetWioStatus(1));
  assert.strictEqual(v, 'success');
  pushes['134'] = { frame: '', at: 70 };
  v = rakLoginPushVerdict(await rakGetWioStatus(1));
  assert.strictEqual(v, 'failed');
  console.log('login ok');
  console.log('OK');
})().catch((e) => { console.error('FALLO', e); process.exit(1); });
