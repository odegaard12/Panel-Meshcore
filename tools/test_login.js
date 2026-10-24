// La página de acceso se puede rediseñar, pero estas protecciones y datos no se pueden perder.
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../bridge/login.html', 'utf8');
let fallos = 0;
const exige = (cond, msg) => { if (!cond) { console.error('FALLO:', msg); fallos++; } };
for (const id of ['f', 'u', 'p', 'b', 'm', 'ojo', 'caps']) exige(new RegExp('id="' + id + '"').test(s), 'falta el elemento #' + id);
exige(s.includes('u.origin === location.origin'), 'el ?next= debe exigir el mismo origen (redirección abierta)');
exige(s.includes("fetch('/api/auth/login'"), 'debe entrar por /api/auth/login');
exige(s.includes('autocomplete="username"') && s.includes('autocomplete="current-password"'), 'autocompletado del gestor de contraseñas');
exige(/id="m"[^>]*role="alert"|role="alert"[^>]*id="m"/.test(s), 'el error debe anunciarse (role=alert)');
exige(!/(src|href)="https?:/.test(s), 'la página de acceso no debe cargar nada de fuera');
exige(s.includes('prefers-reduced-motion'), 'las animaciones deben respetar «reducir movimiento»');
if (fallos) process.exit(1);
console.log('OK');
