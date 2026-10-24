// Estado guardado del navegador para las pruebas y las capturas: contactos y mensajes INVENTADOS
// (nada real). Se inyecta antes de cargar el panel, como si ya lo hubieras usado.
(() => {
  let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const base = [['REPETIDOR-DEL-MONTE', 40.45, -3.65, 2, 0], ['RPT-NORTE', 40.55, -3.70, 2, 1], ['RPT-SIERRA', 40.62, -3.95, 2, 2],
                ['RPT-SUR', 40.30, -3.72, 2, 1], ['RPT-ESTE', 40.43, -3.40, 2, 3], ['MI-REPETIDOR', 40.4168, -3.7038, 2, 0]];
  const contacts = base.map(([name, lat, lon, adv, hops], i) => ({ pubkey: (i + 16).toString(16).padStart(2, '0').repeat(32),
    advType: adv, name, lat, lon, hops, lastAdvert: Math.floor(Date.now() / 1000) - Math.floor(r() * 7200) }));
  for (let i = 0; i < 40; i++) contacts.push({ pubkey: (i + 80).toString(16).padStart(2, '0').repeat(32),
    advType: r() < .2 ? 2 : 1, name: 'NODO-' + (200 + i), lat: 40.2 + r() * 0.6, lon: -4.0 + r() * 0.8,
    hops: r() < .35 ? Math.floor(r() * 5) : null, lastAdvert: Math.floor(Date.now() / 1000) - Math.floor(r() * 3 * 86400) });
  localStorage.setItem('meshcore-neighbors-2', JSON.stringify({ ts: Date.now(), contacts }));

  const now = Date.now(), min = 60000;
  const M = [
    ['in', 'Nodo Norte', 'Buenos días a todos, probando el repetidor nuevo de la sierra', 22, 8],
    ['in', 'Ana Costa', '@[Nodo Norte] te recibo a 2 saltos, SNR bueno', 22, 7],
    ['in', 'Base Sur', 'Quedada de la red este sábado: más info en https://example.com/quedada', 22, 6],
    ['in', 'Mario', '@[Ana Costa] ¿qué antena usas en el companion?', 20, 3],
    ['in', 'Ana Costa', 'Una omni de 3 dBi en la ventana, nada especial', 18, 2],
    ['in', 'Nodo Norte', 'Alguien oye el canal desde el valle?', 15, 1],
    ['in', 'Base Sur', 'Te oigo directo, 5 dB de SNR', 12, 2],
    ['in', 'Mario', 'Buen día, probando desde la costa', 10, 1],
    ['in', 'Ana Costa', 'teste', 8, 0],
    ['out', null, 'Hola, os recibo bien por aquí', 6, 0],
  ];
  const log = M.map(([cls, who, text, h, m], i) => ({
    cls, who: cls === 'out' ? null : 'Canal 0', text: cls === 'in' ? who + ': ' + text : text,
    meta: cls === 'in' ? '09:' + (10 + i) + ' · SNR 6 dB · vía WIO1' : '13:40 · enviado por WIO1 · Public',
    dedupKey: null, kind: 'chan0', at: now - h * 60 * min + m * min }));
  localStorage.setItem('meshcore-chat-log', JSON.stringify(log));
})();
