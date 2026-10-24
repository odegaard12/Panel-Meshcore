// Cálculos de Analítica que no se ven a simple vista: contadores del repetidor que dan la vuelta o se
// reinician, picos de ruido y tramos con huecos. Se extraen de dashboard.html tal cual están.
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../dashboard.html', 'utf8');
function extrae(nombre) {
  const i = src.indexOf('function ' + nombre + '(');
  if (i < 0) throw new Error('no encuentro la función ' + nombre);
  let n = 0, k = src.indexOf('{', i);
  for (; k < src.length; k++) { if (src[k] === '{') n++; else if (src[k] === '}') { n--; if (!n) break; } }
  return src.slice(i, k + 1);
}
const nombres = ['mediana', 'percentil', 'deltasRepetidor', 'tramos', 'detectarPicos'];
const f = new Function(nombres.map(extrae).join('\n') + '\nreturn {' + nombres.join(',') + '};')();
let fallos = 0;
const igual = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error('FALLO:', msg, '->', JSON.stringify(a), 'esperado', JSON.stringify(b)); fallos++; } };

// percentiles
igual(f.percentil([1, 2, 3, 4, 5], .5), 3, 'mediana');
igual(f.percentil([1, 2, 3, 4, 5], .25), 2, 'primer cuartil');
igual(f.percentil([], .5), null, 'vacío');

// contadores del repetidor
const m = (at, up, o) => Object.assign({ at, uptime: up, recv_flood: 0, recv_direct: 0, dups_flood: 0, dups_direct: 0, airtime_rx: 0, airtime_tx: 0 }, o);
let d = f.deltasRepetidor([
  m(0, 100, { recv_flood: 10, recv_direct: 5, dups_flood: 65530, airtime_rx: 10, airtime_tx: 1 }),
  m(900, 1000, { recv_flood: 30, recv_direct: 9, dups_flood: 4, dups_direct: 2, airtime_rx: 40, airtime_tx: 3 }),
]);
igual(d.length, 1, 'un par de medidas, una diferencia');
igual([d[0].flood, d[0].direct, d[0].dup, d[0].rx, d[0].tx, d[0].up], [20, 4, 12, 30, 2, 900], 'diferencias (con vuelta de u16 en duplicados)');
igual(f.deltasRepetidor([m(0, 5000, {}), m(900, 50, {})]).length, 0, 'reinicio del repetidor: no se compara');
igual(f.deltasRepetidor([m(0, 100, {}), m(9000, 9100, {})]).length, 0, 'hueco de más de 2 h: no se compara');
d = f.deltasRepetidor([m(0, 100, { recv_flood: 50 }), m(900, 1000, { recv_flood: 10 })]);
igual(d[0].flood, null, 'un contador de 32 bits que baja no inventa números');

// tramos
const t = f.tramos([{ at: 0 }, { at: 100 }, { at: 5000 }, { at: 5100 }], 1000);
igual(t.map(x => x.length), [2, 2], 'tramos separados por un hueco');

// picos de ruido
const T = 1800000000;
const realNow = Date.now; Date.now = () => T * 1000;
const hist = [];
for (let i = 0; i < 30; i++) hist.push({ at: T - 86400 + i * 900, noise_floor: -112 });
hist[10].noise_floor = -103; hist[11].noise_floor = -104;      // un mismo pico (seguidos)
hist[25].noise_floor = -105;                                    // otro pico, más tarde
let r = f.detectarPicos(hist);
igual(r.base, -112, 'ruido normal');
igual(r.picos.length, 2, 'dos picos');
igual(r.picos[0].v, -103, 'el mayor primero');
igual(f.detectarPicos(hist.slice(0, 4)).picos.length, 0, 'con pocas medidas no se afirma nada');
Date.now = realNow;

if (fallos) process.exit(1);
console.log('OK');
