// El WIO de envío lo decide una sola función (panel-principal.js); si otro script la redefine, vuelve el fallo de 1.34.6.
const fs = require('fs'), d = __dirname + '/../bridge/';
const cuenta = f => (fs.readFileSync(d + f, 'utf8').match(/activeChatNode\s*=\s*function|function\s+activeChatNode/g) || []).length;
const fallos = [];
for (const f of fs.readdirSync(d).filter(x => x.endsWith('.js')))
  if (cuenta(f) !== (f === 'panel-principal.js' ? 1 : 0)) fallos.push(f);
if (fallos.length) { console.error('activeChatNode mal definida en', fallos); process.exit(1); }
console.log('OK activeChatNode definida una sola vez');
