// Configuración de TU despliegue. Copia este fichero a config.js (junto a
// index.html) y cambia los valores. config.js no se sube al repo: no subas
// nunca tus coordenadas, direcciones ni nombres a un repositorio público.
window.PANEL_CONFIG = {
  titulo: 'Mesh<span>Core</span> Panel',      // admite <span> para el color del logo
  subtitulo: 'Panel de equipos — Mi pueblo',
  lugar: 'Mi pueblo, Mi provincia',             // texto bajo el mapa
  terminalUrl: '',                              // p. ej. 'https://<IP-de-tu-Pi>:7443' (vacío = sin enlace)
  mapaZoom: 10,

  // Tu repetidor (el nombre debe coincidir con el que anuncia por radio).
  repetidor: { nombre: 'MI-REPETIDOR', lat: 40.4168, lon: -3.7038,
               antena: 'Omni 868 MHz · 6 dBi', banda: 'EU868' },

  // Tus dos companion. "sitio" es solo el punto de partida en el mapa:
  // arrastra la chincheta al sitio real (se guarda en tu navegador).
  wios: {
    1: { nombre: 'MeshCore-WIO1', sitio: 'Casa 1', lat: 40.42, lon: -3.70 },
    2: { nombre: 'MeshCore-WIO2', sitio: 'Casa 2', lat: 40.41, lon: -3.71 },
  },

  // Infraestructura ajena de referencia (datos públicos). La primera es el
  // objetivo por defecto del análisis de enlace.
  infra: [
    { name: 'REPETIDOR-DEL-MONTE', lat: 40.45, lon: -3.65, tipo: 'Repetidor',
      radio: '869.618 MHz · BW 62.5 · SF7 · CR6', nota: 'Repetidor de referencia de la zona.' },
  ],

  // HTML opcional: enlace al grupo de tu comunidad y notas propias (pestaña Red).
  comunidadHtml: '',
  notasHtml: '',
};
