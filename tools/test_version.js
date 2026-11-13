// La versión vive en cuatro sitios; si no coinciden, el panel y el gateway dicen cosas distintas.
const fs = require('fs');
const leer = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const js = (leer('bridge/panel-principal.js').match(/const PANEL_VERSION='([\d.]+)'/) || [])[1];
const gw = (leer('bridge/meshcore_ble_gateway.py').match(/PANEL_VERSION = '([\d.]+)'/) || [])[1];
const rd = (leer('README.md').match(/Versión actual: \*\*([\d.]+)\*\*/) || [])[1];
const cl = (leer('CHANGELOG.md').match(/^## \[([\d.]+)\]/m) || [])[1];
let fallos = 0;
const exige = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); fallos++; } };
exige(js && gw && rd && cl, 'no encuentro la versión en ' + JSON.stringify({ js, gw, rd, cl }));
exige(js === gw, 'panel-principal.js (' + js + ') y el gateway (' + gw + ') no coinciden');
exige(js === rd, 'README (' + rd + ') no coincide con el panel (' + js + ')');
exige(js === cl, 'la entrada más reciente del CHANGELOG (' + cl + ') no coincide con el panel (' + js + ')');
if (fallos) process.exit(1);
console.log('OK versión', js);
