const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
// Todo texto que venga de la radio (nombres de nodo, pubkeys) pasa por aqui
// antes de acabar en HTML: el nombre lo elige quien emite, no nosotros.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Todo lo propio de cada despliegue (nombres, posiciones, enlaces) vive en
// config.js, que no va al repo: ver config.example.js. Sin él, valores neutros.
const CFG=Object.assign({
  titulo:'Mesh<span>Core</span> Panel', subtitulo:'Panel de equipos', lugar:'', terminalUrl:'',
  repetidor:{nombre:'MI-REPETIDOR', lat:40.4168, lon:-3.7038, antena:'', banda:'EU868'},
  wios:{1:{nombre:'MeshCore-WIO1', sitio:'Casa 1', lat:40.42, lon:-3.70}, 2:{nombre:'MeshCore-WIO2', sitio:'Casa 2', lat:40.41, lon:-3.71}},
  infra:[], mapaZoom:10, comunidadHtml:'', notasHtml:''
}, window.PANEL_CONFIG||{});
const REPEATER_POS=[CFG.repetidor.lat, CFG.repetidor.lon];
const REP_NOMBRE=CFG.repetidor.nombre;
const PANEL_VERSION='1.34.0';
$('#panelVersion').textContent='v'+PANEL_VERSION;
// Sin config.js propio el panel funciona, pero con nombres de ejemplo que no
// cuadran con ninguna radio: avisarlo para que no parezca un fallo.
if(!window.PANEL_CONFIG || REP_NOMBRE==='MI-REPETIDOR') $('#cfgAviso').hidden=false;
// Puntos de partida de los WIO (arrastra la chincheta al sitio exacto: queda en
// este navegador y NO se emite por radio).
const NODE_SITES={
  1:{label:CFG.wios[1].sitio, lat:CFG.wios[1].lat, lon:CFG.wios[1].lon},
  2:{label:CFG.wios[2].sitio, lat:CFG.wios[2].lat, lon:CFG.wios[2].lon}
};
// Infraestructura ajena de referencia; la primera es el objetivo de enlace.
const INFRA=CFG.infra;
// Nombres propios (los WIO y el repetidor) para marcarlos como "tuyos".
const MIOS=[REP_NOMBRE, CFG.wios[1].nombre, CFG.wios[2].nombre].map(x=>String(x).toLowerCase());
const esMio=n=>{ n=String(n||'').toLowerCase(); return MIOS.some(m=>m && (n===m || n.endsWith(m.replace(/^meshcore-/,'')))); };
(function aplicarConfig(){
  $('#cfg-titulo').innerHTML=CFG.titulo;
  $('#cfg-subtitulo').textContent=CFG.subtitulo;
  document.title=CFG.titulo.replace(/<[^>]+>/g,'');
  if(CFG.terminalUrl){ const t=$('#cfg-terminal'); t.href=CFG.terminalUrl; t.hidden=false; }
  $$('.cfg-rep').forEach(e=>e.textContent=REP_NOMBRE);
  $$('.cfg-wio1').forEach(e=>e.textContent=CFG.wios[1].nombre);
  $$('.cfg-wio2').forEach(e=>e.textContent=CFG.wios[2].nombre);
  $$('.cfg-lugar').forEach(e=>e.textContent=CFG.lugar);
  $('#cfg-coords').textContent=REPEATER_POS[0].toFixed(5)+', '+REPEATER_POS[1].toFixed(5);
  if(CFG.repetidor.antena) $('#mapAnt').textContent=CFG.repetidor.antena;
  if(CFG.comunidadHtml) $('#cfg-comunidad').innerHTML=CFG.comunidadHtml;
  if(CFG.notasHtml){ $('#red-notas').innerHTML=CFG.notasHtml; $('#nav-red-notas').hidden=false; }
})();

// Distancia en km entre dos puntos (haversine)
function bearingDeg(a,b){
  const r=x=>x*Math.PI/180, dLon=r(b[1]-a[1]);
  const y=Math.sin(dLon)*Math.cos(r(b[0]));
  const x=Math.cos(r(a[0]))*Math.sin(r(b[0]))-Math.sin(r(a[0]))*Math.cos(r(b[0]))*Math.cos(dLon);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function rumbo(d){
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];
  return dirs[Math.round(d/22.5)%16];
}
function distKm(a,b){
  const R=6371, rad=x=>x*Math.PI/180;
  const dLat=rad(b[0]-a[0]), dLon=rad(b[1]-a[1]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(h));
}

// Declarados aqui arriba a proposito: el mapa (refreshMarkers/placeMarker) los
// consulta al arrancar, y al ser const daban ReferenceError por zona muerta
// temporal, lo que mataba el resto del script y dejaba los botones sin listener.
const wNodes={1:null,2:null};

// ============ Pestañas ============
let unreadChat=0;
function showTab(name){
  const venia=document.querySelector('.tabview.on')?.id;   // pestaña de la que se sale
  if(name==='mapa'){ name='equipos'; setTimeout(()=>document.querySelector('.devTab[data-dev="mapa"]')?.click(),0); }
  document.querySelectorAll('nav.tabs button').forEach(b=>{ const on=b.dataset.tab===name; b.classList.toggle('on',on); b.setAttribute('aria-current',on?'page':'false'); });
  document.querySelectorAll('.tabview').forEach(v=>v.classList.toggle('on',v.id==='tab-'+name));
  if(venia==='tab-chat' && name!=='chat') marcarChatVisto();
  if(name==='chat'){ unreadChat=0; updateChatBadge(); fitChatCardToViewport(); requestAnimationFrame(()=>posicionarChat()); }
  if(name==='mapa') fitMapWrapToViewport();
  // Un solo mapa (el completo, con sus capas y herramientas): vive en el
  // Panel y se lleva al Chat cuando se abre.
  if(name==='equipos'||name==='chat'){
    const destino=document.getElementById('tab-'+name), m=$('#map');
    if(m && m.parentNode!==destino) destino.prepend(m);
    setTimeout(pintarEqMap,30);
  }
  if(name==='stats'){ statsAnimaKpis=true; renderStats(true); pintarHistoricoRak(); }
  if(name==='gestion') gestionAlAbrir();
  try{ history.replaceState(null,'',name==='equipos'?location.pathname+location.search:'#'+name); }catch(e){}
}
// Al recargar se vuelve a la pestaña en la que estabas (va en la URL: #mapa…).
window.addEventListener('load',()=>{
  const t=(location.hash||'').slice(1);
  if(t && document.querySelector('nav.tabs button[data-tab="'+t+'"]')) showTab(t);
});
$$('.red-nav').forEach(btn=>{
  btn.onclick=()=>{
    const el=document.getElementById(btn.dataset.target);
    if(el) el.scrollIntoView({block:'start'});
  };
});
function fitChatCardToViewport(){
  const card=$('.chatcard');
  if(!card) return;
  const top=card.getBoundingClientRect().top;
  card.style.height=Math.max(500,window.innerHeight-top-16)+'px';
}
// El mapa pide "toda la pagina": en vez de adivinar un numero fijo de px para
// restar (cabecera + pestañas cambian de alto con el tema/pantalla), se mide
// donde empieza de verdad el mapa y se estira hasta el borde real de la ventana.
function fitMapWrapToViewport(){
  const wrap=$('.mapWrap');
  if(!wrap) return;
  const top=wrap.getBoundingClientRect().top;
  wrap.style.height=Math.max(400,window.innerHeight-top-16)+'px';
  if(window.map) setTimeout(()=>map.invalidateSize(),50);
}
window.addEventListener('resize',()=>{
  if($('#tab-mapa').classList.contains('on')) fitMapWrapToViewport();
  if($('#tab-chat').classList.contains('on')) fitChatCardToViewport();
});
const TITULO_BASE=document.title;
function updateChatBadge(){
  // Con la pestaña del navegador en segundo plano, el numero se ve en el titulo.
  document.title=(unreadChat>0?'('+unreadChat+') ':'')+TITULO_BASE;
  const b=$('#chatBadge');
  if(unreadChat>0){ b.style.display='inline-block'; b.textContent=unreadChat; }
  else b.style.display='none';
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

// ============ Estado persistente de cada nodo ============
// Guarda lo último visto de cada WIO para poder mirar el estado sin conectar.
function saveNodeState(idx,data){
  const prev=loadNodeState(idx)||{};
  try{ localStorage.setItem('meshcore-w'+idx+'-state',JSON.stringify({...prev,...data,seen:Date.now()})); }catch(e){}
}
function loadNodeState(idx){
  try{ return JSON.parse(localStorage.getItem('meshcore-w'+idx+'-state')||'null'); }
  catch(e){ return null; }
}
function duracionTxt(s){
  if(s<60) return s+' s';
  if(s<3600) return Math.floor(s/60)+' min';
  if(s<86400) return Math.floor(s/3600)+' h';
  const d=Math.floor(s/86400);
  return d+(d===1?' día':' días');
}
function humanAgo(ts){
  if(!ts) return 'nunca';
  const s=Math.floor((Date.now()-ts)/1000);
  // La hora de un anuncio la pone el reloj del OTRO nodo: si lo tiene
  // adelantado sale en el futuro ("hace -74116 s"). Se dice tal cual.
  if(s<-120) return 'reloj del nodo adelantado '+duracionTxt(-s);
  if(s<5) return 'ahora';
  return 'hace '+duracionTxt(s);
}

// ================= MAP =================
// Arranca alrededor del repetidor; "Ver todo" enseña la red entera.
const map=L.map('map',{scrollWheelZoom:true,zoomControl:true}).setView(REPEATER_POS,CFG.mapaZoom);
window.map=map;
// Fondo oscuro por defecto (el claro de OSM deslumbraba junto al panel), con
// selector para calles, satelite o relieve; se recuerda la eleccion.
const FONDOS={
  // CARTO ya pide clave de API; el gris oscuro de Esri no, y trae rotulos aparte.
  'Oscuro':L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      {attribution:'&copy; Esri, HERE, Garmin, &copy; OpenStreetMap',maxZoom:16}),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      {maxZoom:16,pane:'overlayPane'})]),
  'Calles':L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {attribution:'&copy; OpenStreetMap',maxZoom:19}),
  'Satélite':L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {attribution:'&copy; Esri',maxZoom:19}),
  'Relieve':L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    {attribution:'&copy; OpenStreetMap &copy; OpenTopoMap',maxZoom:17}),
};
let fondoGuardado='Oscuro';
try{ const f=localStorage.getItem('meshcore-map-fondo'); if(f && FONDOS[f]) fondoGuardado=f; }catch(e){}
FONDOS[fondoGuardado].addTo(map);
L.control.layers(FONDOS,null,{position:'topright'}).addTo(map);
map.on('baselayerchange',e=>{ try{ localStorage.setItem('meshcore-map-fondo',e.name); }catch(err){} });
// Leyenda: que es cada simbolo y que significa el color del borde.
const leyenda=L.control({position:'bottomleft'});
leyenda.onAdd=()=>{
  const d=L.DomUtil.create('div','mapLegend');
  d.innerHTML='<details'+(window.innerWidth<700?'':' open')+'><summary>Leyenda</summary>'+
    '<div><span class="lg" style="border-color:#3fd67a;background:#0d3a24">📡</span>Tu repetidor</div>'+
    '<div><span class="lg" style="border-color:#4a5666">📶</span>Tus WIO</div>'+
    '<div><span class="lg" style="border-color:#5eb3f5;background:#0d1a26">🗼</span>Infraestructura ajena</div>'+
    '<div class="lgSep">Vecinos (color = saltos)</div>'+
    '<div><span class="lgDot" style="background:#3fd67a"></span>directo</div>'+
    '<div><span class="lgDot" style="background:#a78bfa"></span>1–2 saltos</div>'+
    '<div><span class="lgDot" style="background:#f0b429"></span>3 o más</div>'+
    '<div><span class="lgDot" style="background:#5c6b7d"></span>sin ruta fija (flood)</div></details>';
  L.DomEvent.disableClickPropagation(d);
  return d;
};
leyenda.addTo(map);
// Una capa por tipo de aparato: el selector de la tarjeta del mapa solo
// muestra/oculta cada capa entera, no toca los marcadores uno a uno.
const layerRak=L.layerGroup().addTo(map);
const layerWio=L.layerGroup().addTo(map);
const layerInfra=L.layerGroup().addTo(map);
const layerNeighbors=L.layerGroup().addTo(map);
const layerFresnel=L.layerGroup().addTo(map);

// Un emoji suelto sobre el tile claro de OSM se ve fatal y sin ancla queda
// descolocado del punto real. Fondo circular + borde + sombra + centrado.
function mapPin(emoji,size,bg,border){
  const s=size||30;
  return L.divIcon({
    html:'<div style="width:'+s+'px;height:'+s+'px;border-radius:50%;background:'+(bg||'#141b26')+
      ';border:2px solid '+(border||'#232e3d')+';box-shadow:0 1px 4px rgba(0,0,0,.5);'+
      'display:flex;align-items:center;justify-content:center;font-size:'+Math.round(s*0.55)+'px">'+emoji+'</div>',
    className:'',iconSize:[s,s],iconAnchor:[s/2,s/2],popupAnchor:[0,-s/2]
  });
}
const rakIcon=mapPin('📡',32,'#0d3a24','#3fd67a');
L.marker(REPEATER_POS,{icon:rakIcon}).addTo(layerRak).bindPopup('<b>'+esc(REP_NOMBRE)+'</b><br>Tu repetidor');
// Cobertura orientativa, no una promesa: SF7/BW62.5 en llano da unos 3-5 km,
// con línea de vista despejada (como a un monte cercano) puede llegar mucho más lejos.
L.circle(REPEATER_POS,{radius:4000,color:'#3fd67a',weight:1,opacity:.4,fillOpacity:.04,dashArray:'4,6'})
  .addTo(layerRak).bindTooltip('Alcance orientativo ~4 km (terreno llano, SF7)',{permanent:false});

let w1Marker=null, w2Marker=null, placingIdx=null;
// Aviso flotante sobre el mapa (colocar y medir). Se crea al hacer falta y se esconde solo.
function avisoMapa(texto,color){
  let h=document.getElementById('mapHint');
  if(!h){
    h=document.createElement('div'); h.id='mapHint'; h.setAttribute('role','status');
    h.style.position='fixed'; h.style.left='50%'; h.style.bottom='34px';
    document.body.appendChild(h);
  }
  h.textContent=texto||''; h.hidden=!texto; h.style.color=color||'';
  clearTimeout(h._t);
  if(texto) h._t=setTimeout(()=>{ if(!placingIdx && !measuring) h.hidden=true; },9000);
}
function loadSavedPos(idx){
  const raw=localStorage.getItem('meshcore-w'+idx+'-pos');
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch(e){ return null; }
}
function markerPopup(idx,aprox){
  const st=loadNodeState(idx)||{};
  const online = wNodes[idx] && wNodes[idx].device && wNodes[idx].device.gatt.connected && wNodes[idx]._hydrated;
  let h='<b>'+esc(st.name||('WIO'+idx))+'</b><br>';   // el nombre viene del nodo y de localStorage
  h+= online ? '<span style="color:#3fd67a">● conectado ahora</span><br>'
             : '<span style="color:#8b98a8">○ visto '+humanAgo(st.seen)+'</span><br>';
  if(st.batt!=null) h+='Batería: <b>'+st.batt+'%</b> ('+(st.mv/1000).toFixed(2)+'V)<br>';
  if(st.freq)      h+='Radio: '+st.freq.toFixed(3)+' MHz · SF'+st.sf+'<br>';
  if(st.tx!=null)  h+='TX: '+st.tx+' dBm';
  h+='<br><span style="color:#8b98a8">'+esc(NODE_SITES[idx].label)+'</span>';
  const pos=(idx===1?w1Marker:w2Marker);
  if(pos){
    const d=distKm([pos.getLatLng().lat,pos.getLatLng().lng],REPEATER_POS);
    h+='<br>A '+d.toFixed(2)+' km del repetidor';
  }
  if(aprox) h+='<br><i style="color:#f0b429">Posición aproximada (centro del municipio).<br>Arrástrala al portal exacto.</i>';
  return h;
}
function placeMarker(idx,lat,lon,aprox){
  const pos=[parseFloat(lat),parseFloat(lon)];
  if(isNaN(pos[0])||isNaN(pos[1])) return;
  const existing = idx===1?w1Marker:w2Marker;
  if(existing) map.removeLayer(existing);
  const online = wNodes[idx] && wNodes[idx].device && wNodes[idx].device.gatt.connected;
  const ic=mapPin('📶',30,online?'#0d3a24':'#141b26',online?'#3fd67a':'#4a5666');
  const m=L.marker(pos,{icon:ic,draggable:true}).addTo(layerWio).bindPopup(markerPopup(idx,aprox));
  m.on('dragend',()=>{
    const p=m.getLatLng();
    try{ localStorage.setItem('meshcore-w'+idx+'-pos',JSON.stringify({lat:p.lat,lon:p.lng})); }catch(e){}
    m.setPopupContent(markerPopup(idx,false));
    // Bug real: al arrastrar solo se guardaba la posicion, la linea al
    // repetidor se quedaba donde estaba antes de mover el pin.
    drawLink(idx,[p.lat,p.lng],online);
  });
  if(idx===1) w1Marker=m; else w2Marker=m;
  drawLink(idx,pos,online);
}

const links={1:null,2:null};
function drawLink(idx,pos,online){
  if(links[idx]) map.removeLayer(links[idx]);
  const d=distKm(pos,REPEATER_POS);
  links[idx]=L.polyline([pos,REPEATER_POS],{
    color: online?'#3fd67a':'#4a5666', weight:2, dashArray:'6,6', opacity:.8
  }).addTo(layerWio).bindTooltip(d.toFixed(2)+' km al repetidor',{permanent:false});
}
[1,2].forEach(idx=>{
  const b=document.getElementById('btn-w'+idx+'-place');
  if(!b) return;
  b.onclick=()=>{
    showTab('mapa');
    const s=loadSavedPos(idx);
    // Sin posicion guardada se deja al lado del repetidor para arrastrarlo.
    const pos=s? [s.lat,s.lon] : [REPEATER_POS[0]+0.002*idx, REPEATER_POS[1]+0.002];
    placeMarker(idx,pos[0],pos[1],!s);
    const m=idx===1?w1Marker:w2Marker;
    setTimeout(()=>{ map.setView(pos,16); if(m) m.openPopup(); },120);
  };
});
// Redibuja marcadores usando la última posición conocida (anunciada o fijada a mano)
function refreshMarkers(){
  for(const idx of [1,2]){
    const st=loadNodeState(idx);
    const manual=loadSavedPos(idx);
    // Prioridad: posicion fijada a mano > posicion anunciada por el nodo
    let lat = (manual&&manual.lat) || (st&&st.lat);
    let lon = (manual&&manual.lon) || (st&&st.lon);
    let aprox=false;
    // Si nunca se ha visto el nodo, no inventamos nada
    if(!lat||!lon){
      // Sin posicion conocida: partimos del sitio declarado (centro del municipio)
      lat=NODE_SITES[idx].lat; lon=NODE_SITES[idx].lon; aprox=true;
    }
    if(lat&&lon) placeMarker(idx,lat,lon,aprox);
  }
}
[1,2].forEach(idx=>{
  // Rellenar tarjeta con lo último que supimos, sin necesidad de conectar
  const st=loadNodeState(idx);
  if(st){
    if(st.batt!=null){ $('#w'+idx+'-batt').textContent=st.batt+'% ('+(st.mv/1000).toFixed(2)+'V)'; setBattBar(idx,st.batt); }
    if(st.freq)     $('#w'+idx+'-freq').textContent=st.freq.toFixed(4)+' MHz';
    if(st.sf)       $('#w'+idx+'-radio').textContent=st.bw+' / SF'+st.sf+' / CR'+st.cr;
    if(st.name)     $('#w'+idx+'-name').textContent=st.name;
    if(st.tx!=null) $('#w'+idx+'-tx').textContent=st.tx+' dBm';
    $('#w'+idx+'-seen').textContent=humanAgo(st.seen);
    $('#devpanel-w'+idx)?.classList.add('stale');
    $('#w'+idx+'-log').textContent='Último estado conocido ('+humanAgo(st.seen)+'). Pulsa "Conectar" para datos en vivo.';
  }
  const saved=loadSavedPos(idx);
  if(saved) placeMarker(idx,saved.lat,saved.lon);
  $('#btn-w'+idx+'-place').onclick=()=>{
    showTab('equipos');   // el mapa está en el Panel (también si se pulsa desde Gestión)
    placingIdx=idx;
    avisoMapa('Modo colocar activo para WIO'+idx+': haz clic en el mapa donde está esa casa.','var(--warn)');
    map.getContainer().style.cursor='crosshair';
  };
});
// Infraestructura de referencia: repetidores ajenos que nos interesan
const infraIcon=mapPin('🗼',30,'#0d1a26','#5eb3f5');
INFRA.forEach(n=>{
  const pos=[n.lat,n.lon];
  const d=distKm(REPEATER_POS,pos), b=bearingDeg(REPEATER_POS,pos);
  L.marker(pos,{icon:infraIcon}).addTo(layerInfra).bindPopup(
    '<b>'+n.name+'</b><br><span style="color:#8b98a8">'+n.tipo+' · ajeno</span><br>'+
    n.radio+'<br><b>A '+d.toFixed(2)+' km</b> · rumbo '+b.toFixed(0)+'° ('+rumbo(b)+')<br>'+
    '<i style="color:#8b98a8">'+n.nota+'</i>');
  L.polyline([REPEATER_POS,pos],{color:'#5eb3f5',weight:2.5,opacity:.7})
    .addTo(layerInfra).bindTooltip(n.name+' · '+d.toFixed(2)+' km',{permanent:false});
});

refreshMarkers();

// Botones de capa: togglean su propia clase .on y entran/salen la capa Leaflet,
// sin recalcular nada — los marcadores siguen ahi, solo se ven o no.
const LAYER_MAP={rak:layerRak,wio:layerWio,infra:layerInfra,neighbors:layerNeighbors,fresnel:layerFresnel};
// Los grupos del mapa recuerdan si los dejaste abiertos o cerrados.
$$('.mapSidebar .mapGroup').forEach(d=>{
  const k='meshcore-mapgroup-'+d.dataset.g;
  const guardado=localStorage.getItem(k);
  if(guardado!==null) d.open = guardado==='1';
  d.addEventListener('toggle',()=>{
    try{ localStorage.setItem(k, d.open?'1':'0'); }catch(e){}
  });
});
$$('.mapSidebar .layer-toggle').forEach(btn=>{
  btn.onclick=()=>{
    btn.classList.toggle('on');
    const on=btn.classList.contains('on');
    const key=btn.dataset.layer;
    if(key==='near'){ renderAllNeighbors(); return; } // no es una capa Leaflet, es el filtro <150km
    const layer=LAYER_MAP[key];
    if(layer) on ? map.addLayer(layer) : map.removeLayer(layer);
  };
});

function fitMapToEverything(){
  const pts=[REPEATER_POS,...INFRA.map(n=>[n.lat,n.lon])];
  if(w1Marker) pts.push(w1Marker.getLatLng());
  if(w2Marker) pts.push(w2Marker.getLatLng());
  // Los vecinos leidos por los WIO pueden estar a cientos de km (red iberica):
  // sin esto, "Ver todo" se queda solo con tu zona y no los incluye.
  layerNeighbors.eachLayer(m=>{ if(m.getLatLng) pts.push(m.getLatLng()); });
  map.fitBounds(pts,{padding:[30,30]});
}
$('#btn-map-fit').onclick=fitMapToEverything;
$('#btn-map-fullscreen').onclick=()=>{
  const el=$('.mapcard');
  el.classList.toggle('map-fullscreen');
  const on=el.classList.contains('map-fullscreen');
  $('#btn-map-fullscreen').textContent = on ? 'Salir de pantalla completa' : 'Pantalla completa';
  fitMapWrapToViewport();
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && $('.mapcard').classList.contains('map-fullscreen')) $('#btn-map-fullscreen').click();
});

// Analizador de vecinos: GET_CONTACTS trae cada nodo que el WIO conoce con su
// nº de saltos (out_path_len). A partir de HOP_WARN saltos el enlace es cada
// vez más frágil (más nodos por medio = más probabilidad de que uno falle).
const HOP_WARN=3;
// Borde por saltos (verde directo, violeta 1-2, ambar 3+, gris flood) y los
// repetidores algo mas grandes: de un vistazo se ve la columna de la malla.
const neighborIcon=(c)=>mapPin(
  c.advType===2?'📡':c.advType===3?'🏠':c.advType===1?'💬':'📟',
  c.advType===2?26:21,'#141b26',
  c.hops==null?'#5c6b7d':c.hops===0?'#3fd67a':c.hops<=2?'#a78bfa':'#f0b429'
);
// Lo leido por cada WIO se guarda aparte (sobrevive a recargas, como el
// chat) y el mapa siempre pinta la union de ambos, no solo el ultimo escaneo.
const NEIGHBORS_KEY_PREFIX='meshcore-neighbors-';
function saveNeighbors(idx,contacts){
  try{ localStorage.setItem(NEIGHBORS_KEY_PREFIX+idx, JSON.stringify({ts:Date.now(),contacts})); }
  catch(e){}
}
function loadNeighbors(idx){
  try{ return JSON.parse(localStorage.getItem(NEIGHBORS_KEY_PREFIX+idx)); }
  catch(e){ return null; }
}
const DIST_MAX_MAPA=1200;
const marcadorVecino=new Map(); // pubkey -> marcador, para ir a el desde la tabla
function plotNeighborsInto(idx,contacts,maxKm){
  for(const c of contacts){
    if(!c.lat && !c.lon) continue; // sin posicion anunciada: no hay donde ponerlo
    const d=distKm(REPEATER_POS,[c.lat,c.lon]);
    // La malla iberica no pasa de 1200 km: mas lejos es una posicion mal
    // anunciada (un nodo salia debajo de Africa) y solo estropea "Ver todo".
    if(d>DIST_MAX_MAPA) continue;
    if(maxKm!=null && d>maxKm) continue;
    const tipo = c.advType===2?'📡 Repetidor':c.advType===3?'🏠 Sala':c.advType===1?'💬 Chat':'📟 Nodo';
    const hopsTxt = c.hops==null ? 'flood (sin ruta fija)' : c.hops===0 ? '<b style="color:#3fd67a">directo</b>' : c.hops+' salto'+(c.hops===1?'':'s');
    const visto = c.lastAdvert ? humanAgo(c.lastAdvert*1000) : 'desconocido';
    // Interconexion: a 0 saltos es contacto de radio directo con tu repetidor,
    // asi que trazamos el enlace real, no solo el pin.
    if(c.hops===0){
      L.polyline([REPEATER_POS,[c.lat,c.lon]],{color:'#3fd67a',weight:1.5,opacity:.55,dashArray:'2,5'})
        .addTo(layerNeighbors).bindTooltip('Enlace directo · '+esc(c.name||'nodo'),{permanent:false});
    }
    const popup=
      '<b>'+esc(c.name||'(sin nombre)')+'</b><br>'+
      '<span style="color:#8b98a8">'+tipo+' · visto vía WIO'+idx+'</span>'+
      '<table style="margin-top:6px;font-size:12px;border-collapse:collapse">'+
      '<tr><td style="color:#8b98a8;padding-right:8px">Distancia</td><td><b>'+d.toFixed(2)+' km</b></td></tr>'+
      '<tr><td style="color:#8b98a8;padding-right:8px">Saltos</td><td>'+hopsTxt+'</td></tr>'+
      '<tr><td style="color:#8b98a8;padding-right:8px">Última vez visto</td><td>'+visto+'</td></tr>'+
      '</table>';
    const mk=L.marker([c.lat,c.lon],{icon:neighborIcon(c)}).addTo(layerNeighbors).bindPopup(popup);
    if(c.pubkey) marcadorVecino.set(c.pubkey,mk);
  }
}
// Selector (que WIO) + casilla (solo cercanos): filtran sin re-escanear,
// solo repintan lo ya guardado en localStorage.
function renderAllNeighbors(){
  layerNeighbors.clearLayers();
  marcadorVecino.clear();
  const via=$('#neighbors-via-select')?.value||'both';
  const near=$('.layer-toggle[data-layer=near]')?.classList.contains('on');
  const idxs = via==='both' ? [1,2] : [+via];
  for(const idx of idxs){
    const saved=loadNeighbors(idx);
    if(saved && saved.contacts) plotNeighborsInto(idx,saved.contacts,near?150:null);
  }
}
$('#neighbors-via-select').onchange=renderAllNeighbors;
renderAllNeighbors();
rellenarDestinosEnlace();
async function scanNeighbors(idx){
  const out=$('#neighborsResult');
  const mapStatus=$('#neighborsMapStatus');
  const n=wNodes[idx];
  if(!n||!n.device||!n.device.gatt.connected){
    out.textContent='WIO'+idx+' no conectado. Conéctalo en la pestaña Panel primero.';
    if(mapStatus) mapStatus.textContent='WIO'+idx+' no conectado';
    return;
  }
  out.textContent='Consultando contactos de WIO'+idx+'... puede tardar unos segundos si hay muchos.';
  if(mapStatus) mapStatus.textContent='Consultando WIO'+idx+'...';
  try{
    const contacts=await n.getContacts();
    if(!contacts.length){
      out.textContent='WIO'+idx+' todavía no tiene contactos guardados. Prueba tras dejarlo un rato escuchando.';
      if(mapStatus) mapStatus.textContent='WIO'+idx+': sin contactos aún';
      return;
    }
    saveNeighbors(idx,contacts);
    renderAllNeighbors();
    rellenarDestinosEnlace();
    const withPos=contacts.filter(c=>c.lat||c.lon).length;
    if(mapStatus) mapStatus.textContent='WIO'+idx+': '+contacts.length+' vecinos, '+withPos+' con posición · '+new Date().toLocaleTimeString();
    const sorted=contacts.slice().sort((a,b)=>(a.hops??-1)-(b.hops??-1));
    let farCount=0, repCount=0;
    const lines=[];
    for(const c of sorted){
      const hopsTxt = c.hops==null ? 'flood' : c.hops+' salto'+(c.hops===1?'':'s');
      const far = c.hops!=null && c.hops>HOP_WARN;
      if(far) farCount++;
      if(c.advType===2) repCount++; // AdvType.REPEATER
      const tipo = c.advType===2?'📡 repetidor':c.advType===3?'🏠 sala':c.advType===1?'💬 chat':'· nodo';
      lines.push((far?'· lejos · ':'· ')+(c.name||'(sin nombre)')+'  —  '+tipo+'  —  '+hopsTxt);
    }
    let header='WIO'+idx+' ve '+contacts.length+' nodo(s), '+repCount+' de ellos repetidores.';
    if(farCount>0) header+='\n'+farCount+' a más de '+HOP_WARN+' saltos: enlace probablemente poco fiable con ellos.';
    else header+='\nTodos a '+HOP_WARN+' saltos o menos: buena señal de que el enlace es sólido.';
    header+='\n📍 '+withPos+' de '+contacts.length+' anuncian posición: puestos en el mapa (pestaña Mapa).';
    out.textContent=header+'\n\n'+lines.join('\n');
  }catch(e){ out.textContent='Error consultando contactos: '+e.message; }
}
$('#btn-scan-w1').onclick=()=>scanNeighbors(1);
$('#btn-scan-w2').onclick=()=>scanNeighbors(2);
$('#btn-scan-w1-map').onclick=()=>scanNeighbors(1);
$('#btn-scan-w2-map').onclick=()=>scanNeighbors(2);

// ===== Lista de vecinos con saltos (el informe que antes quedaba oculto) =====
// Poligonos aproximados [lon,lat]: suficiente para contar nodos por region.
const REGIONES=[
  ['Galicia',[[-9.3,43.9],[-7.0,43.8],[-6.75,42.9],[-6.75,42.0],[-7.9,41.87],[-8.2,42.15],[-8.87,41.87],[-9.3,42.5]]],
  ['Asturias',[[-7.1,43.8],[-4.5,43.6],[-4.5,42.9],[-6.8,42.9]]],
  ['Portugal',[[-8.87,41.87],[-8.2,42.15],[-7.9,41.87],[-6.6,41.95],[-6.2,41.6],[-6.9,41.0],[-6.8,40.3],[-7.0,39.7],
               [-7.5,39.6],[-7.0,38.9],[-7.3,38.4],[-7.0,38.0],[-7.5,37.5],[-7.4,36.95],[-9.0,36.95],[-9.5,38.7],[-9.5,39.4],[-8.9,40.5]]],
];
function enPoligono(lon,lat,pol){
  let dentro=false;
  for(let i=0,j=pol.length-1;i<pol.length;j=i++){
    const [xi,yi]=pol[i],[xj,yj]=pol[j];
    if(((yi>lat)!==(yj>lat)) && lon<(xj-xi)*(lat-yi)/(yj-yi)+xi) dentro=!dentro;
  }
  return dentro;
}
function regionDe(lat,lon){
  for(const [nombre,pol] of REGIONES) if(enPoligono(lon,lat,pol)) return nombre;
  if(lat>35.9 && lat<43.9 && lon>-9.5 && lon<4.4) return 'Resto de España';
  return 'Fuera de la península';
}
function renderAlcance(){
  // Un nodo que ven los dos WIO cuenta una vez; sin posicion o con una
  // imposible (>1200 km) no se puede situar.
  const porNodo=new Map();
  for(const idx of [1,2]){
    const saved=loadNeighbors(idx);
    for(const c of ((saved&&saved.contacts)||[])){
      if(!c.lat && !c.lon) continue;
      if(esMio(c.name)) continue;
      const d=distKm(REPEATER_POS,[c.lat,c.lon]);
      if(d>1200) continue;
      const clave=c.pubkey||('n:'+c.name);
      const prev=porNodo.get(clave);
      if(!prev || (c.hops!=null && (prev.hops==null || c.hops<prev.hops)))
        porNodo.set(clave,{...c,d,region:regionDe(c.lat,c.lon)});
    }
  }
  const nodos=[...porNodo.values()];
  const grid=$('#alcanceGrid');
  if(!nodos.length){
    $('#alcanceResumen').textContent='';
    grid.innerHTML='<div class="cardsub">Sin vecinos con posición: usa «Vecinos por radio» primero.</div>';
    return;
  }
  const grupos={};
  for(const n of nodos) (grupos[n.region]=grupos[n.region]||[]).push(n);
  const orden=Object.entries(grupos).sort((a,b)=>b[1].length-a[1].length);
  $('#alcanceResumen').textContent=nodos.length+' nodos con posición en '+orden.length+' regiones';
  grid.innerHTML=orden.map(([reg,ns])=>{
    const lejos=ns.reduce((a,b)=>b.d>a.d?b:a);
    const reps=ns.filter(n=>n.advType===2).length;
    const directos=ns.filter(n=>n.hops===0).length;
    return '<div class="alcanceReg"><div class="k">'+esc(reg)+'</div><div class="n">'+ns.length+'</div>'+
      '<div class="d">'+reps+' repetidores · '+directos+' directos<br>Más lejano: '+esc(lejos.name||'?')+
      ' ('+lejos.d.toFixed(0)+' km)</div></div>';
  }).join('');
}
$('#btn-alcance').onclick=()=>{
  $('#alcancePanel').style.display='';
  renderAlcance();
  $('#alcancePanel').scrollIntoView({block:'nearest'});
};
$('#alcanceClose').onclick=()=>{ $('#alcancePanel').style.display='none'; };

function renderNeighborsList(){
  // Un nodo que ven los dos WIO es UN nodo, no dos: se agrupa por pubkey.
  const porNodo=new Map();
  for(const idx of [1,2]){
    const saved=loadNeighbors(idx);
    if(!saved||!saved.contacts) continue;
    for(const c of saved.contacts){
      const clave=c.pubkey||('n:'+(c.name||''));
      const dist=(c.lat||c.lon)? distKm(REPEATER_POS,[c.lat,c.lon]) : null;
      const prev=porNodo.get(clave);
      if(prev){
        prev.via.add(idx);
        // se queda con la mejor ruta conocida entre las dos
        if(c.hops!=null && (prev.hops==null || c.hops<prev.hops)) prev.hops=c.hops;
        if(prev.dist==null) prev.dist=dist;
        if((c.lastAdvert||0)>prev.visto) prev.visto=c.lastAdvert;
      }else{
        porNodo.set(clave,{via:new Set([idx]),name:c.name||'(sin nombre)',pubkey:c.pubkey||'',
                           advType:c.advType,hops:c.hops,dist,visto:c.lastAdvert||0});
      }
    }
  }
  let filas=[...porNodo.values()];
  const total=filas.length;

  const busca=($('#nlFilter').value||'').trim().toLowerCase();
  if(busca) filas=filas.filter(f=>f.name.toLowerCase().includes(busca));

  const modo=$('#nlSort').value;
  filas.sort((a,b)=>{
    if(modo==='name') return a.name.localeCompare(b.name);
    if(modo==='dist') return (a.dist??1e9)-(b.dist??1e9);
    // Una hora en el futuro es un reloj mal puesto, no "lo mas reciente".
    if(modo==='visto'){ const lim=Date.now()/1000+120, v=x=>(x.visto&&x.visto<lim)?x.visto:0; return v(b)-v(a); }
    return (a.hops??99)-(b.hops??99);
  });

  const TIPO={0:'· nodo',1:'💬 chat',2:'📡 repetidor',3:'🏠 sala',4:'🌡️ sensor'};
  // La malla ibérica no llega a 1200 km: mas que eso es una posicion mal anunciada.
  const DIST_INCREIBLE=1200;
  const reps=filas.filter(f=>f.advType===2).length;
  const directos=filas.filter(f=>f.hops===0).length;
  const ambos=filas.filter(f=>f.via.size===2).length;
  $('#nlSummary').textContent =
    (busca? filas.length+' de '+total+' nodos' : total+' nodos distintos')+
    ' · '+reps+' repetidores · '+directos+' directos · '+ambos+' vistos por los dos WIO';

  const th='<tr style="text-align:left;color:var(--dim2);font-size:10px;text-transform:uppercase">'+
    '<th style="padding:4px">Nodo</th><th>Tipo</th><th>Saltos</th><th>Distancia</th><th>Visto</th><th>Vía</th></tr>';
  const cuerpo = filas.map(f=>{
    const h = f.hops==null ? '<span style="color:var(--dim2)">flood</span>'
            : f.hops===0 ? '<b style="color:var(--acc)">directo</b>'
            : (f.hops>3? '<span style="color:var(--warn)">'+f.hops+'</span>' : f.hops);
    let d;
    if(f.dist==null) d='—';
    else if(f.dist>DIST_INCREIBLE) d='<span style="color:var(--warn)" title="Posición anunciada poco creíble para esta malla">'+f.dist.toFixed(0)+' km (poco creíble)</span>';
    else d=f.dist.toFixed(1)+' km';
    const via = f.via.size===2 ? '<span style="color:var(--info)">los dos</span>' : 'WIO'+[...f.via][0];
    const mio = esMio(f.name) ? ' <span class="nlMine">tuyo</span>' : '';
    const enMapa=f.pubkey && marcadorVecino.has(f.pubkey);
    return '<tr class="nlRow'+(enMapa?' enMapa':'')+'" data-pk="'+esc(f.pubkey)+'" title="'+(enMapa?'Ver en el mapa':'Sin posición anunciada')+'">'+
      '<td style="padding:5px 4px">'+esc(f.name)+mio+(enMapa?' <span class="nlPin">📍</span>':'')+'</td>'+
      '<td>'+(TIPO[f.advType]||f.advType)+'</td>'+
      '<td>'+h+'</td>'+
      '<td>'+d+'</td>'+
      '<td style="color:var(--dim)">'+(f.visto?humanAgo(f.visto*1000):'—')+'</td>'+
      '<td>'+via+'</td></tr>';
  }).join('');
  $('#nlTable').innerHTML = th + (cuerpo ||
    '<tr><td colspan="6" style="padding:14px;color:var(--dim2)">Ningún nodo coincide con la búsqueda.</td></tr>');
}

$('#btn-neighbors-list').onclick=()=>{
  const p=$('#neighborsListPanel');
  const hay=[1,2].some(i=>{ const s=loadNeighbors(i); return s&&s.contacts&&s.contacts.length; });
  if(!hay){ $('#neighborsMapStatus').textContent='Sin datos: pulsa "Actualizar vía WIO1/2" primero'; return; }
  p.style.display='';
  renderNeighborsList();
  p.scrollIntoView({block:'nearest'});
};
$('#nlSort').onchange=renderNeighborsList;
// Clic en una fila: lleva el mapa a ese nodo y abre su ficha.
$('#nlTable').addEventListener('click',e=>{
  const tr=e.target.closest('tr[data-pk]'); if(!tr) return;
  const m=marcadorVecino.get(tr.dataset.pk); if(!m) return;
  if(!map.hasLayer(layerNeighbors)) map.addLayer(layerNeighbors);
  $('#map').scrollIntoView({block:'nearest',behavior:'smooth'});
  map.setView(m.getLatLng(),Math.max(map.getZoom(),12));
  setTimeout(()=>m.openPopup(),250);
});
$('#nlFilter').oninput=renderNeighborsList;
$('#nlClose').onclick=()=>{ $('#neighborsListPanel').style.display='none'; };

// ===== Analisis de enlace: perfil de terreno, linea de vista y Fresnel =====
// Es lo que de verdad decide si un enlace a un monte funciona: no basta con
// "verse" en el mapa, la 1a zona de Fresnel tiene que ir despejada al 60%.
function pintarObjetivo(){
  const box=$('#cfg-objetivo-box');
  if(!INFRA.length){ if(box) box.hidden=true; return; }
  const o=INFRA[0], p=[o.lat,o.lon];
  $('#cfg-objetivo').textContent=o.name+' a '+distKm(REPEATER_POS,p).toFixed(2).replace('.',',')+' km '+rumbo(bearingDeg(REPEATER_POS,p));
}
function rellenarDestinosEnlace(){
  const sel=$('#link-target');
  if(!sel) return;
  const actual=sel.value;
  pintarObjetivo();
  const opts=INFRA.length?['<option value="__infra0">→ '+esc(INFRA[0].name)+' (objetivo)</option>']:[];
  const vistos={};
  for(const idx of [1,2]){
    const saved=loadNeighbors(idx);
    if(!saved||!saved.contacts) continue;
    for(const c of saved.contacts){
      if(c.advType!==2 || (!c.lat&&!c.lon) || vistos[c.pubkey]) continue;
      vistos[c.pubkey]=1;
      const d=distKm(REPEATER_POS,[c.lat,c.lon]);
      if(d<0.2 || d>120) continue; // ni el propio nodo ni cosas absurdamente lejos
      opts.push('<option value="'+esc(c.pubkey)+'">→ '+esc(c.name||'repetidor')+' ('+d.toFixed(1)+' km'+
        (c.hops===0?' · directo':c.hops!=null?' · '+c.hops+' saltos':'')+')</option>');
    }
  }
  sel.innerHTML=opts.join('');
  if(actual) sel.value=actual;
}
function puntoDestinoEnlace(){
  const v=$('#link-target').value;
  if(v==='__infra0' && INFRA.length) return {name:INFRA[0].name, lat:INFRA[0].lat, lon:INFRA[0].lon};
  for(const idx of [1,2]){
    const saved=loadNeighbors(idx);
    if(!saved||!saved.contacts) continue;
    const c=saved.contacts.find(x=>x.pubkey===v);
    if(c) return {name:c.name||'repetidor', lat:c.lat, lon:c.lon, hops:c.hops};
  }
  return null;
}
$('#btn-trace').onclick=async()=>{
  const btn=$('#btn-trace'), out=$('#traceOut');
  if(typeof rakSendTrace!=='function'){ alert('Puente no cargado'); return; }
  const via = (wNodes[2]&&wNodes[2].device&&wNodes[2].device.gatt.connected) ? 2
            : (wNodes[1]&&wNodes[1].device&&wNodes[1].device.gatt.connected) ? 1 : null;
  if(!via){ alert('Ningún WIO conectado'); return; }
  const destVal=$('#link-target').value;
  if(!destVal || destVal==='__infra0'){
    alert('Elige un repetidor de tus contactos en "Análisis de enlace" (la infraestructura de referencia no tiene pubkey conocida). El traceroute necesita indicarle la ruta: no la descubre solo.');
    return;
  }
  const pathHex=destVal.slice(0,2); // 1 byte de prefijo (flags=0), el firmware manda por sendDirect con esta ruta
  const dest=puntoDestinoEnlace()||{name:'el destino'};
  btn.disabled=true; out.style.display='';
  // La ruta es solo el propio destino: si no es vecino directo nadie lo reenvia.
  out.textContent='Enviando traceroute vía WIO'+via+' con ruta a '+dest.name+'...'+
    (dest.hops!=null && dest.hops>0 ? '\n⚠️ Está a '+dest.hops+' saltos: el traceroute solo llega a vecinos directos, lo normal es que no vuelva.' : '');
  try{
    const r=await rakSendTrace(via,pathHex);
    if(!r.hops.length){
      out.textContent='Respuesta recibida sin saltos registrados (SNR final '+r.finalSnr+' dB).';
    }else{
      const lineas=r.hops.map((h,i)=>'  '+(i+1)+'. hash '+h.hash+' · SNR '+h.snr+' dB');
      out.textContent='✅ Ruta confirmada ('+r.hops.length+' salto'+(r.hops.length===1?'':'s')+'):\n'+lineas.join('\n')+
        (r.finalSnr!=null?'\n  SNR final: '+r.finalSnr+' dB':'');
    }
  }catch(e){
    out.textContent='❌ Sin respuesta: '+e.message+'. Si "Analizar enlace" da Obstruido para este destino, es coherente: el paquete no llega, no es fallo del traceroute.';
  }
  finally{ btn.disabled=false; }
};

$('#btn-link-analyze').onclick=async()=>{
  const btn=$('#btn-link-analyze'), panel=$('#linkPanel'), verdict=$('#linkVerdict');
  if(typeof rakElevations!=='function'){ alert('Puente no cargado'); return; }
  const dst=puntoDestinoEnlace();
  if(!dst){ alert('Destino no encontrado'); return; }
  const h1=parseFloat($('#link-h1').value)||0, h2=parseFloat($('#link-h2').value)||0;
  btn.disabled=true; panel.style.display=''; verdict.textContent='Midiendo terreno...';
  try{
    const N=80, A=REPEATER_POS, B=[dst.lat,dst.lon];
    const pts=[];
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      pts.push([A[0]+(B[0]-A[0])*t, A[1]+(B[1]-A[1])*t]);
    }
    const elev=await rakElevations(pts);
    if(elev.length!==N) throw new Error('altitudes incompletas');
    const D=distKm(A,B);                     // km
    const FGHZ=0.869618;                     // tu frecuencia real
    const alturaA=elev[0]+h1, alturaB=elev[N-1]+h2;
    // Curvatura terrestre con refraccion estandar k=4/3: el terreno "sube"
    // hacia el centro del vano aunque el mapa lo pinte plano.
    const bulge=(d1,d2)=>(d1*d2)/(12.75*1.33);
    const fresnel60=(d1,d2)=>0.6*17.31*Math.sqrt((d1*d2)/(FGHZ*D));
    let peorMargen=Infinity, peorKm=0, peorObst=0;
    const terreno=[], los=[], fres=[];
    for(let i=0;i<N;i++){
      const d1=D*i/(N-1), d2=D-d1;
      const ter=elev[i]+bulge(d1,d2);
      const lineaVista=alturaA+(alturaB-alturaA)*(i/(N-1));
      const r=fresnel60(d1,d2);
      terreno.push(ter); los.push(lineaVista); fres.push(lineaVista-r);
      const margen=(lineaVista-r)-ter;       // cuanto sobra bajo la zona de Fresnel
      if(i>0 && i<N-1 && margen<peorMargen){ peorMargen=margen; peorKm=d1; peorObst=ter; }
    }
    dibujarPerfil(terreno,los,fres,D,dst.name);
    // Meterlo en el mapa: linea verde si despejado, roja si obstruido, en vez
    // de solo el grafico debajo. Se sustituye si repites el mismo destino.
    const ok=peorMargen>=0;
    const color=ok?'#3fd67a':'#ff6b6b';
    layerFresnel.eachLayer(l=>{ if(l._fresnelDst===dst.name) layerFresnel.removeLayer(l); });
    const line=L.polyline([A,B],{color,weight:3,opacity:.85,dashArray:ok?null:'8,6'})
      .addTo(layerFresnel)
      .bindTooltip((ok?'✅ Despejado':'❌ Obstruido')+' · '+esc(dst.name)+' · '+D.toFixed(1)+' km',{sticky:true});
    line._fresnelDst=dst.name;
    if(peorMargen>=0){
      verdict.innerHTML='<b style="color:var(--acc)">Despejado</b> · '+D.toFixed(2)+' km · margen mínimo '+
        peorMargen.toFixed(0)+' m sobre la zona de Fresnel';
    }else{
      const subir=Math.ceil(-peorMargen);
      verdict.innerHTML='<b style="color:var(--err)">Obstruido</b> · '+D.toFixed(2)+' km · el terreno invade '+
        subir+' m la zona de Fresnel a '+peorKm.toFixed(1)+' km (cota '+peorObst.toFixed(0)+' m). '+
        'Harían falta ~'+subir+' m más de altura repartidos entre las dos antenas.';
    }
  }catch(e){ verdict.textContent='Error: '+e.message; }
  finally{ btn.disabled=false; }
};
function dibujarPerfil(terreno,los,fres,D,nombre){
  const W=900,H=220,P=10;
  const todos=[...terreno,...los,...fres];
  const min=Math.min(...todos), max=Math.max(...todos);
  const span=(max-min)||1;
  const x=i=>P+(W-2*P)*(i/(terreno.length-1));
  const y=v=>H-P-(H-2*P)*((v-min)/span);
  const pl=(arr)=>arr.map((v,i)=>x(i).toFixed(1)+','+y(v).toFixed(1)).join(' ');
  const suelo=pl(terreno)+' '+x(terreno.length-1).toFixed(1)+','+(H-P)+' '+P+','+(H-P);
  $('#linkChart').innerHTML=
    '<polygon fill="#3a2a18" stroke="#8a5a2a" stroke-width="1.5" points="'+suelo+'"/>'+
    '<polyline fill="none" stroke="#5eb3f5" stroke-width="1.5" stroke-dasharray="4,4" points="'+pl(fres)+'"/>'+
    '<polyline fill="none" stroke="#3fd67a" stroke-width="2" points="'+pl(los)+'"/>'+
    '<text x="'+(P+4)+'" y="16" fill="#8b98a8" font-size="11">'+esc(REP_NOMBRE)+'</text>'+
    '<text x="'+(W-P-4)+'" y="16" fill="#8b98a8" font-size="11" text-anchor="end">'+
      nombre.replace(/[<>&]/g,'')+' · '+D.toFixed(1)+' km</text>';
}

// Grafo de malla: pregunta a cada repetidor conocido a quien oye DIRECTAMENTE
// (peticion binaria NEIGHBOURS) y dibuja esas aristas. Es topologia real, no
// la lista de contactos de tu propio WIO.
const layerMeshGraph=L.layerGroup().addTo(map);
$('#btn-mesh-graph').onclick=async()=>{
  const btn=$('#btn-mesh-graph'), status=$('#neighborsMapStatus');
  if(typeof rakRequestNeighbours!=='function'){ status.textContent='Puente no cargado'; return; }
  // Antes, con "WIO1 + WIO2" siempre iba por WIO2 aunque estuviera apagado.
  const conectado=i=>!!(wNodes[i]&&wNodes[i].device&&wNodes[i].device.gatt.connected);
  const pedido=$('#neighbors-via-select').value;
  const via = pedido!=='both' ? (conectado(+pedido)?+pedido:null) : (conectado(2)?2:conectado(1)?1:null);
  if(!via){ status.textContent='Ningún WIO conectado'+(pedido!=='both'?' (el elegido está desconectado)':''); return; }
  btn.disabled=true;
  try{
    // Repetidores con posicion conocida, de lo ya escaneado.
    const porPubkey={};
    for(const idx of [1,2]){
      const saved=loadNeighbors(idx);
      if(!saved||!saved.contacts) continue;
      for(const c of saved.contacts){
        if(c.advType===2 && (c.lat||c.lon)) porPubkey[c.pubkey]=c;
      }
    }
    const reps=Object.values(porPubkey);
    if(!reps.length){ status.textContent='Sin repetidores con posición: pulsa Actualizar primero'; return; }
    layerMeshGraph.clearLayers();
    let enlaces=0, consultados=0;
    // Indice por prefijo de 4 bytes, que es lo que devuelve NEIGHBOURS.
    const porPrefijo={};
    for(const c of Object.values(porPubkey)) porPrefijo[c.pubkey.slice(0,8)]=c;
    // Techo de 8 (cada consulta tarda segundos): los mas faciles de alcanzar,
    // por saltos y luego distancia. Antes eran 8 cualesquiera, a veces de Portugal.
    reps.sort((a,b)=>((a.hops??99)-(b.hops??99)) ||
      (distKm(REPEATER_POS,[a.lat,a.lon])-distKm(REPEATER_POS,[b.lat,b.lon])));
    const trazados=new Set();
    for(const rep of reps.slice(0,8)){
      status.textContent='Preguntando a '+(rep.name||'repetidor')+' ('+(consultados+1)+'/'+Math.min(reps.length,8)+')...';
      try{
        const r=await rakRequestNeighbours(via, rep.pubkey);
        consultados++;
        for(const n of r.neighbours){
          const otro=porPrefijo[n.pubkey];
          if(!otro || otro.pubkey===rep.pubkey) continue; // sin posicion conocida: no hay donde trazarlo
          const par=[rep.pubkey,otro.pubkey].sort().join('|');
          if(trazados.has(par)) continue; // A oye a B y B oye a A: una sola linea
          trazados.add(par);
          L.polyline([[rep.lat,rep.lon],[otro.lat,otro.lon]],
            {color:'#5eb3f5',weight:2,opacity:.7})
            .addTo(layerMeshGraph)
            .bindTooltip(esc(rep.name||'?')+' ↔ '+esc(otro.name||'?')+' · SNR '+esc(n.snr)+' dB');
          enlaces++;
        }
      }catch(e){ /* ese repetidor no contesto: seguimos con el resto */ }
    }
    status.textContent='Grafo: '+enlaces+' enlaces directos de '+consultados+' repetidores consultados'+
      (enlaces===0?' (ninguno reporta vecinos; muchos firmwares no llevan esa tabla)':'');
  }catch(e){ status.textContent='Error: '+e.message; }
  finally{ btn.disabled=false; }
};
// Compartir contactos con la comunidad (mismo espiritu que HopRadar/analyzer):
// CSV de todo lo guardado de ambos WIO, tal cual esta en localStorage.
$('#btn-export-contacts').onclick=()=>{
  const rows=[['wio','nombre','tipo','saltos','lat','lon','pubkey']];
  const TIPOS={0:'nodo',1:'chat',2:'repetidor',3:'sala',4:'sensor'};
  for(const idx of [1,2]){
    const saved=loadNeighbors(idx);
    if(!saved || !saved.contacts) continue;
    for(const c of saved.contacts){
      rows.push([idx,c.name||'',TIPOS[c.advType]||c.advType,c.hops??'',c.lat||'',c.lon||'',c.pubkey||'']);
    }
  }
  if(rows.length===1){ alert('No hay contactos guardados todavía. Pulsa "Actualizar vía WIO1/2" primero.'); return; }
  // Los nombres los pone cualquiera en la malla: entre comillas (comas y
  // saltos de linea no parten la fila) y sin =,+,-,@ al principio, que Excel
  // ejecutaria como formula. El BOM hace que Excel lea bien las tildes.
  const celda=v=>{
    let t=String(v??'');
    if(/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t="'"+t;
    return /[",\n\r;]/.test(t) ? '"'+t.replace(/"/g,'""')+'"' : t;
  };
  const csv='\ufeff'+rows.map(r=>r.map(celda).join(',')).join('\r\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='meshcore-contactos-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click();
};

// Medir distancia entre dos puntos cualquiera (tu repetidor, un vecino, un
// monte...): dos clics, linea y km. No requiere que el destino tenga contacto.
let measuring=false, measurePts=[], measureLine=null, measureMarkers=[];
function measureReset(){
  measurePts=[];
  if(measureLine){ map.removeLayer(measureLine); measureLine=null; }
  measureMarkers.forEach(m=>map.removeLayer(m)); measureMarkers=[];
}
$('#btn-measure').onclick=()=>{
  measuring=!measuring;
  measureReset();
  const btn=$('#btn-measure');
  btn.style.background = measuring ? '#182130' : '';
  btn.style.borderColor = measuring ? '#3a4a60' : '';
  avisoMapa(measuring ? 'Modo medir: haz clic en dos puntos del mapa.' : '', measuring ? 'var(--warn)' : '');
  map.getContainer().style.cursor = measuring ? 'crosshair' : '';
};
map.on('click',(e)=>{
  if(placingIdx){
    const {lat,lng}=e.latlng;
    placeMarker(placingIdx,lat,lng);
    try{ localStorage.setItem('meshcore-w'+placingIdx+'-pos',JSON.stringify({lat,lon:lng})); }catch(e){}
    avisoMapa('WIO'+placingIdx+' colocado. Puedes arrastrar el pin para ajustar, o «Colocar en mapa» (en Gestión) para cambiarlo.','var(--dim)');
    map.getContainer().style.cursor='';
    placingIdx=null;
    return;
  }
  if(measuring){
    const p=[e.latlng.lat,e.latlng.lng];
    measurePts.push(p);
    measureMarkers.push(L.circleMarker(p,{radius:5,color:'#f0b429',fillColor:'#f0b429',fillOpacity:1}).addTo(map));
    if(measurePts.length===2){
      const d=distKm(measurePts[0],measurePts[1]);
      const b=bearingDeg(measurePts[0],measurePts[1]);
      if(measureLine) map.removeLayer(measureLine);
      measureLine=L.polyline(measurePts,{color:'#f0b429',weight:2,dashArray:'6,4'}).addTo(map)
        .bindTooltip(d.toFixed(2)+' km · rumbo '+b.toFixed(0)+'° ('+rumbo(b)+')',{permanent:true,direction:'center'}).openTooltip();
      $('#mapHint').textContent='Distancia: '+d.toFixed(2)+' km · rumbo '+b.toFixed(0)+'° ('+rumbo(b)+'). Clic para medir otra vez.';
      measurePts=[]; measureMarkers.forEach(m=>map.removeLayer(m)); measureMarkers=[];
    }
    return;
  }
});

// Registro de la tarjeta del repetidor (diagnóstico y gestión remota).
function rlog(t){ const e=$('#rak-log'); e.textContent=(e.textContent+'\n'+t).split('\n').slice(-8).join('\n'); gLog(t); }

// ============ WIO: utilidades de la tarjeta ============
// Todo el Bluetooth lo lleva el relay del PC a traves del gateway de la Pi
// (meshcore-ble-gateway.js); el navegador no usa Web Bluetooth ni Web Serial.
function wlog(idx,text){
  const el=$('#w'+idx+'-log');
  if(!el) return; // nodos sin tarjeta propia (ej. RAK por BLE) no tienen loglet w-*
  el.textContent=(el.textContent+'\n'+text).split('\n').filter(Boolean).slice(-12).join('\n');
  el.scrollTop=el.scrollHeight;
}

function setBattBar(idx,pct){
  const fill=$('#w'+idx+'-battfill');
  fill.style.width=Math.max(0,Math.min(100,pct))+'%';
  fill.style.background = pct<20 ? 'var(--err)' : pct<45 ? 'var(--warn)' : 'var(--acc)';
}
function setWConnectedUI(idx,connected){
  const dot=$('#dot-w'+idx);
  if(!dot) return; // nodos sin tarjeta propia (ej. RAK por BLE) no tienen dot-w*
  dot.classList.toggle('on',connected);
  $('#devtabdot-w'+idx)?.classList.toggle('on',connected);
  $('#devpanel-w'+idx)?.classList.toggle('online',connected);
  if(connected) $('#devpanel-w'+idx)?.classList.remove('stale');
  else if(loadNodeState(idx)) $('#devpanel-w'+idx)?.classList.add('stale');
  const btn=$('#btn-w'+idx+'-connect');
  btn.textContent = connected ? 'Desconectar' : 'Conectar';
  btn.classList.toggle('p',!connected);
}
function setWDeviceStatus(idx,text,ok){
  const el=$('#w'+idx+'-device-status');
  if(el){ el.textContent=text; el.classList.toggle('mal', ok===false); }
}






// Conectar/desconectar lo hace connectWisblock de meshcore-ble-gateway.js (puente).
$('#btn-w1-connect').onclick=()=>connectWisblock(1);
$('#btn-w2-connect').onclick=()=>connectWisblock(2);

// ============ Gestión remota del RAK por LoRa (LOGIN + CLI, sin BLE) ============
// Mismo mecanismo que usa la app oficial: manda la contraseña de admin a
// través de un WIO ya conectado, la malla la lleva hasta el repetidor.
let rakRemotePubkey=null, rakRemoteVia=null;
function setRakRemoteReady(ready){
  $('#rak-remote-cmd').disabled=!ready; $('#btn-rak-remote-send').disabled=!ready;
  $$('.quick-rak-cmd').forEach(b=>b.disabled=!ready);
  $('#btn-rak-legal').disabled=!ready;
  gestionRepetidorEstado();
}
// Las respuestas CLI del repetidor llegan como mensajes privados suyos: quien
// espera una se engancha aqui (una a la vez) en vez de leer el chat a mano.
let esperaCli=null;
function respuestaRepetidor(m){
  if(!esperaCli || !rakRemotePubkey) return;
  const a=String(m.from||'').toLowerCase(), b=rakRemotePubkey.toLowerCase();
  const n=Math.min(a.length,b.length,12);
  if(!n || a.slice(0,n)!==b.slice(0,n)) return;
  // Una respuesta que llega tarde a la pregunta anterior (por LoRa pasa) no
  // debe tomarse por la de esta: get radio leido como get tx daba 869 dBm.
  if(esperaCli.acepta && !esperaCli.acepta(m.text)) return;
  const r=esperaCli; esperaCli=null; clearTimeout(r.timer); r.resolve(m.text);
}
function preguntarRepetidor(cmd,ms=25000,acepta=null){
  return new Promise(async (resolve,reject)=>{
    const espera={resolve,acepta,timer:setTimeout(()=>{ if(esperaCli===espera) esperaCli=null;
      reject(new Error('sin respuesta en '+ms/1000+' s')); },ms)};
    esperaCli=espera;
    try{ await rakRemoteCmd(rakRemoteVia,rakRemotePubkey,cmd,false); }
    catch(e){ clearTimeout(espera.timer); if(esperaCli===espera) esperaCli=null; reject(e); }
  });
}
// La coma separa valores (get radio: 869.618,62.5,7,6); el decimal es siempre punto.
const numerosDe=t=>(String(t).match(/-?\d+(?:\.\d+)?/g)||[]).map(Number);
// Antena del repetidor (Datos de la estacion: MikroTik 868 omni). Si es otra,
// cambia la ganancia: con ella se pasa de potencia de salida a PRA.
const ANTENA_DBI=6.5, PERDIDA_CABLE_DB=0;
function veredictoLegal(radio,tx,af,dutyMedido){
  const lineas=[], faltan=[]; let ok=true;
  const [f,bw,sf,cr]=radio;
  if(f==null || bw==null) faltan.push('frecuencia y ancho (get radio)');
  if(tx==null) faltan.push('potencia (get tx)');
  if(f!=null && bw!=null){
    const lo=f-bw/2000, hi=f+bw/2000, dentro=lo>=869.4-1e-9 && hi<=869.65+1e-9;
    ok=ok&&dentro;
    lineas.push((dentro?'✅':'❌')+' Frecuencia '+f+' MHz, ancho '+bw+' kHz: ocupa '+lo.toFixed(4)+'–'+hi.toFixed(4)+' MHz '+
      (dentro?'(dentro de 869,40–869,65)':'(¡se sale de la sub-banda 869,40–869,65!)'));
    const red=Math.abs(f-869.618)<0.001 && bw==62.5 && sf==7 && cr==6;
    lineas.push((red?'Bien:':'Ojo:')+' SF'+sf+' CR'+cr+(red?': preset Portugal 868, el de la red gallega'
      :': distinto del preset Portugal 868 (869,618 · 62,5 · SF7 · CR6), no hablaría con la red gallega'));
  }
  if(tx!=null){
    const pra=tx+ANTENA_DBI-PERDIDA_CABLE_DB-2.15, mw=Math.pow(10,pra/10), bien=pra<=27+1e-9;
    ok=ok&&bien;
    lineas.push((bien?'✅':'❌')+' Potencia '+tx+' dBm: con antena de '+ANTENA_DBI+' dBi ≈ '+pra.toFixed(1)+' dBm PRA ('+mw.toFixed(0)+' mW, límite 500 mW)');
  }
  if(af!=null){
    const max=100/(1+af);
    // El limite legal es el ciclo real; af solo pone el techo que permite el firmware.
    lineas.push((max<=10+1e-9?'Bien:':'Ojo:')+' Airtime factor '+af+': el firmware permitiría hasta '+max.toFixed(1)+' % de emisión'+
      (max<=10+1e-9?'':' (con mucho tráfico podría pasar del 10 %; recomendado «set af 9»)'));
  }
  if(dutyMedido!=null){
    const bien=dutyMedido<=10; ok=ok&&bien;
    lineas.push((bien?'✅':'❌')+' Ciclo de trabajo medido: '+dutyMedido.toFixed(2)+' % (límite 10 %)');
  }
  return {ok:ok&&!faltan.length,lineas,faltan};
}
$('#btn-rak-legal').onclick=async()=>{
  const btn=$('#btn-rak-legal'), out=$('#rak-legal-out');
  if(!rakRemotePubkey){ rlog('Inicia sesión remota primero.'); return; }
  btn.disabled=true; out.style.display='';
  out.textContent='Preguntando al repetidor por radio (hasta 75 s)...';
  const r={};
  const uno=(lo,hi)=>t=>{ const n=numerosDe(t); return n.length===1 && n[0]>=lo && n[0]<=hi; };
  const preguntas=[
    ['radio','get radio',t=>{ const n=numerosDe(t); return n.length>=4 && n[0]>100 && n[0]<1100; }],
    ['tx','get tx',uno(-10,40)],
    ['af','get af',uno(0,100)],
  ];
  try{
    for(const [clave,cmd,acepta] of preguntas){
      try{ r[clave]=await preguntarRepetidor(cmd,25000,acepta); out.textContent+='\n· '+cmd+' → '+r[clave]; }
      catch(e){ out.textContent+='\n· '+cmd+' → '+e.message; }
    }
  }finally{ btn.disabled=!rakRemotePubkey; }
  let dutyMedido=null, dutyEdad='';
  try{
    const s=((await rakHistory(1)).samples||[]).slice(-1)[0];
    if(s && s.duty_cycle!=null){
      dutyMedido=s.duty_cycle;
      const h=(Date.now()/1000-s.at)/3600;
      dutyEdad=h<1?' (muestra de hace '+Math.round(h*60)+' min)':' (muestra de hace '+h.toFixed(h<10?1:0)+' h)';
    }
  }catch(e){}
  const radio=numerosDe(r.radio||'');
  const v=veredictoLegal(radio.slice(0,4), numerosDe(r.tx||'')[0], numerosDe(r.af||'')[0], dutyMedido);
  const titulo=v.faltan.length?'❓ SIN VEREDICTO: falta '+v.faltan.join(' y ')+'. Vuelve a probar.'
    :(v.ok?'✅ LEGAL':'❌ REVISAR');
  out.textContent+='\n\n'+titulo+' · ERC/REC 70-03, sub-banda 869,40–869,65 MHz (500 mW PRA, 10 %)\n'+v.lineas.join('\n')+
    (dutyEdad?'\n  (ciclo de trabajo: media desde el último arranque'+dutyEdad+')':'');
};

async function sendRemoteCmd(cmd,confirmed=false){
  if(!cmd) return;
  if(!rakRemotePubkey){ rlog('Inicia sesión remota primero.'); return; }
  try{
    await rakRemoteCmd(rakRemoteVia,rakRemotePubkey,cmd,confirmed);
    rlog('Comando enviado: '+cmd+' · la respuesta llegará como mensaje del repetidor (mira el Chat si tarda).');
  }catch(e){
    // El gateway decide qué es arriesgado; aquí solo se pregunta al usuario.
    if(!confirmed && /^CONFIRMAR:/.test(e.message)){
      if(await preguntar('¿Enviar «'+cmd+'» al repetidor?',e.message.replace(/^CONFIRMAR:\s*/,''),'Enviar'))
        return sendRemoteCmd(cmd,true);
      rlog('Cancelado: '+cmd);
      return;
    }
    rlog('No enviado: '+e.message);
  }
}
$$('.quick-rak-cmd').forEach(b=>b.onclick=()=>sendRemoteCmd(b.dataset.cmd));
// Telemetria remota (CayenneLPP): voltaje y temperatura reales del repetidor.
$('#btn-rak-telemetry').onclick=async()=>{
  const btn=$('#btn-rak-telemetry'), out=$('#rak-telemetry-out');
  const via=+$('#rak-status-via').value;
  if(typeof rakRequestTelemetry!=='function'){ rlog('Telemetría no disponible (falta el puente).'); return; }
  btn.disabled=true; out.style.display=''; out.textContent='Pidiendo telemetría por LoRa...';
  try{
    const target=await rakFindPubkey(via,REP_NOMBRE);
    const lpp=await rakRequestTelemetry(via,target.pubkey);
    if(!lpp.length){ out.textContent='El nodo no devolvió telemetría (puede no tener sensores configurados).'; return; }
    const NOMBRES=window.LPP_NOMBRES||{};
    out.textContent=lpp.map(x=>'· canal '+x.channel+' — '+(NOMBRES[x.type]||('tipo '+x.type))+': '+
      (x.value==null?'(no interpretado)':x.value+' '+x.unit)).join('\n');
  }catch(e){ out.textContent='Error: '+e.message; }
  finally{ btn.disabled=false; }
};

// Historico recogido por la Pi cada 15 min: el movil no puede hacer esto.
$('#btn-rak-history').onclick=async()=>{
  const btn=$('#btn-rak-history'), box=$('#rak-history-box'), info=$('#rak-history-info');
  if(typeof rakHistory!=='function'){ rlog('Histórico no disponible (falta el puente).'); return; }
  btn.disabled=true; box.style.display=''; info.textContent='Cargando histórico...';
  try{
    const h=await rakHistory(500);
    const s=(h.samples||[]).filter(x=>x.duty_cycle!=null && x.uptime>=3600);
    if(!s.length){
      info.textContent='Aún no hay muestras. La Pi toma una cada '+Math.round((h.every_seconds||900)/60)+
        ' min desde que consultas el estado una vez (así aprende a quién vigilar).';
      $('#rak-history-chart').innerHTML='';
      return;
    }
    const desde=new Date(s[0].at*1000).toLocaleString();
    info.textContent=s.length+' muestras desde '+desde+' · cada '+Math.round((h.every_seconds||900)/60)+
      ' min · línea verde = batería (V), ámbar = duty cycle (%)';
    drawHistoryChart(s);
  }catch(e){ info.textContent='Error: '+e.message; }
  finally{ btn.disabled=false; }
};
// Grafica sin librerias: dos series normalizadas sobre el mismo lienzo.
function drawHistoryChart(samples){
  const W=600,H=140,P=6;
  const serie=(get)=>{
    const vals=samples.map(get);
    const min=Math.min(...vals), max=Math.max(...vals);
    const span=(max-min)||1;
    return vals.map((v,i)=>{
      const x=P+(W-2*P)*(samples.length>1? i/(samples.length-1):0.5);
      const y=H-P-(H-2*P)*((v-min)/span);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
  };
  const bat=serie(x=>x.bat_mv), duty=serie(x=>x.duty_cycle);
  $('#rak-history-chart').innerHTML=
    '<polyline fill="none" stroke="#3fd67a" stroke-width="2" points="'+bat+'"/>'+
    '<polyline fill="none" stroke="#f0b429" stroke-width="2" points="'+duty+'"/>';
}

// Diagnostico remoto: contadores del repetidor por LoRa, sin login ni BLE.
$('#btn-rak-status').onclick=async()=>{
  const btn=$('#btn-rak-status');
  const via=+$('#rak-status-via').value;
  if(typeof rakRequestStatus!=='function'){ rlog('Diagnóstico remoto no disponible (falta el puente).'); return; }
  btn.disabled=true;
  try{
    rlog('Buscando el repetidor en los contactos de WIO'+via+'...');
    const target=await rakFindPubkey(via,REP_NOMBRE);
    rlog('Pidiendo estado a '+(target.name||'el repetidor')+' por LoRa...');
    const s=await rakRequestStatus(via,target.pubkey);
    const horas=(s.uptime/3600);
    $('#rs-bat').textContent=(s.bat_mv/1000).toFixed(2)+' V';
    $('#rs-uptime').textContent= horas>48 ? (horas/24).toFixed(1)+' días' : horas.toFixed(1)+' h';
    const duty=s.uptime>=3600 ? s.duty_cycle : null; // recien reiniciado: duty sin sentido
    $('#rs-duty').textContent= duty==null ? '—' : duty.toFixed(2)+' %';
    $('#rs-duty').className='v '+(duty==null?'':(duty>10?'bad':duty>5?'mid':'ok'));
    $('#rs-queue').textContent=s.tx_queue;
    $('#rs-recv').textContent=s.nb_recv.toLocaleString();
    $('#rs-sent').textContent=s.nb_sent.toLocaleString();
    $('#rs-noise').textContent=s.noise_floor+' dBm';
    $('#rs-rssi').textContent=s.last_rssi+' dBm / '+s.last_snr+' dB';
    $('#rs-flood').textContent=s.sent_flood.toLocaleString()+' / '+s.recv_flood.toLocaleString();
    $('#rs-dups').textContent=s.dups_flood+' flood · '+s.dups_direct+' dir';
    $('#rak-status-metrics').style.display='';
    rlog('Estado recibido · '+new Date().toLocaleTimeString());
  }catch(e){ rlog('Error pidiendo estado: '+e.message); }
  finally{ btn.disabled=false; }
};

$('#btn-rak-remote-login').onclick=async()=>{
  if(typeof rakFindPubkey!=='function'){ rlog('Gestión remota no disponible (falta el puente).'); return; }
  const via=+$('#rak-remote-via').value;
  const pass=$('#rak-remote-pass').value;
  if(!pass){ rlog('Escribe la contraseña de admin del repetidor.'); return; }
  const btn=$('#btn-rak-remote-login'); btn.disabled=true;
  try{
    rlog('Buscando el repetidor en los contactos de WIO'+via+'...');
    const target=await rakFindPubkey(via,REP_NOMBRE);
    rlog('Encontrado: '+(target.name||'(sin nombre)')+'. Enviando login por LoRa...');
    await rakRemoteLogin(via,target.pubkey,pass);
    rlog('Login enviado. Esperando confirmación del repetidor (puede tardar unos segundos)...');
    let verdict=null;
    for(let i=0;i<10 && !verdict;i++){
      await new Promise(r=>setTimeout(r,1500));
      const st=await rakGetWioStatus(via);
      verdict=rakLoginPushVerdict(st);
    }
    if(verdict==='success'){
      rakRemotePubkey=target.pubkey; rakRemoteVia=via;
      rlog('Sesión remota iniciada con '+(target.name||'el repetidor')+'.');
      setRakRemoteReady(true);
    }else if(verdict==='failed'){
      rlog('Login rechazado: contraseña incorrecta.');
    }else{
      rlog('Sin confirmación del repetidor todavía. Puede que esté fuera de alcance por radio ahora mismo; prueba a enviar un comando igualmente, a veces el aviso de éxito se pierde mientras la confirmación en sí llega bien.');
      rakRemotePubkey=target.pubkey; rakRemoteVia=via;
      setRakRemoteReady(true);
    }
  }catch(e){ rlog('Error: '+e.message); }
  finally{ btn.disabled=false; }
};
$('#btn-rak-remote-send').onclick=async()=>{
  const cmd=$('#rak-remote-cmd').value.trim();
  const btn=$('#btn-rak-remote-send'); btn.disabled=true;
  await sendRemoteCmd(cmd);
  $('#rak-remote-cmd').value='';
  btn.disabled=false;
};
$('#rak-remote-cmd').onkeydown=e=>{ if(e.key==='Enter') $('#btn-rak-remote-send').click(); };

// ==================== CHAT ====================
const seenMsgs=new Set();

// El chat vivia solo en memoria: recargar la pagina (o que el kiosko de la Pi
// se reinicie) lo borraba entero aunque los mensajes siguieran en el nodo.
// Se guarda en localStorage de este navegador para que sobreviva a recargas.
const CHAT_LOG_KEY='meshcore-chat-log';
const CHAT_LOG_MAX=300;
function loadChatLog(){
  try{ return JSON.parse(localStorage.getItem(CHAT_LOG_KEY))||[]; }
  catch(e){ return []; }
}
function saveChatLog(log){
  try{ localStorage.setItem(CHAT_LOG_KEY, JSON.stringify(log.slice(-CHAT_LOG_MAX))); }
  catch(e){ /* localStorage lleno o bloqueado: el chat sigue funcionando, solo no persiste */ }
}
const CANAL_NOMBRE={chan0:'Public',chan1:'Canal 1',chan2:'Canal 2',priv:'Privado'};
function colorDe(t){ let h=0; for(const c of String(t)) h=(h*31+c.charCodeAt(0))>>>0; return 'hsl('+(h%360)+',52%,40%)'; }
function inicialesDe(t){
  const p=String(t).replace(/[^\p{L}\p{N} _.-]/gu,'').trim().split(/[\s_.-]+/).filter(Boolean);
  if(!p.length) return '?';
  return (p[0][0]+(p[1]?p[1][0]:(p[0][1]||''))).toUpperCase();
}
function etiquetaDia(at){
  const d=new Date(at), x=new Date(at), hoy=new Date();
  x.setHours(0,0,0,0); hoy.setHours(0,0,0,0);
  const dif=Math.round((hoy-x)/86400000);
  return dif===0?'Hoy':dif===1?'Ayer':d.toLocaleDateString([], {weekday:'long',day:'numeric',month:'long'});
}
// Los guardados antes de este cambio no traen hora: se saca de su "meta".
function atDesdeMeta(meta){
  const m=String(meta||'').match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})/);
  return m?new Date(+m[3],m[2]-1,+m[1],+m[4],+m[5]).getTime():null;
}
// Texto de un mensaje: escapado y con las menciones @[nombre] como etiqueta y los
// enlaces http(s) pulsables (siempre en pestaña nueva y sin pasar datos).
function cuerpoHtml(t){
  let h=esc(t);
  h=h.replace(/@\[([^\]\n]{1,40})\]/g,'<span class="mencion">@$1</span>');
  h=h.replace(/https?:\/\/[^\s<]+/g,u=>{
    let corte=u.search(/&quot;|&#39;|&lt;|&gt;/); let url=corte>=0?u.slice(0,corte):u, resto=corte>=0?u.slice(corte):'';
    const m=url.match(/[.,;:!?)\]]+$/); if(m){ resto=m[0]+resto; url=url.slice(0,-m[0].length); }
    return '<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+url+'</a>'+resto;
  });
  return h;
}
function chatAdd(cls,who,text,meta,persist=true,dedupKey=null,kind='out',at=null){
  const box=$('#chatBox');
  const first=box.querySelector('.msg.sys');
  if(first && first.textContent.startsWith('Conecta un WIO')) first.remove();
  if(at==null) at=persist?Date.now():atDesdeMeta(meta);
  // Separador de dia: con el historial de varios dias ya no hace falta la
  // fecha entera en cada burbuja.
  if(at){
    const dia=new Date(at).toDateString();
    if(box.dataset.lastDay!==dia){
      box.dataset.lastDay=dia;
      const sep=document.createElement('div');
      sep.className='msg sys daysep'; sep.dataset.kind='sys';
      sep.innerHTML='<span>'+esc(etiquetaDia(at))+'</span>';
      box.appendChild(sep);
    }
  }
  const pegado=box.scrollHeight-box.scrollTop-box.clientHeight<140;   // si estabas leyendo arriba, no te arrastra
  const d=document.createElement('div');
  d.className='msg '+cls+(kind==='priv'&&cls!=='sys'?' priv':'')+(persist&&cls!=='sys'?' nuevo':'');
  d.dataset.kind=kind;
  const m=String(meta||'');
  d.dataset.via=[1,2].find(i=>m.includes(CFG.wios[i].nombre.replace(/^MeshCore-/,'')))||'';
  // En un canal MeshCore el texto llega como "Nombre: mensaje"; el nombre va
  // arriba en la burbuja y a su inicial en el circulo, no mezclado en el texto.
  let quien=who, cuerpo=text;
  if(cls==='in' && String(kind).startsWith('chan')){
    const m=String(text).match(/^([^:\n]{1,32}):\s*([\s\S]*)$/);
    if(m){ quien=m[1]; cuerpo=m[2]; }
  }
  let html='';
  if(cls==='in'){
    d.dataset.ini=inicialesDe(quien||'?');
    d.style.setProperty('--avc',colorDe(quien||'?'));
    html+='<div class="who"><b>'+esc(quien||'?')+'</b><span class="chip">'+esc(CANAL_NOMBRE[kind]||kind)+'</span></div>';
  }else if(who) html+='<div class="who">'+esc(who)+'</div>';
  html+='<div class="body">'+cuerpoHtml(cuerpo)+'</div>';
  if(meta){
    const corta=String(meta).replace(/^\d{1,2}\/\d{1,2}\/\d{4},?\s*/,'').replace(/(\d{1,2}:\d{2}):\d{2}/,'$1');
    html+='<div class="meta">'+esc(corta)+(cls==='out'&&CANAL_NOMBRE[kind]&&!corta.includes(CANAL_NOMBRE[kind])?' · '+esc(CANAL_NOMBRE[kind]):'')+
      (cls==='in'?'<button type="button" class="resp" title="Responder a '+esc(quien||'')+'">Responder</button>':'')+'</div>';
  }
  d.innerHTML=html;
  // Mensajes seguidos del mismo remitente (menos de 5 min): sin repetir avatar ni nombre.
  const prev=box.lastElementChild;
  if(cls==='in' && prev && prev.classList.contains('in') && prev.dataset.quien===String(quien) &&
     prev.dataset.kind===String(kind) && at && prev.dataset.at && at-prev.dataset.at<300000) d.classList.add('cont');
  d.dataset.quien=String(quien); if(at) d.dataset.at=at;
  applyChatFilterTo(d);
  box.appendChild(d);
  // Con dias de chat abierto el DOM crecia sin limite y el scroll se arrastraba.
  while(box.children.length>600) box.firstElementChild.remove();
  if(pegado||cls==='out') box.scrollTop=box.scrollHeight;
  if(persist){
    const log=loadChatLog();
    log.push({cls,who,text,meta,dedupKey,kind,at});
    saveChatLog(log);
  }
}
// «Última vez que vi el chat»: al abrirlo se coloca en lo primero que no habías visto
// (con una línea «N mensajes nuevos») o, si no hay nada nuevo, al final.
function marcarChatVisto(){ try{ localStorage.setItem('meshcore-chat-visto',String(Date.now())); }catch(e){} }
function posicionarChat(){
  const box=$('#chatBox'); if(!box) return;
  box.querySelector('#chatNuevos')?.remove();
  let visto=0; try{ visto=+localStorage.getItem('meshcore-chat-visto')||0; }catch(e){}
  const nuevos=visto?[...box.querySelectorAll('.msg.in')].filter(m=>+m.dataset.at>visto&&m.style.display!=='none'):[];
  if(nuevos.length){
    const l=document.createElement('div'); l.id='chatNuevos'; l.className='msg sys daysep'; l.dataset.kind='sys';
    l.innerHTML='<span>'+nuevos.length+(nuevos.length===1?' mensaje nuevo':' mensajes nuevos')+'</span>';
    nuevos[0].before(l); box.scrollTop=Math.max(0,l.offsetTop-box.offsetTop-16);
  }else box.scrollTop=box.scrollHeight;
  actualizarAlFinal();
}
// Botón «Ir al final» cuando estás leyendo mensajes antiguos.
function actualizarAlFinal(){
  const box=$('#chatBox'), b=$('#chatAlFinal'); if(!box||!b) return;
  b.hidden = box.scrollHeight-box.scrollTop-box.clientHeight<260;
}
document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='hidden'&&$('#tab-chat').classList.contains('on')) marcarChatVisto(); });
window.addEventListener('pagehide',()=>{ if($('#tab-chat').classList.contains('on')) marcarChatVisto(); });
function chatAviso(t){
  document.getElementById('chatAvisoUno')?.remove();
  chatAdd('sys',null,t,'',false);
  const l=$('#chatBox').lastElementChild; if(l) l.id='chatAvisoUno';
}
// Días sin ningún mensaje visible (al mirar una conversación): fuera el separador.
function ocultarDiasVacios(){
  let sep=null, hay=false;
  const cierra=()=>{ if(sep) sep.style.display=hay?'':'none'; };
  for(const el of $('#chatBox').children){
    if(el.classList.contains('daysep')&&el.id!=='chatNuevos'){ cierra(); sep=el; hay=false; }
    else if(el.style.display!=='none'&&!el.classList.contains('sys')) hay=true;
  }
  cierra();
}
function applyChatFilterTo(el){
  const f=$('#chatFilter')?.value||'all';
  const via=$('#chatViaFilter')?.value||'all';
  let passKind = f==='all' || el.classList.contains('sys') || el.dataset.kind===f;
  if(typeof convSel!=='undefined' && convSel && !el.classList.contains('sys')){
    const quien=el.querySelector('.who b')?.textContent||'';
    const meta=el.querySelector('.meta')?.textContent||'';
    passKind = el.dataset.kind==='priv' && (quien===convSel || metaEsA(meta,convSel));
  }
  const passVia = via==='all' || el.classList.contains('sys') || el.dataset.via==='' || String(el.dataset.via)===via;
  el.style.display = (passKind && passVia) ? '' : 'none';
}
$('#chatFilter').onchange=$('#chatViaFilter').onchange=()=>{
  $('#chatBox').querySelectorAll('.msg').forEach(applyChatFilterTo); ocultarDiasVacios();
};
$('#chatDownload').onclick=()=>{
  const log=loadChatLog();
  const lines=log.map(e=>{
    const who=e.who?('['+e.who+'] '):'';
    const meta=e.meta?(' ('+e.meta+')'):'';
    return who+e.text+meta;
  });
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='meshcore-chat-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.txt';
  a.click();
};
// «… · a Nombre» al final: comparación exacta, no por trozo (Ana ≠ Anabel).
function metaEsA(meta,n){ const m=String(meta||''), i=m.lastIndexOf('· a '); return i>=0 && m.slice(i+4).trim()===n; }
function alcanceBorrado(){
  const log=loadChatLog();
  const deConv=n=>e=>e.kind==='priv'&&(e.who===n||metaEsA(e.meta,n));
  if(convSel){ const n=convSel, f=deConv(n); return {titulo:'«'+n+'»', cuantos:log.filter(f), resto:e=>!f(e), conv:true}; }
  if(canalSel!=='all'){ const k='chan'+canalSel, nom=CANAL_NOMBRE[k]||('Canal '+canalSel); return {titulo:'el canal «'+nom+'»', cuantos:log.filter(e=>e.kind===k), resto:e=>e.kind!==k}; }
  return {titulo:'todo el chat', cuantos:log, resto:()=>false};
}
function etiquetaBorrar(){
  const b=$('#chatClear'); if(!b) return;
  const a=convSel?'Borrar chat':(canalSel!=='all'?'Borrar canal':'Borrar todo'); b.textContent=a; b.title=a+' (de este navegador)';
}
function rehacerChat(){
  const box=$('#chatBox'); box.innerHTML=''; delete box.dataset.lastDay; seenMsgs.clear();
  const log=loadChatLog();
  if(!log.length) box.innerHTML='<div class="msg sys">Conecta un WIO (pestaña Panel) para leer y enviar mensajes.</div>';
  for(const e of log){ chatAdd(e.cls,e.who,e.text,e.meta,false,null,e.kind||'out',e.at||null); if(e.dedupKey) seenMsgs.add(e.dedupKey); }
  if(typeof pintarContactos==='function') pintarContactos();
  posicionarChat();
}
function alcanceTodo(){ return {titulo:'todo el chat', cuantos:loadChatLog(), resto:()=>false}; }
function abrirBorrado(todo){
  const a=todo?alcanceTodo():alcanceBorrado(), n=a.cuantos.length;
  let dlg=document.getElementById('dlgBorrar');
  if(!dlg){
    dlg=document.createElement('dialog'); dlg.id='dlgBorrar'; dlg.className='dlgBorrar';
    dlg.innerHTML='<h3></h3><p></p><div class="dlgBt"><button type="button" id="dlgNo" autofocus>Cancelar</button><button type="button" id="dlgSi" class="peligro"></button></div>';
    document.body.appendChild(dlg);
    dlg.querySelector('#dlgNo').onclick=()=>dlg.close();
    dlg.addEventListener('click',e=>{ if(e.target===dlg) dlg.close(); });
  }
  dlg.querySelector('h3').textContent=n?('¿Borrar '+a.titulo+'?'):'No hay nada que borrar';
  dlg.querySelector('p').textContent=n?(n+(n===1?' mensaje guardado':' mensajes guardados')+' en este navegador. No se borra nada de los nodos: si llegan de nuevo, volverán a aparecer.'):'En esta vista no hay mensajes guardados.';
  const si=dlg.querySelector('#dlgSi'); si.textContent=n?'Borrar mensajes':'Cerrar';
  si.onclick=()=>{
    dlg.close();
    if(!n) return;
    saveChatLog(loadChatLog().filter(a.resto));
    if(a.conv) convSel=null;
    rehacerChat();
    if(a.conv&&typeof elegirCanal==='function') elegirCanal('all');
  };
  dlg.showModal();
}
$('#chatClear').onclick=()=>abrirBorrado(false);
// ==================== ANALITICA DE RADIO ====================
// Las medidas RF (SNR/RSSI por paquete) las da el nodo en el aviso 0x88 y las
// acumula el gateway en la Pi: aqui solo se agrupan y se dibujan.
// Cada grafica se dibuja al tamaño real de su hueco (viewBox = pixeles): con un
// viewBox fijo estirado el texto salia diminuto en pantallas anchas.
const G_TXT='#8b98a8', G_DIM='#5c6b7d', G_GRID='#1a2430';
function svgTam(el,alto){
  const w=Math.max(260,Math.round(el.getBoundingClientRect().width||el.parentNode.clientWidth||320));
  el.setAttribute('viewBox','0 0 '+w+' '+alto);
  el.style.width='100%'; el.style.height=alto+'px';
  return w;
}
function pasoBonito(max,n){
  const raw=max/(n||4), p=Math.pow(10,Math.floor(Math.log10(raw||1))), f=raw/p;
  return (f<=1?1:f<=2?2:f<=5?5:10)*p;
}
function svgVacio(el,w,h,texto){
  el.innerHTML='<text x="'+(w/2)+'" y="'+(h/2)+'" font-size="12.5" fill="'+G_DIM+'" text-anchor="middle">'+texto+'</text>';
}
function barraRedonda(x,y,w,h,r){
  r=Math.max(0,Math.min(r,h,w/2));
  const f=v=>v.toFixed(1);
  return 'M'+f(x)+','+f(y+h)+'V'+f(y+r)+'Q'+f(x)+','+f(y)+' '+f(x+r)+','+f(y)+'H'+f(x+w-r)+
         'Q'+f(x+w)+','+f(y)+' '+f(x+w)+','+f(y+r)+'V'+f(y+h)+'Z';
}
// buckets: [{label,n,actual?}] · opts: {color (str o fn(b,i)), unidad, eje, alto}
function statBars(sel,buckets,opts){
  opts=opts||{};
  const el=$(sel); if(!el||oculto(el)) return;
  const H=opts.alto||210, W=svgTam(el,H);
  const L=36,R=6,T=20,B=opts.eje?42:26;
  const total=buckets.reduce((a,b)=>a+b.n,0);
  if(!total){ svgVacio(el,W,H,opts.vacio||'Sin datos todavía'); return; }
  const max=Math.max(1,...buckets.map(b=>b.n));
  const paso=Math.max(1,pasoBonito(max,4)), tope=Math.ceil(max/paso)*paso;
  const Y=v=>T+(H-T-B)*(1-v/tope);
  let s='';
  for(let v=0;v<=tope;v+=paso){
    s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+G_GRID+'"'+(v?' stroke-dasharray="3,4"':'')+'/>'+
       '<text x="'+(L-7)+'" y="'+(Y(v)+3.5).toFixed(1)+'" font-size="10" fill="'+G_DIM+'" text-anchor="end">'+v+'</text>';
  }
  const n=buckets.length, ancho=W-L-R;
  const gap=Math.max(2,Math.min(12,ancho/n*0.2)), bw=(ancho-gap*(n-1))/n;
  // Rotulos del eje x que caben sin pisarse (cada 1, 2, 3... barras)
  const cada=Math.max(1,Math.ceil(n/Math.max(1,Math.floor(ancho/(opts.rotulo||44)))));
  buckets.forEach((b,i)=>{
    const x=L+i*(bw+gap), y=Y(b.n), h=H-B-y;
    const col=typeof opts.color==='function'?opts.color(b,i):opts.color;
    const pct=Math.round(100*b.n/total);
    s+='<g class="gbar" style="--d:'+(i*28)+'ms"><title>'+esc(b.label+(opts.unidad?' '+opts.unidad:''))+': '+b.n+' ('+pct+' %)</title>';
    s+='<rect x="'+x.toFixed(1)+'" y="'+T+'" width="'+bw.toFixed(1)+'" height="'+(H-T-B)+'" fill="transparent"/>';
    s+= b.n ? '<path d="'+barraRedonda(x,y,bw,Math.max(h,2),Math.min(5,bw/3))+'" fill="'+col+'"'+
              (b.actual?' stroke="#e8eef4" stroke-opacity=".55" stroke-width="1.2"':'')+'/>'
            : '<rect x="'+x.toFixed(1)+'" y="'+(H-B-2)+'" width="'+bw.toFixed(1)+'" height="2" rx="1" fill="'+col+'" opacity=".25"/>';
    if(b.n && bw>=18) s+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(y-6).toFixed(1)+'" font-size="10.5" font-weight="700" fill="#c8d2e0" text-anchor="middle">'+b.n+'</text>';
    if(i%cada===0) s+='<text x="'+(x+bw/2).toFixed(1)+'" y="'+(H-B+16)+'" font-size="10.5" fill="'+(b.actual?'#e8eef4':G_TXT)+
                      '"'+(b.actual?' font-weight="700"':'')+' text-anchor="middle">'+esc(b.label)+'</text>';
    s+='</g>';
  });
  // Umbrales: línea discontinua vertical con su etiqueta (k = posición en barras, con decimales).
  (opts.marcas||[]).forEach(m=>{
    if(m.k==null) return;
    const x=L+m.k*(bw+gap)-gap/2, col=m.color||'#f2b23a', t=esc(m.texto), tw=t.length*5.4+10;
    const ax=m.anchor==='end'?x-tw-3:x+3;
    s+='<line x1="'+x.toFixed(1)+'" x2="'+x.toFixed(1)+'" y1="'+(T-3)+'" y2="'+(H-B)+'" stroke="'+col+'" stroke-width="1.4" stroke-dasharray="4 3" opacity=".9"/>'
     + '<rect x="'+ax.toFixed(1)+'" y="'+(T-17)+'" width="'+tw.toFixed(1)+'" height="15" rx="7.5" fill="#11161e" stroke="'+col+'" stroke-opacity=".5"/>'
     + '<text x="'+(ax+tw/2).toFixed(1)+'" y="'+(T-6.5)+'" font-size="10" font-weight="600" fill="'+col+'" text-anchor="middle">'+t+'</text>';
  });
  if(opts.eje) s+='<text x="'+(L+ancho/2).toFixed(1)+'" y="'+(H-6)+'" font-size="10.5" fill="'+G_DIM+'" text-anchor="middle">'+esc(opts.eje)+'</text>';
  el.innerHTML=s;
}
// Posición (en barras) de un valor dentro de un histograma con bordes e[0..]; null si cae fuera.
function posBarra(v,e){
  if(v==null||isNaN(v)||v<e[0]||v>=e[e.length-1]) return null;
  for(let j=0;j<e.length-1;j++) if(v>=e[j]&&v<e[j+1]) return (j+1)+(v-e[j])/(e[j+1]-e[j]);
  return null;
}
function mediana(a){
  if(!a.length) return null;
  const s=[...a].sort((x,y)=>x-y), m=s.length>>1;
  return s.length%2 ? s[m] : (s[m-1]+s[m])/2;
}
function kpi(k,v,sub,color,delta){
  return '<div class="kpi"><div class="kpiK">'+k+'</div><div class="kpiV"'+
    (color?' style="color:'+color+'"':'')+'>'+v+'</div>'+
    (sub?'<div class="kpiS">'+sub+'</div>':'')+(delta||'')+'</div>';
}
// Variación frente al periodo anterior. mejorSiSube: true/false pinta verde/rojo; null = neutro.
function deltaKpi(v,unidad,mejorSiSube,umbral,dec){
  if(v==null||isNaN(v)) return '';
  const igual=Math.abs(v)<umbral;
  const cls=igual||mejorSiSube==null?'eq':((v>0)===mejorSiSube?'up':'dn');
  const n=(+Math.abs(v).toFixed(dec)===0?'':v>0?'+':'−')+Math.abs(v).toFixed(dec).replace('.',',');
  return '<div class="kpiD '+cls+'">'+(igual?'●':v>0?'▲':'▼')+' '+n+unidad+' <span>vs. periodo anterior</span></div>';
}
// Calidad de enlace LoRa por SNR: rojo al limite, ambar justo, verde holgado.
const COL_SNR=['#ff6b6b','#ff8f5a','#f0b429','#d8cf4f','#9bdc6a','#3fd67a','#2fb968'];
// Cada llamada lleva su numero: si llega la respuesta de una vieja (cambio de
// rango rapido) despues de una nueva, no pinta encima.
let renderStatsSeq=0, histRakSeq=0;
// forzar: pedir datos nuevos (si no, se reutilizan los de hace menos de 30 s al cambiar de sección).
// silencioso: sin animaciones (al redimensionar la ventana).
async function renderStats(forzar,silencioso){
  const mi=++renderStatsSeq;
  $('#tab-stats').classList.toggle('sinanim',!!silencioso);
  const sub=$('#statsSub');
  const horas=+$('#statsRange').value;
  let muestras=[], total=0, hist=[], horasRx=null, fallo=false;
  const reciente=!forzar && statsCache && Date.now()-statsCache.t<30000;
  if(reciente){ ({muestras,total,hist,horasRx}=statsCache); }
  else{
    // Esqueleto brillante mientras llegan los datos (solo en las gráficas aún vacías).
    document.querySelectorAll('#tab-stats .statSvg').forEach(s=>{ if(!s.firstChild) s.classList.add('cargando'); });
    if(typeof rakRxLog==='function'){
      try{
        const r=await rakRxLog(4000);
        if(mi!==renderStatsSeq) return;
        muestras=r.samples||[]; total=r.total||muestras.length;
      }catch(e){ fallo=true; sub.textContent='No se pudo leer el registro de radio: '+e.message; }
    }else{
      fallo=true; sub.textContent='Puente no cargado: no hay acceso al registro de radio.';
    }
    // Historial del repetidor (ruido, tráfico, aire) y paquetes por hora (mapa de calor).
    try{ if(typeof rakHistory==='function') hist=((await rakHistory(1500)).samples||[]); }catch(e){}
    try{ if(typeof rakRxHoras==='function') horasRx=await rakRxHoras(7); }catch(e){}
    if(mi!==renderStatsSeq) return;
    if(!fallo) statsCache={t:Date.now(),muestras,total,hist,horasRx};
  }
  const ahoraS=Date.now()/1000;
  const todas=muestras;   // sin recortar: hace falta para comparar con el periodo anterior
  if(horas>0) muestras=muestras.filter(m=>m.at>=ahoraS-horas*3600);
  const snr=muestras.map(m=>m.snr).filter(v=>v!=null);
  const rssi=muestras.map(m=>m.rssi).filter(v=>v!=null);
  // Sin paquetes, decir por que: con los dos WIO apagados no llega nada.
  const algunWio=[1,2].some(i=>wNodes[i]&&wNodes[i].device&&wNodes[i].device.gatt.connected);
  const vacio = algunWio ? 'Sin paquetes en este periodo' : 'Ningún WIO encendido: no llega nada por radio';

  // KPIs
  const medSnr=mediana(snr), medRssi=mediana(rssi);
  const debiles=snr.filter(v=>v<0).length;
  const pctDebil=snr.length?Math.round(100*debiles/snr.length):0;
  // Ritmo sobre el periodo que se tiene de verdad: con "24 h" pero solo 13 min
  // guardados (gateway recien reiniciado) salian 263/h con 58 paquetes.
  let porHora='—', ritmoSub='paquetes por hora';
  if(muestras.length>1){
    const desde=horas>0?Math.max(muestras[0].at,ahoraS-horas*3600):muestras[0].at;
    const span=(ahoraS-desde)/3600;
    if(span>=0.25){
      porHora=Math.round(muestras.length/span)+'/h';
      if(horas>0 && span<horas*0.9) ritmoSub='en las '+(span<1?Math.round(span*60)+' min':span.toFixed(1)+' h')+' con datos';
    }
  }
  // Periodo anterior (mismo largo, justo antes): solo si el registro llega hasta entonces.
  let prev=null;
  if(horas>0 && todas.length && todas[0].at<=ahoraS-2*horas*3600+300){
    const pm=todas.filter(m=>m.at>=ahoraS-2*horas*3600 && m.at<ahoraS-horas*3600);
    if(pm.length>=10){
      const ps=pm.map(m=>m.snr).filter(v=>v!=null);
      prev={n:pm.length,snr:mediana(ps),deb:ps.length?Math.round(100*ps.filter(v=>v<0).length/ps.length):null};
    }
  }
  // Ruido de fondo y duplicados del repetidor (al menos 6 h para que haya medidas).
  const hv=horas>0?Math.max(horas,6):24;
  const enVentana=(a,b)=>hist.filter(x=>x.at>=ahoraS-a*3600 && x.at<ahoraS-b*3600);
  const medRuido=arr=>{ const v=arr.map(x=>x.noise_floor).filter(n=>typeof n==='number'&&n>-150&&n<-50); return v.length>=2?mediana(v):null; };
  const pctDup=(a,b)=>{
    let rx=0,du=0;
    for(const x of deltasRepetidor(hist)){ if(x.at>=ahoraS-a*3600 && x.at<ahoraS-b*3600 && x.flood!=null && x.direct!=null){ rx+=x.flood+x.direct; du+=x.dup; } }
    return rx>=50?Math.min(100,100*du/rx):null;
  };
  const cubre=hist.length && hist[0].at<=ahoraS-2*hv*3600+1800;
  const ruidoAhora=medRuido(enVentana(hv,-1)), ruidoAntes=cubre?medRuido(enVentana(2*hv,hv)):null;
  const dupAhora=pctDup(hv,-1), dupAntes=cubre?pctDup(2*hv,hv):null;
  const batU=[...hist].reverse().find(x=>x.bat_mv), dutyU=[...hist].reverse().find(x=>x.duty_cycle!=null);
  $('#statsKpis').innerHTML=
    kpi('Paquetes oídos',muestras.length.toLocaleString(),horas>0?('en '+horas+' h · '+total.toLocaleString()+' guardados'):(total.toLocaleString()+' guardados'),null,
        prev?deltaKpi(100*(muestras.length-prev.n)/prev.n,' %',null,1,0):'')+
    kpi('Ritmo',porHora,ritmoSub)+
    kpi('SNR mediana',medSnr==null?'—':medSnr.toFixed(1)+' dB',
        medSnr==null?'':(medSnr>5?'buena':medSnr>0?'aceptable':'al límite'),
        medSnr==null?null:(medSnr>5?'#3fd67a':medSnr>0?'#f0b429':'#ff6b6b'),
        prev&&medSnr!=null&&prev.snr!=null?deltaKpi(medSnr-prev.snr,' dB',true,0.5,1):'')+
    kpi('RSSI mediana',medRssi==null?'—':medRssi+' dBm','potencia típica')+
    kpi('Al límite',snr.length?pctDebil+' %':'—','paquetes con SNR < 0 dB',pctDebil>50?'#f0b429':null,
        prev&&snr.length&&prev.deb!=null?deltaKpi(pctDebil-prev.deb,' pts',false,2,0):'')+
    kpi('Ruido de fondo',ruidoAhora==null?'—':Math.round(ruidoAhora)+' dBm','mediana · últimas '+hv+' h',null,
        ruidoAhora!=null&&ruidoAntes!=null?deltaKpi(ruidoAhora-ruidoAntes,' dB',false,1,0):'')+
    kpi('Duplicados',dupAhora==null?'—':Math.round(dupAhora)+' %','de lo que recibe el repetidor',null,
        dupAhora!=null&&dupAntes!=null?deltaKpi(dupAhora-dupAntes,' pts',null,2,0):'')+
    kpi('Batería',batU?(batU.bat_mv/1000).toFixed(2)+' V':'—',batU?'última medida '+humanAgo(batU.at*1000):'del repetidor',batU&&batU.bat_mv<3800?'#ff6b6b':null)+
    kpi('Emisión',dutyU?dutyU.duty_cycle.toFixed(2).replace('.',',')+' %':'—','del tiempo · límite legal 10 %',dutyU?(dutyU.duty_cycle<=10?'#3fd67a':'#ff6b6b'):null);
  [...$('#statsKpis').children].forEach((k,i)=>{ k.dataset.g=KPI_G[i]||''; });
  pintarAlertas({muestras,hist,snr:snr.length,pctDebil});
  if(statsAnimaKpis){ statsAnimaKpis=false; contarKpis(); }

  if(muestras.length) sub.textContent='Medidas reales de cada paquete que oye tu nodo, no texto del chat.';
  else if(!algunWio) sub.textContent='Ningún WIO encendido: las gráficas de radio se llenan en cuanto conectes uno.';

  // SNR
  const snrB=[{label:'<-10',n:0},{label:'-10…-5',n:0},{label:'-5…0',n:0},{label:'0…5',n:0},
              {label:'5…10',n:0},{label:'10…15',n:0},{label:'>15',n:0}];
  for(const v of snr){
    if(v<-10) snrB[0].n++; else if(v<-5) snrB[1].n++; else if(v<0) snrB[2].n++;
    else if(v<5) snrB[3].n++; else if(v<10) snrB[4].n++; else if(v<15) snrB[5].n++; else snrB[6].n++;
  }
  statBars('#snrChart',snrB,{vacio,color:(b,i)=>i<2?'#f26b6b':i<3?'#f2b23a':'#3fd67a',unidad:'dB',eje:'SNR (dB) · rojo = al límite, verde = holgado',
    marcas:(()=>{
      // Límite de demodulación según el factor de dispersión (SF) del companion; SF7 si no se sabe.
      const sf=(()=>{ for(const i of [1,2]){ try{ const st=loadNodeState(i); if(st&&st.sf) return +st.sf; }catch(e){} } return 7; })();
      const lim={7:-7.5,8:-10,9:-12.5,10:-15,11:-17.5,12:-20}[sf];
      const e=[-10,-5,0,5,10,15];
      return [{k:posBarra(lim,e),texto:'límite SF'+sf+' · '+String(lim).replace('.',',')+' dB',color:'#f26b6b',anchor:'end'},
              {k:posBarra(0,e),texto:'0 dB · justo',color:'#f2b23a',anchor:'start'}];
    })()});

  // RSSI: mas fuerte = azul mas intenso
  const rssiB=[{label:'<-125',n:0},{label:'-125…-115',n:0},{label:'-115…-105',n:0},{label:'-105…-95',n:0},
               {label:'-95…-85',n:0},{label:'-85…-70',n:0},{label:'>-70',n:0}];
  for(const v of rssi){
    if(v<-125) rssiB[0].n++; else if(v<-115) rssiB[1].n++; else if(v<-105) rssiB[2].n++;
    else if(v<-95) rssiB[3].n++; else if(v<-85) rssiB[4].n++; else if(v<-70) rssiB[5].n++; else rssiB[6].n++;
  }
  statBars('#rssiChart',rssiB,{vacio,color:(b,i)=>'rgba(94,179,245,'+(0.38+0.62*i/6).toFixed(2)+')',unidad:'dBm',
    eje:'RSSI (dBm) · a la derecha, más fuerte',rotulo:62,
    marcas:(window.rakEstado&&window.rakEstado.noise!=null)?[{k:posBarra(window.rakEstado.noise,[-125,-115,-105,-95,-85,-70]),texto:'ruido de fondo '+window.rakEstado.noise+' dBm',color:'#a78bfa',anchor:'start'}]:[]});

  // Actividad por hora (la hora en curso resaltada)
  const ahora=new Date(); ahora.setMinutes(0,0,0);
  const nH = horas>0 ? Math.min(horas,24) : 24;
  const actB=[];
  for(let i=nH-1;i>=0;i--){
    const h=new Date(ahora.getTime()-i*3600000);
    actB.push({label:String(h.getHours()).padStart(2,'0')+'h',n:0,_ini:h.getTime()/1000,actual:i===0});
  }
  for(const m of muestras){
    for(let i=actB.length-1;i>=0;i--){
      if(m.at>=actB[i]._ini){ actB[i].n++; break; }
    }
  }
  const top=actB.map(b=>b.n).sort((a,b)=>b-a)[2]||1;
  statBars('#actChart',actB,{vacio,color:b=>b.n>=top&&b.n>0?'#f2b23a':'#3a4452',unidad:'',eje:'hora del día · en ámbar, las 3 horas con más tráfico',rotulo:40});

  // Saltos de vecinos. "flood" va aparte: suele ser la mayoria y aplastaba el resto.
  const hopsB=[{label:'directo',n:0},{label:'1 salto',n:0},{label:'2',n:0},{label:'3',n:0},
               {label:'4',n:0},{label:'5+',n:0}];
  let flood=0, conocidos=0;
  for(const idx of [1,2]){
    const data=loadNeighbors(idx);
    for(const c of ((data&&data.contacts)||[])){
      conocidos++;
      const h=c.hops;
      if(h==null) flood++;
      else if(h>=5) hopsB[5].n++;
      else hopsB[h].n++;
    }
  }
  statBars('#hopsChart',hopsB,{color:(b,i)=>i===0?'#3fd67a':'#a78bfa',unidad:'',eje:'saltos hasta el nodo'});
  const extra=$('#hopsExtra');
  if(extra) extra.innerHTML=conocidos
    ? '<b>'+(conocidos-flood)+'</b> con ruta conocida · <b>'+flood+'</b> sin ruta fija (flood) · '+conocidos+' contactos'
    : 'Escanea vecinos en el Mapa para ver esto.';
  // Gráficas nuevas: cada una por separado, para que un fallo no tumbe el resto.
  for(const f of [()=>pintarSnrHora(muestras,vacio),()=>pintarMapaCalor(horasRx),()=>pintarTrafico(hist),
                  ()=>pintarAire(hist),()=>pintarRuido(hist)]){
    try{ f(); }catch(e){ console.error('Analítica:',e); }
  }
  document.querySelectorAll('#tab-stats .statSvg.cargando').forEach(s=>s.classList.remove('cargando'));
  ['#snrChart','#rssiChart','#snrHoraChart','#actChart','#hopsChart','#mapaCalorChart','#traficoChart','#aireChart','#ruidoChart'].forEach(q=>animarSvg($(q)));
}

// ---- Gráficas de Analítica añadidas en la 1.30 ----
const DIAS_ES=['dom','lun','mar','mié','jue','vie','sáb'];
const hh2=n=>String(n).padStart(2,'0');
function percentil(a,p){
  if(!a.length) return null;
  const s=[...a].sort((x,y)=>x-y), i=(s.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
  return s[lo]+(s[hi]-s[lo])*(i-lo);
}
// Límite de demodulación según el SF del companion (SF7 si no se sabe).
function limiteSf(){
  let sf=7;
  for(const i of [1,2]){ try{ const st=loadNodeState(i); if(st&&st.sf){ sf=+st.sf; break; } }catch(e){} }
  return {sf,lim:{7:-7.5,8:-10,9:-12.5,10:-15,11:-17.5,12:-20}[sf]};
}
// Etiqueta redondeada sobre el gráfico (se queda dentro del ancho).
function pildora(cx,cy,t,col,W){
  const tw=t.length*5.6+16, x=Math.max(2,Math.min(W-tw-2,cx-tw/2));
  return '<rect x="'+x.toFixed(1)+'" y="'+(cy-10)+'" width="'+tw.toFixed(1)+'" height="20" rx="10" fill="#11161e" stroke="'+col+'" stroke-opacity=".6"/>'+
         '<text x="'+(x+tw/2).toFixed(1)+'" y="'+(cy+3.6)+'" font-size="10.5" font-weight="600" fill="'+col+'" text-anchor="middle">'+esc(t)+'</text>';
}
// Los contadores del repetidor suman desde que arrancó: lo útil es la diferencia entre
// dos medidas seguidas. Un hueco largo o un reinicio (uptime que baja) no se compara.
function deltasRepetidor(s){
  const out=[];
  for(let i=1;i<s.length;i++){
    const a=s[i-1], b=s[i], dt=b.at-a.at;
    if(!(dt>0) || dt>7200 || !(b.uptime>a.uptime)) continue;
    const dif=(k,mod)=>{ if(a[k]==null||b[k]==null) return null; let v=b[k]-a[k]; if(v<0&&mod) v+=mod; return v<0?null:v; };
    out.push({at:b.at,up:b.uptime-a.uptime,flood:dif('recv_flood'),direct:dif('recv_direct'),
              dup:(dif('dups_flood',65536)||0)+(dif('dups_direct',65536)||0),rx:dif('airtime_rx'),tx:dif('airtime_tx')});
  }
  return out;
}
// Tramos continuos de una serie con huecos: [[p,p,...],[p,...]]
function tramos(puntos,huecoS){
  const out=[]; let cur=[];
  for(const p of puntos){
    if(cur.length && p.at-cur[cur.length-1].at>huecoS){ out.push(cur); cur=[]; }
    cur.push(p);
  }
  if(cur.length) out.push(cur);
  return out;
}

// B · SNR por hora del día: mediana y 50 % central.
function pintarSnrHora(muestras,vacio){
  const el=$('#snrHoraChart'); if(!el||oculto(el)) return;
  const H=210, W=svgTam(el,H);
  const por=Array.from({length:24},()=>[]);
  for(const m of muestras) if(m.snr!=null) por[new Date(m.at*1000).getHours()].push(m.snr);
  const hs=[]; for(let h=0;h<24;h++) if(por[h].length>=3) hs.push(h);
  if(hs.length<4){ svgVacio(el,W,H,muestras.length?'Hace falta más tiempo de datos (4 horas del día con 3 paquetes o más)':vacio); return; }
  const med={}, q1={}, q3={};
  for(const h of hs){ med[h]=percentil(por[h],.5); q1[h]=percentil(por[h],.25); q3[h]=percentil(por[h],.75); }
  const {sf,lim}=limiteSf();
  const ymin=Math.min(Math.floor((Math.min(...hs.map(h=>q1[h]))-1)/5)*5,-5);
  const ymax=Math.max(Math.ceil((Math.max(...hs.map(h=>q3[h]))+1)/5)*5,5);
  const L=36,R=10,T=18,B=28;
  const X=h=>L+(W-L-R)*h/23, Y=v=>T+(H-T-B)*(1-(v-ymin)/(ymax-ymin));
  let s='';
  const paso=(ymax-ymin)>30?10:5;
  for(let v=Math.ceil(ymin/paso)*paso;v<=ymax;v+=paso)
    s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+G_GRID+'"/>'+
       '<text x="'+(L-7)+'" y="'+(Y(v)+3.5).toFixed(1)+'" font-size="10" fill="'+G_DIM+'" text-anchor="end">'+v+'</text>';
  const marca=(v,col,t)=>'<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+col+'" stroke-opacity=".6" stroke-dasharray="4 4"/>'+
    '<text x="'+(W-R-2)+'" y="'+(Y(v)-4).toFixed(1)+'" font-size="9.5" fill="'+col+'" text-anchor="end">'+t+'</text>';
  s+=marca(0,'#f2b23a','0 dB · justo');
  if(lim>=ymin) s+=marca(lim,'#f26b6b','límite SF'+sf+' · '+String(lim).replace('.',',')+' dB');
  // tramos de horas seguidas con datos
  let seg=[];
  const cierra=()=>{
    if(!seg.length) return;
    if(seg.length>1){
      s+='<path d="M'+seg.map(h=>X(h).toFixed(1)+','+Y(q3[h]).toFixed(1)).join(' L')+' L'+[...seg].reverse().map(h=>X(h).toFixed(1)+','+Y(q1[h]).toFixed(1)).join(' L')+'Z" fill="#5aaef0" fill-opacity=".16"/>';
      s+='<path d="M'+seg.map(h=>X(h).toFixed(1)+','+Y(med[h]).toFixed(1)).join(' L')+'" fill="none" stroke="#5aaef0" stroke-width="2" stroke-linejoin="round"/>';
    }else s+='<circle cx="'+X(seg[0]).toFixed(1)+'" cy="'+Y(med[seg[0]]).toFixed(1)+'" r="3" fill="#5aaef0"/>';
    seg=[];
  };
  for(let h=0;h<24;h++){ if(por[h].length>=3) seg.push(h); else cierra(); }
  cierra();
  for(const h of hs){
    s+='<g class="gbar"><title>'+hh2(h)+' h · mediana '+med[h].toFixed(1).replace('.',',')+' dB · '+por[h].length+' paquetes</title>'+
       '<rect x="'+(X(h)-(W-L-R)/46).toFixed(1)+'" y="'+T+'" width="'+((W-L-R)/23).toFixed(1)+'" height="'+(H-T-B)+'" fill="transparent"/></g>';
  }
  if(hs.length>=6){
    const peor=hs.reduce((a,h)=>med[h]<med[a]?h:a,hs[0]), mejor=Math.max(...hs.map(h=>med[h]));
    if(mejor-med[peor]>=3) s+=pildora(Math.min(Math.max(X(peor),L+55),W-R-55),Math.max(T+8,Y(med[peor])-20),'peor a las '+hh2(peor)+' h','#f2b23a',W);
  }
  for(let h=0;h<24;h+=3) s+='<text x="'+X(h).toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="'+G_TXT+'" text-anchor="middle">'+hh2(h)+'h</text>';
  el.innerHTML=s;
}

// A · mapa de calor: 7 días x 24 horas, con los paquetes por hora que da el gateway.
function pintarMapaCalor(datos){
  const el=$('#mapaCalorChart'); if(!el||oculto(el)) return;
  const H=214, W=svgTam(el,H);
  const mapa=new Map(); let max=0;
  for(const h of ((datos&&datos.horas)||[])){ mapa.set(h.t,h); if(h.n>max) max=h.n; }
  if(!max){ svgVacio(el,W,H,'Aún no hay paquetes guardados'); return; }
  const desde=datos.desde||0, ahoraS=Date.now()/1000;
  const L=34,R=4,T=4,B=22, ch=(H-T-B)/7-3, cw=(W-L-R)/24;
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  let s='';
  for(let r=0;r<7;r++){
    const dia=new Date(hoy); dia.setDate(hoy.getDate()-(6-r));
    const y=T+r*(ch+3), nom=DIAS_ES[dia.getDay()];
    s+='<text x="'+(L-7)+'" y="'+(y+ch/2+3.5).toFixed(1)+'" font-size="10.5" fill="'+(r===6?'#e8eef4':G_TXT)+'"'+(r===6?' font-weight="700"':'')+' text-anchor="end">'+nom+'</text>';
    for(let h=0;h<24;h++){
      const ini=new Date(dia.getFullYear(),dia.getMonth(),dia.getDate(),h).getTime()/1000;
      const fin=new Date(dia.getFullYear(),dia.getMonth(),dia.getDate(),h+1).getTime()/1000;
      let e=null;   // las horas repetidas del cambio de octubre se suman en una casilla
      for(let t=Math.floor(ini/3600)*3600;t<fin;t+=3600){ const q=mapa.get(t); if(q) e=e?{n:e.n+q.n,snr:q.n>e.n?q.snr:e.snr}:q; }
      const x=(L+h*cw).toFixed(1);
      const base='x="'+x+'" y="'+y.toFixed(1)+'" width="'+(cw-2).toFixed(1)+'" height="'+ch.toFixed(1)+'" rx="4"';
      const cuando=nom+' '+dia.getDate()+'/'+(dia.getMonth()+1)+' · '+hh2(h)+' h';
      if(ini>ahoraS) s+='<rect '+base+' fill="none" stroke="'+G_GRID+'"/>';
      else if(e) s+='<rect '+base+' class="cel" style="animation-delay:'+(h*16+r*30)+'ms" fill="#3fd67a" fill-opacity="'+(0.14+0.8*Math.sqrt(e.n/max)).toFixed(2)+'"><title>'+cuando+' · '+e.n+(e.n===1?' paquete':' paquetes')+(e.snr!=null?' · SNR mediana '+e.snr.toFixed(1).replace('.',',')+' dB':'')+'</title></rect>';
      else if(ini+3600<=desde) s+='<rect '+base+' fill="none" stroke="'+G_DIM+'" stroke-opacity=".5" stroke-dasharray="3 3"><title>'+cuando+' · sin datos guardados</title></rect>';
      else s+='<rect '+base+' fill="#3fd67a" fill-opacity=".05"><title>'+cuando+' · ningún paquete</title></rect>';
    }
  }
  for(let h=0;h<24;h+=3) s+='<text x="'+(L+h*cw+(cw-2)/2).toFixed(1)+'" y="'+(H-6)+'" font-size="10.5" fill="'+G_TXT+'" text-anchor="middle">'+hh2(h)+'h</text>';
  el.innerHTML=s;
  const pie=$('#mapaCalorPie');
  if(pie){
    const dd=new Date(desde*1000);
    pie.textContent='Pasa el ratón por una casilla para ver el detalle. Las rayadas son ratos sin datos'+
      (desde>ahoraS-7*86400?' (el registro empieza el '+dd.getDate()+'/'+(dd.getMonth()+1)+').':'.');
  }
}

// D · tráfico por hora: inundación y directo apilados, y % de duplicados.
function pintarTrafico(hist){
  const el=$('#traficoChart'); if(!el||oculto(el)) return;
  const H=210, W=svgTam(el,H), extra=$('#traficoExtra');
  const ahoraS=Date.now()/1000, ini=Math.floor(ahoraS/3600)*3600-23*3600;
  const b=Array.from({length:24},()=>({fl:0,di:0,du:0}));
  for(const d of deltasRepetidor(hist)){
    if(d.flood==null||d.direct==null) continue;
    const i=Math.floor((d.at-ini)/3600); if(i<0||i>23) continue;
    b[i].fl+=d.flood; b[i].di+=d.direct; b[i].du+=d.dup;
  }
  const totFl=b.reduce((a,x)=>a+x.fl,0), totDi=b.reduce((a,x)=>a+x.di,0), totDu=b.reduce((a,x)=>a+x.du,0);
  if(!(totFl+totDi)){ svgVacio(el,W,H,'Aún sin medidas del repetidor en las últimas 24 h'); if(extra) extra.textContent=''; return; }
  if(extra) extra.innerHTML='<b>'+(totFl+totDi).toLocaleString()+'</b> recibidos · <b>'+Math.round(100*totFl/(totFl+totDi))+' %</b> por inundación · duplicados <b>'+Math.min(100,Math.round(100*totDu/(totFl+totDi)))+' %</b>';
  const L=36,R=34,T=26,B=26, bw=(W-L-R)/24;
  const max=Math.max(1,...b.map(x=>x.fl+x.di)), paso=Math.max(1,pasoBonito(max,4)), tope=Math.ceil(max/paso)*paso;
  const Y=v=>T+(H-T-B)*(1-v/tope), YP=p=>T+(H-T-B)*(1-p/100);
  let s='';
  for(let v=0;v<=tope;v+=paso)
    s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+G_GRID+'"'+(v?' stroke-dasharray="3,4"':'')+'/>'+
       '<text x="'+(L-7)+'" y="'+(Y(v)+3.5).toFixed(1)+'" font-size="10" fill="'+G_DIM+'" text-anchor="end">'+v+'</text>';
  for(const p of [0,50,100]) s+='<text x="'+(W-R+6)+'" y="'+(YP(p)+3.5).toFixed(1)+'" font-size="10" fill="#f2b23a" fill-opacity=".8">'+p+' %</text>';
  const pts=[];
  b.forEach((x,i)=>{
    const xx=L+i*bw, h=new Date((ini+i*3600)*1000).getHours(), tot=x.fl+x.di, pd=tot?Math.min(100,100*x.du/tot):null;
    s+='<g class="gbar" style="--d:'+(i*22)+'ms"><title>'+hh2(h)+' h · '+x.fl+' a todos (inundación) · '+x.di+' directos'+(pd!=null?' · '+Math.round(pd)+' % duplicados':'')+'</title>'+
       '<rect x="'+xx.toFixed(1)+'" y="'+T+'" width="'+bw.toFixed(1)+'" height="'+(H-T-B)+'" fill="transparent"/>';
    if(x.fl) s+='<rect x="'+xx.toFixed(1)+'" y="'+Y(x.fl).toFixed(1)+'" width="'+(bw-3).toFixed(1)+'" height="'+(Y(0)-Y(x.fl)).toFixed(1)+'" rx="2" fill="#a78bfa"/>';
    if(x.di) s+='<rect x="'+xx.toFixed(1)+'" y="'+Y(x.fl+x.di).toFixed(1)+'" width="'+(bw-3).toFixed(1)+'" height="'+(Y(x.fl)-Y(x.fl+x.di)).toFixed(1)+'" rx="2" fill="#5aaef0"/>';
    s+='</g>';
    if(pd!=null) pts.push((pts.length?'L':'M')+(xx+(bw-3)/2).toFixed(1)+','+YP(pd).toFixed(1));
    if(i%3===0) s+='<text x="'+(xx+bw/2).toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="'+G_TXT+'" text-anchor="middle">'+hh2(h)+'h</text>';
  });
  if(pts.length>1) s+='<path d="'+pts.join(' ')+'" fill="none" stroke="#f2b23a" stroke-width="2" stroke-linejoin="round"/>';
  s+='<rect x="'+L+'" y="6" width="9" height="9" rx="2" fill="#a78bfa"/><text x="'+(L+14)+'" y="14.5" font-size="10" fill="'+G_TXT+'">inundación (a todos)</text>'+
     '<rect x="'+(L+128)+'" y="6" width="9" height="9" rx="2" fill="#5aaef0"/><text x="'+(L+142)+'" y="14.5" font-size="10" fill="'+G_TXT+'">directo</text>'+
     '<rect x="'+(L+192)+'" y="9" width="14" height="3" fill="#f2b23a"/><text x="'+(L+211)+'" y="14.5" font-size="10" fill="'+G_TXT+'">duplicados</text>';
  el.innerHTML=s;
}

// E · ocupación del aire: lo que oye y lo que emite el repetidor, en % del tiempo.
function pintarAire(hist){
  const el=$('#aireChart'); if(!el||oculto(el)) return;
  const H=210, W=svgTam(el,H), extra=$('#aireExtra');
  const ahoraS=Date.now()/1000, t0=ahoraS-24*3600;
  const pts=deltasRepetidor(hist).filter(d=>d.at>=t0&&d.rx!=null&&d.tx!=null&&d.up>0)
    .map(d=>({at:d.at,rx:100*d.rx/d.up,tx:100*d.tx/d.up}));
  if(pts.length<3){ svgVacio(el,W,H,'Aún sin medidas del repetidor en las últimas 24 h'); if(extra) extra.textContent=''; return; }
  const mRx=pts.reduce((a,p)=>a+p.rx,0)/pts.length, mTx=pts.reduce((a,p)=>a+p.tx,0)/pts.length;
  if(extra) extra.innerHTML='Media 24 h: oye <b>'+mRx.toFixed(1).replace('.',',')+' %</b> · emite <b style="color:'+(mTx<=10?'#3fd67a':'#ff6b6b')+'">'+mTx.toFixed(1).replace('.',',')+' %</b> (límite 10 %)';
  const L=36,R=10,T=26,B=26;
  const ymax=Math.max(12,Math.ceil(Math.max(...pts.map(p=>Math.max(p.rx,p.tx)))*1.15/5)*5);
  const X=at=>L+(W-L-R)*((at-t0)/(24*3600)), Y=v=>T+(H-T-B)*(1-v/ymax);
  let s='';
  const paso=ymax>40?10:5;
  for(let v=0;v<=ymax;v+=paso)
    s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+G_GRID+'"'+(v?' stroke-dasharray="3,4"':'')+'/>'+
       '<text x="'+(L-7)+'" y="'+(Y(v)+3.5).toFixed(1)+'" font-size="10" fill="'+G_DIM+'" text-anchor="end">'+v+' %</text>';
  s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(10).toFixed(1)+'" y2="'+Y(10).toFixed(1)+'" stroke="#f26b6b" stroke-opacity=".6" stroke-dasharray="4 4"/>'+
     '<text x="'+(W-R-2)+'" y="'+(Y(10)-4).toFixed(1)+'" font-size="9.5" fill="#f26b6b" text-anchor="end">límite legal de emisión · 10 %</text>';
  for(const tr of tramos(pts,5400)){
    if(tr.length>1){
      s+='<path d="M'+X(tr[0].at).toFixed(1)+','+Y(0).toFixed(1)+' '+tr.map(p=>'L'+X(p.at).toFixed(1)+','+Y(p.rx).toFixed(1)).join(' ')+' L'+X(tr[tr.length-1].at).toFixed(1)+','+Y(0).toFixed(1)+'Z" fill="#5aaef0" fill-opacity=".22"/>';
      s+='<path d="'+tr.map((p,i)=>(i?'L':'M')+X(p.at).toFixed(1)+','+Y(p.rx).toFixed(1)).join(' ')+'" fill="none" stroke="#5aaef0" stroke-width="1.6"/>';
      s+='<path d="'+tr.map((p,i)=>(i?'L':'M')+X(p.at).toFixed(1)+','+Y(p.tx).toFixed(1)).join(' ')+'" fill="none" stroke="#3fd67a" stroke-width="2"/>';
    }
  }
  for(const p of pts){
    const f=new Date(p.at*1000);
    s+='<circle cx="'+X(p.at).toFixed(1)+'" cy="'+Y(p.rx).toFixed(1)+'" r="6" fill="transparent"><title>'+hh2(f.getHours())+':'+hh2(f.getMinutes())+' · oye '+p.rx.toFixed(1).replace('.',',')+' % · emite '+p.tx.toFixed(1).replace('.',',')+' %</title></circle>';
  }
  const h0=new Date(t0*1000); h0.setMinutes(0,0,0);
  for(let k=1;k<=24;k++){
    const t=h0.getTime()/1000+k*3600, hr=new Date(t*1000).getHours();
    if(hr%3===0 && t>=t0 && t<=ahoraS) s+='<text x="'+X(t).toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="'+G_TXT+'" text-anchor="middle">'+hh2(hr)+'h</text>';
  }
  s+='<rect x="'+L+'" y="9" width="14" height="3" fill="#5aaef0"/><text x="'+(L+19)+'" y="14.5" font-size="10" fill="'+G_TXT+'">el aire ocupado (oír)</text>'+
     '<rect x="'+(L+140)+'" y="9" width="14" height="3" fill="#3fd67a"/><text x="'+(L+159)+'" y="14.5" font-size="10" fill="'+G_TXT+'">lo que emite tu repetidor</text>';
  el.innerHTML=s;
}

// C · ruido de fondo del repetidor, 7 días, con los picos marcados.
function pintarRuido(hist){
  const el=$('#ruidoChart'); if(!el||oculto(el)) return;
  const H=210, W=svgTam(el,H), extra=$('#ruidoExtra');
  const t1=Date.now()/1000;
  const {pts,base,picos}=detectarPicos(hist);
  if(pts.length<6){ svgVacio(el,W,H,'Aún sin medidas suficientes del repetidor'); if(extra) extra.textContent=''; return; }
  const top=picos.slice(0,3);
  if(extra) extra.innerHTML='Normal: <b>'+Math.round(base)+' dBm</b> · '+(picos.length?'<b style="color:#f26b6b">'+picos.length+(picos.length===1?' pico':' picos')+'</b> de interferencia':'sin picos de interferencia')+' en 7 días';
  const lo=Math.floor((Math.min(base-4,...pts.map(p=>p.v))-1)/5)*5, hi=Math.ceil((Math.max(base+8,...pts.map(p=>p.v))+1)/5)*5;
  const L=40,R=10,T=26,B=26;
  const tIni=pts[0].at, X=at=>L+(W-L-R)*((at-tIni)/((t1-tIni)||1)), Y=v=>T+(H-T-B)*(1-(v-lo)/(hi-lo));
  let s='';
  for(let v=Math.ceil(lo/5)*5;v<=hi;v+=5)
    s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+Y(v).toFixed(1)+'" y2="'+Y(v).toFixed(1)+'" stroke="'+G_GRID+'"'+(v?' stroke-dasharray="3,4"':'')+'/>'+
       '<text x="'+(L-7)+'" y="'+(Y(v)+3.5).toFixed(1)+'" font-size="10" fill="'+G_DIM+'" text-anchor="end">'+v+'</text>';
  s+='<rect x="'+L+'" y="'+Y(base+2).toFixed(1)+'" width="'+(W-L-R)+'" height="'+(Y(base-2)-Y(base+2)).toFixed(1)+'" fill="#3fd67a" fill-opacity=".08"/>'+
     '<text x="'+(L+4)+'" y="'+(Y(base+2)-3).toFixed(1)+'" font-size="9.5" fill="#3fd67a">zona normal</text>';
  for(const tr of tramos(pts,7200)){
    if(tr.length>1) s+='<path d="'+tr.map((p,i)=>(i?'L':'M')+X(p.at).toFixed(1)+','+Y(p.v).toFixed(1)).join(' ')+'" fill="none" stroke="#a78bfa" stroke-width="1.6" stroke-linejoin="round"/>';
    else s+='<circle cx="'+X(tr[0].at).toFixed(1)+'" cy="'+Y(tr[0].v).toFixed(1)+'" r="2" fill="#a78bfa"/>';
  }
  for(const p of pts){
    const f=new Date(p.at*1000);
    s+='<circle cx="'+X(p.at).toFixed(1)+'" cy="'+Y(p.v).toFixed(1)+'" r="5" fill="transparent"><title>'+DIAS_ES[f.getDay()]+' '+f.getDate()+'/'+(f.getMonth()+1)+' '+hh2(f.getHours())+':'+hh2(f.getMinutes())+' · '+p.v+' dBm</title></circle>';
  }
  for(const k of top){
    const f=new Date(k.at*1000);
    s+='<circle cx="'+X(k.at).toFixed(1)+'" cy="'+Y(k.v).toFixed(1)+'" r="3.6" fill="#f26b6b"/>'+
       pildora(X(k.at),Math.max(T-6,Y(k.v)-18),'+'+Math.round(k.v-base)+' dB · '+DIAS_ES[f.getDay()]+' '+hh2(f.getHours())+' h','#f26b6b',W);
  }
  // un rótulo por día, en mitad de su tramo
  const dia=new Date(tIni*1000); dia.setHours(0,0,0,0);
  for(let d=new Date(dia);d.getTime()/1000<t1;d.setDate(d.getDate()+1)){
    const a=Math.max(d.getTime()/1000,tIni), b2=Math.min(d.getTime()/1000+86400,t1);
    if(X(b2)-X(a)>26) s+='<text x="'+((X(a)+X(b2))/2).toFixed(1)+'" y="'+(H-8)+'" font-size="10.5" fill="'+G_TXT+'" text-anchor="middle">'+DIAS_ES[d.getDay()]+'</text>';
  }
  el.innerHTML=s;
}

// ---- Analítica por secciones y animaciones (1.31) ----
const oculto=el=>!el.getClientRects().length;
const SIN_MOVIMIENTO=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
// En qué secciones sale cada tarjeta de cifras, en el orden en que se pintan.
const KPI_G=['resumen trafico','trafico','resumen senal','senal','senal','resumen repetidor','resumen trafico','repetidor','repetidor'];
let statsCache=null, statsAnimaKpis=true;

// Picos de ruido de fondo en 7 días: grupos seguidos (menos de 1 h entre medidas) a +6 dB de lo normal.
function detectarPicos(hist){
  const t0=Date.now()/1000-7*86400;
  const pts=hist.filter(x=>x.at>=t0&&typeof x.noise_floor==='number'&&x.noise_floor>-150&&x.noise_floor<-50).map(x=>({at:x.at,v:x.noise_floor}));
  if(pts.length<6) return {pts,base:null,picos:[]};
  const base=mediana(pts.map(p=>p.v)), picos=[]; let cur=null;
  for(const p of pts){
    if(p.v-base>=6){
      if(cur&&p.at-cur.ult<=3600){ cur.ult=p.at; if(p.v>cur.v){ cur.v=p.v; cur.at=p.at; } }
      else{ cur={at:p.at,ult:p.at,v:p.v}; picos.push(cur); }
    }
  }
  picos.sort((a,b)=>b.v-a.v);
  return {pts,base,picos};
}

// Avisos de la sección Resumen: solo lo que merece mirarse.
function pintarAlertas(c){
  const el=$('#statsAlertas'); if(!el) return;
  const a=[], al=(cls,ico,t)=>a.push('<div class="alerta '+cls+'"><span aria-hidden="true">'+ico+'</span><span>'+esc(t)+'</span></div>');
  if(!c.muestras.length&&!c.hist.length) al('info','ⓘ','Sin datos todavía: cuando un WIO esté encendido esto se va llenando.');
  const {base,picos}=detectarPicos(c.hist);
  if(picos.length){
    const k=picos[0], f=new Date(k.at*1000);
    al('warn','⚠',(picos.length===1?'1 pico de ruido':picos.length+' picos de ruido')+' en 7 días; el más alto, +'+Math.round(k.v-base)+' dB el '+DIAS_ES[f.getDay()]+' a las '+hh2(f.getHours())+' h');
  }
  const duty=[...c.hist].reverse().find(x=>x.duty_cycle!=null);
  if(duty){
    if(duty.duty_cycle>10) al('warn','⚠','La emisión del repetidor pasa del 10 % legal ('+duty.duty_cycle.toFixed(1).replace('.',',')+' %)');
    else al('ok','✓','Emisión dentro del 10 % legal ('+duty.duty_cycle.toFixed(2).replace('.',',')+' %)');
  }
  const bat=[...c.hist].reverse().find(x=>x.bat_mv);
  if(bat&&bat.bat_mv<3800) al('warn','⚠','Batería del repetidor baja: '+(bat.bat_mv/1000).toFixed(2).replace('.',',')+' V');
  if(c.snr>=30&&c.pctDebil>=50) al('warn','⚠','El '+c.pctDebil+' % de los paquetes llega al límite (SNR por debajo de 0 dB)');
  const ult=c.hist.length?c.hist[c.hist.length-1].at:0;
  if(ult&&Date.now()/1000-ult>3*3600) al('warn','⚠','Última medida del repetidor '+humanAgo(ult*1000));
  if(!a.length) al('ok','✓','Todo en orden');
  el.innerHTML=a.join('');
}

// Las líneas se dibujan de izquierda a derecha (barras y áreas se animan por CSS).
function animarSvg(el){
  if(!el||oculto(el)||SIN_MOVIMIENTO()||$('#tab-stats').classList.contains('sinanim')) return;
  el.querySelectorAll('path[fill="none"][stroke]').forEach(p=>{
    try{
      const L=p.getTotalLength(); if(!(L>0)||L>20000) return;
      p.style.transition='none'; p.style.strokeDasharray=L; p.style.strokeDashoffset=L;
      p.getBoundingClientRect();
      p.style.transition='stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)'; p.style.strokeDashoffset=0;
      setTimeout(()=>{ p.style.strokeDasharray=''; p.style.strokeDashoffset=''; p.style.transition=''; },1000);
    }catch(e){}
  });
}

// Las cifras grandes suben hasta su valor (y acaban con el texto exacto de siempre).
function contarKpis(){
  if(SIN_MOVIMIENTO()) return;
  document.querySelectorAll('#statsKpis .kpiV').forEach(el=>{
    const t=el.textContent, m=t.match(/^([−-]?)(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(.*)$/);
    if(!m) return;
    const miles=/^\d{1,3}(\.\d{3})+$/.test(m[2]);
    const dec=miles?0:((m[2].split(/[.,]/)[1]||'').length), sep=/,/.test(m[2])?',':'.';
    const fin=miles?+m[2].replace(/\./g,''):parseFloat(m[2].replace(',','.'));
    if(!isFinite(fin)) return;
    const t0=performance.now(), D=650;
    const fmt=v=>m[1]+(miles?Math.round(v).toLocaleString('es-ES'):v.toFixed(dec).replace('.',sep))+m[3];
    const paso=now=>{
      const k=Math.min(1,(now-t0)/D), e=1-Math.pow(1-k,3);
      if(k<1){ el.textContent=fmt(fin*e); requestAnimationFrame(paso); } else el.textContent=t;
    };
    requestAnimationFrame(paso);
  });
}

// Secciones de Analítica: Resumen · Señal · Tráfico · Repetidor (se recuerda la última).
const STATS_SUBS=['resumen','senal','trafico','repetidor'];
function statsIr(g,foco){
  if(!STATS_SUBS.includes(g)) g='resumen';
  $('#tab-stats').dataset.sub=g;
  document.querySelectorAll('#statsTabs button').forEach(b=>{
    const on=b.dataset.sub===g;
    b.classList.toggle('on',on); b.setAttribute('aria-selected',on); b.tabIndex=on?0:-1;
    if(on&&foco) b.focus();
  });
  try{ localStorage.setItem('meshcore-stats-sub',g); }catch(e){}
}
function statsRedibuja(){
  for(const q of ['#statsKpis','#statsAlertas','#tab-stats .statsGrid']){
    const e=document.querySelector(q); if(e){ e.classList.remove('subIn'); void e.offsetWidth; e.classList.add('subIn'); }
  }
  renderStats(); dibujarHistoricoRak(); setTimeout(()=>animarSvg($('#repHistChart')),30);
}
document.querySelectorAll('#tab-stats .statcard').forEach(c=>{
  const s=c.querySelector('svg.statSvg'), t=c.querySelector('.statName'), h=c.querySelector('.statHint');
  if(s&&t){ s.setAttribute('role','img'); s.setAttribute('aria-label',t.textContent.trim()+(h?'. '+h.textContent.trim():'')); }
});
document.querySelectorAll('#statsTabs button').forEach(b=>{
  b.onclick=()=>{ statsIr(b.dataset.sub); statsRedibuja(); };
  b.onkeydown=e=>{
    const bs=[...document.querySelectorAll('#statsTabs button')], i=bs.indexOf(b);
    const j=e.key==='ArrowRight'?(i+1)%bs.length:e.key==='ArrowLeft'?(i+bs.length-1)%bs.length:e.key==='Home'?0:e.key==='End'?bs.length-1:null;
    if(j!=null){ e.preventDefault(); statsIr(bs[j].dataset.sub,true); statsRedibuja(); }
  };
});
(function(){ let g='resumen'; try{ g=localStorage.getItem('meshcore-stats-sub')||'resumen'; }catch(e){} statsIr(g); })();

// ===== Gestión (1.33): lo que cambia cosas, separado de lo que solo mira =====
const GEST_SUBS=['repetidor','equipos','acceso','datos'];
const TERMINAL_MAX_H=2;   // la terminal (nginx) solo deja pasar una sesión abierta hace menos de 2 h
const PREFS_UI=['meshcore-chat-visto','meshcore-devtab','meshcore-map-fondo','meshcore-stats-sub','meshcore-gestion-sub'];
let gSesion=null;

// Pregunta con nombre (en vez del confirm() del navegador): devuelve true si se acepta.
function preguntar(titulo,texto,si){
  return new Promise(res=>{
    let dlg=document.getElementById('dlgPregunta');
    if(!dlg){
      dlg=document.createElement('dialog'); dlg.id='dlgPregunta'; dlg.className='dlgBorrar'; dlg.setAttribute('aria-labelledby','dlgPreguntaT');
      dlg.innerHTML='<h3 id="dlgPreguntaT"></h3><p></p><div class="dlgBt"><button type="button" id="dlgPNo" autofocus>Cancelar</button><button type="button" id="dlgPSi" class="peligro"></button></div>';
      document.body.appendChild(dlg);
      dlg.addEventListener('click',e=>{ if(e.target===dlg) dlg.close('no'); });
    }
    dlg.querySelector('h3').textContent=titulo; dlg.querySelector('p').textContent=texto; dlg.querySelector('#dlgPSi').textContent=si;
    dlg.querySelector('#dlgPNo').onclick=()=>dlg.close('no'); dlg.querySelector('#dlgPSi').onclick=()=>dlg.close('si');
    dlg.onclose=()=>res(dlg.returnValue==='si');
    dlg.returnValue='no'; dlg.showModal();
  });
}

function gestionIr(g,foco){
  if(!GEST_SUBS.includes(g)) g='repetidor';
  $('#tab-gestion').dataset.sub=g;
  document.querySelectorAll('#gestionTabs button').forEach(b=>{
    const on=b.dataset.sub===g;
    b.classList.toggle('on',on); b.setAttribute('aria-selected',on); b.tabIndex=on?0:-1;
    if(on&&foco) b.focus();
  });
  try{ localStorage.setItem('meshcore-gestion-sub',g); }catch(e){}
}
function gestionAnima(){ const e=$('#gestionGrid'); e.classList.remove('subIn'); void e.offsetWidth; e.classList.add('subIn'); }
document.querySelectorAll('#gestionTabs button').forEach(b=>{
  b.onclick=()=>{ gestionIr(b.dataset.sub); gestionAnima(); gestionAlAbrir(); };
  b.onkeydown=e=>{
    const bs=[...document.querySelectorAll('#gestionTabs button')], i=bs.indexOf(b);
    const j=e.key==='ArrowRight'?(i+1)%bs.length:e.key==='ArrowLeft'?(i+bs.length-1)%bs.length:e.key==='Home'?0:e.key==='End'?bs.length-1:null;
    if(j!=null){ e.preventDefault(); gestionIr(bs[j].dataset.sub,true); gestionAnima(); gestionAlAbrir(); }
  };
});
(function(){ let g='repetidor'; try{ g=localStorage.getItem('meshcore-gestion-sub')||'repetidor'; }catch(e){} gestionIr(g); })();
document.querySelectorAll('[data-ir]').forEach(a=>a.addEventListener('click',e=>{ e.preventDefault(); showTab(a.dataset.ir); }));

// Respuestas del repetidor con su hora (lo mismo que sale en el Panel, pero aquí, donde se escribe).
function gLog(t){
  const c=$('#g-resp'); if(!c) return;
  c.querySelector('.vacio')?.remove();
  const f=new Date(), l=document.createElement('div'); l.className='l';
  l.innerHTML='<span class="t">'+hh2(f.getHours())+':'+hh2(f.getMinutes())+'</span><span class="r">'+esc(t)+'</span>';
  c.prepend(l);
  while(c.children.length>30) c.lastElementChild.remove();
}
function gestionRepetidorEstado(){
  const listo=!!rakRemotePubkey, c=$('#g-sesion-chip'), k=$('#g-consola-chip');
  if(!c||!k) return;
  c.className='gchip '+(listo?'ok':'off'); c.textContent=listo?'● Sesión abierta':'● Sin sesión';
  k.className='gchip '+(listo?'ok':'off'); k.textContent=listo?'Lista':'Se activa al abrir la sesión';
  $('#g-consola').classList.toggle('gdim',!listo);
}
new MutationObserver(()=>{
  const t=$('#rak-legal-out').textContent, c=$('#g-legal-chip');
  if(/✅ LEGAL/.test(t)){ c.className='gchip ok'; c.textContent='Todo en regla'; }
  else if(/❌ REVISAR/.test(t)){ c.className='gchip warn'; c.textContent='Revisar'; }
  else if(/❓/.test(t)){ c.className='gchip warn'; c.textContent='Sin veredicto'; }
  else { c.className='gchip off'; c.textContent='Sin comprobar'; }
}).observe($('#rak-legal-out'),{childList:true,characterData:true,subtree:true});

// Estado de los WIO y del relay, copiado de lo que ya calcula el Panel (una sola fuente).
function gestionSync(){
  [1,2].forEach(i=>{
    const p=$('#devpanel-w'+i), cb=$('#btn-w'+i+'-connect'), txt=(($('#w'+i+'-device-status')||{}).textContent||'').trim();
    const pausa=p.classList.contains('pausado'), online=p.classList.contains('online');
    let cls='warn', t='● Sin conectar';
    if(pausa){ cls='off'; t='○ En pausa'; }
    else if(online){ cls='ok'; t='● Conectado'; }
    else if(/^Enlazado/.test(txt)){ t='● Enlazado, no contesta'; }
    const chip=$('#g-w'+i+'-chip'); chip.className='gchip '+cls; chip.textContent=t;
    $('#g-w'+i+'-estado').textContent=pausa?'En pausa: lo marcaste como apagado y el PC no lo busca.':(txt||'Sin datos todavía.');
    const gb=$('#g-w'+i+'-conectar'); gb.textContent=cb.textContent; gb.disabled=cb.disabled||pausa; gb.classList.toggle('p',/Conectar/.test(cb.textContent));
    const pb=$('#btn-w'+i+'-pausa'), fila=pb.closest('.gfilak');
    if(fila){
      fila.hidden=pb.hidden;
      const enc=/encendido/.test(pb.textContent);
      fila.querySelector('.t').textContent=enc?'Lo he encendido':'Lo he apagado';
      fila.querySelector('.d').textContent=enc?'Vuelve a buscarlo ahora.':'El PC deja de buscarlo hasta que lo marques de nuevo.';
    }
  });
  const rel=(($('#status-relay')||{}).textContent||'—').trim(), rc=$('#g-relay-chip');
  $('#g-relay-txt').textContent=rel;
  const ok=/activo/i.test(rel);
  rc.className='gchip '+(ok?'ok':(rel==='—'?'off':'warn')); rc.textContent=ok?'● Conectado':(rel==='—'?'—':'● Sin enlace');
  gestionRepetidorEstado();
}
function gestionDatos(){
  const log=loadChatLog();
  $('#g-chat-n').textContent=log.length?log.length+(log.length===1?' mensaje guardado':' mensajes guardados'):'No hay mensajes guardados';
  const ats=log.map(e=>e.at).filter(Number.isFinite);
  $('#g-chat-viejo').textContent=ats.length?'El más antiguo: '+humanAgo(Math.min(...ats))+'.':'Cuando lleguen mensajes, se guardan aquí.';
  $('#g-chat-borrar').disabled=!log.length; $('#g-chat-descargar').disabled=!log.length;
  const todos=new Set(), conPos=new Set();
  [1,2].forEach(i=>{ const dt=loadNeighbors(i); ((dt&&dt.contacts)||[]).forEach(c=>{ const k=c.pubkey||c.name; todos.add(k); if(c.lat||c.lon) conPos.add(k); }); });
  $('#g-contactos-n').textContent=todos.size?todos.size+(todos.size===1?' contacto guardado':' contactos guardados')+' ('+conPos.size+' con posición)':'Aún no hay contactos guardados';
  $('#g-csv').disabled=!todos.size;
  const v=$('#g-version'); v.textContent='Versión '+PANEL_VERSION; v.className='gchip ok';
}
async function gestionAcceso(){
  const t=$('#g-sesion-txt'), chip=$('#g-ses-chip'), card=$('#g-terminal-card');
  gSesion=null;
  try{
    const r=await fetch('/api/auth/whoami',{cache:'no-store'}), j=await r.json();
    if(j&&j.ok&&j.abierta) gSesion=j;
  }catch(e){}
  if(gSesion){
    const f=new Date(gSesion.caduca*1000).toLocaleString('es-ES',{weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
    t.innerHTML='Entraste como <b>'+esc(gSesion.user)+'</b> '+humanAgo(gSesion.abierta*1000)+'. La sesión caduca el '+esc(f)+'.';
    chip.className='gchip ok'; chip.textContent='● Activa';
  }else{
    t.textContent='No se pudo comprobar la sesión (puede que estés usando el panel sin pasar por el acceso).';
    chip.className='gchip off'; chip.textContent='Sin datos';
  }
  // Terminal: solo si está configurada; y avisa si tu sesión es demasiado vieja para abrirla.
  if(typeof CFG!=='undefined' && CFG.terminalUrl){
    card.hidden=false; $('#g-terminal').href=CFG.terminalUrl;
    const tc=$('#g-term-chip'), tx=$('#g-term-txt');
    const edadH=gSesion?(Date.now()/1000-gSesion.abierta)/3600:null;
    if(edadH!=null && edadH>TERMINAL_MAX_H){
      tc.className='gchip warn'; tc.textContent='Vuelve a entrar';
      tx.textContent='Una consola con permisos de administrador. Pide haber entrado hace menos de '+TERMINAL_MAX_H+' horas y tu sesión es más vieja ('+humanAgo(gSesion.abierta*1000).replace('hace ','de hace ')+'): cierra sesión y vuelve a entrar para poder abrirla.';
    }else{
      tc.className='gchip ok'; tc.textContent='Puedes abrirla';
      tx.textContent='Una consola con permisos de administrador. Pide haber entrado hace menos de '+TERMINAL_MAX_H+' horas.';
    }
  }else card.hidden=true;
}
function gestionAlAbrir(){ gestionSync(); gestionDatos(); gestionAcceso(); }

[1,2].forEach(i=>{ $('#g-w'+i+'-conectar').onclick=()=>$('#btn-w'+i+'-connect').click(); });
$('#g-chat-descargar').onclick=()=>$('#chatDownload').click();
$('#g-chat-borrar').onclick=()=>abrirBorrado(true);
$('#g-csv').onclick=()=>$('#btn-export-contacts').click();
$('#g-recargar').onclick=()=>location.reload();
$('#g-logout').onclick=async()=>{
  const b=$('#g-logout'); b.disabled=true;
  try{ await fetch('/api/auth/logout',{method:'POST'}); }catch(e){}
  location.href='/login.html';
};
$('#g-olvidar').onclick=async()=>{
  if(!await preguntar('¿Olvidar tus preferencias?','Se olvidan la sección que tenías abierta, el fondo del mapa y la marca de «mensajes nuevos». No se borran el chat, las notas ni las posiciones. El panel se recargará.','Olvidar y recargar')) return;
  PREFS_UI.forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  location.reload();
};
setInterval(()=>{ if($('#tab-gestion').classList.contains('on')) gestionSync(); },1500);

// Historico del repetidor: dos paneles con el mismo eje de tiempo. Con las dos
// series en un solo panel y ejes a izquierda y derecha las curvas se montaban
// y no se sabia cual era cual.
let repHist=null;
async function pintarHistoricoRak(){
  const el=$('#repHistChart'); if(!el) return;
  const mi=++histRakSeq;
  let s=[];
  // uptime<3600: justo tras reiniciar el duty acumulado sale absurdo (pocos
  // segundos de base); se descarta aunque el backend ya lo filtre.
  try{ if(typeof rakHistory==='function') s=((await rakHistory(5000)).samples||[]).filter(x=>x.bat_mv && x.duty_cycle!=null && x.uptime>=3600); }
  catch(e){ $('#repHistInfo').textContent='No se pudo leer el histórico: '+e.message; }
  if(mi!==histRakSeq) return;
  repHist={s};
  dibujarHistoricoRak();
  if(s.length>=2){
    const bat=s.map(x=>x.bat_mv/1000), maxDuty=Math.max(...s.map(x=>x.duty_cycle));
    $('#repHistInfo').innerHTML='<b>'+s.length+'</b> medidas · batería '+Math.min(...bat).toFixed(2)+'–'+Math.max(...bat).toFixed(2)+
      ' V · emisión máxima <b style="color:'+(maxDuty<=10?'#3fd67a':'#ff6b6b')+'">'+maxDuty.toFixed(2)+' %</b> '+
      (maxDuty<=10?'(dentro del 10 % legal)':'(¡por encima del 10 % legal!)')+
      (Date.now()/1000-s[s.length-1].at>3600?' · <b style="color:#e0b04a">última medida '+humanAgo(s[s.length-1].at*1000)+'</b>':'');
  }
}
function dibujarHistoricoRak(){
  const el=$('#repHistChart'); if(!el || !repHist || oculto(el)) return;
  const s=repHist.s;
  const H=300, W=svgTam(el,H);
  if(s.length<2){ svgVacio(el,W,H,'Aún no hay suficientes medidas'); return; }
  const L=52,R=14,T=24,B=30,SEP=30;
  const util=H-T-B-SEP, hB=Math.round(util*0.55), hD=util-hB;
  const yB0=T, yD0=T+hB+SEP;
  // El eje llega hasta ahora: si no, con los WIO apagados la grafica acababa
  // hace dias y parecia al dia.
  const ultima=s[s.length-1].at, ahoraS=Date.now()/1000;
  const t0=s[0].at, t1=Math.max(ultima, ahoraS-ultima>3600 ? ahoraS : ultima);
  const X=at=>L+(W-L-R)*((at-t0)/((t1-t0)||1));
  const bat=s.map(x=>x.bat_mv/1000), duty=s.map(x=>x.duty_cycle);
  const bPaso=(Math.max(...bat)-Math.min(...bat))>0.3?0.1:0.05;
  const bLo=Math.floor((Math.min(...bat)-0.01)/bPaso)*bPaso, bHi=Math.ceil((Math.max(...bat)+0.01)/bPaso)*bPaso;
  const dMax=Math.max(...duty), dPaso=pasoBonito(Math.max(dMax,0.5)*1.15,2);
  const dHi=Math.max(dPaso,Math.ceil(dMax*1.15/dPaso)*dPaso);
  const YB=v=>yB0+hB*(1-(v-bLo)/((bHi-bLo)||1));
  const YD=v=>yD0+hD*(1-v/dHi);
  const f=v=>v.toFixed(1);
  // Tramos continuos: sin medidas durante mas de 1 h se corta la linea.
  const tramos=(vals,Yf)=>{
    const out=[]; let cur=[];
    s.forEach((x,i)=>{
      if(i && x.at-s[i-1].at>3600){ out.push(cur); cur=[]; }
      cur.push([X(x.at),Yf(vals[i])]);
    });
    out.push(cur);
    return out.filter(c=>c.length);
  };
  const camino=pts=>'M'+pts.map(p=>f(p[0])+','+f(p[1])).join('L');
  const serie=(vals,Yf,base,col,grad)=>tramos(vals,Yf).map(pts=>pts.length>1
    ? '<path d="'+camino(pts)+'L'+f(pts[pts.length-1][0])+','+f(base)+'L'+f(pts[0][0])+','+f(base)+'Z" fill="url(#'+grad+')"/>'+
      '<path d="'+camino(pts)+'" fill="none" stroke="'+col+'" stroke-width="1.8" stroke-linejoin="round"/>'
    : '<circle cx="'+f(pts[0][0])+'" cy="'+f(pts[0][1])+'" r="2.5" fill="'+col+'"/>').join('');
  const txt=(x,y,v,anchor,col,extra)=>'<text x="'+f(x)+'" y="'+f(y)+'" font-size="10.5" fill="'+(col||G_TXT)+'" text-anchor="'+anchor+'"'+(extra||'')+'>'+v+'</text>';
  let svg='<defs>'+
    '<linearGradient id="gBat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fd67a" stop-opacity=".28"/><stop offset="1" stop-color="#3fd67a" stop-opacity="0"/></linearGradient>'+
    '<linearGradient id="gDuty" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0b429" stop-opacity=".30"/><stop offset="1" stop-color="#f0b429" stop-opacity="0"/></linearGradient>'+
    '</defs>';
  // Rejilla de cada panel
  for(let v=bLo;v<=bHi+1e-9;v+=bPaso){
    svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+f(YB(v))+'" y2="'+f(YB(v))+'" stroke="'+G_GRID+'" stroke-dasharray="3,4"/>'+
         txt(L-8,YB(v)+3.5,v.toFixed(2)+' V','end','#6fcf97');
  }
  for(let v=0;v<=dHi+1e-9;v+=dPaso){
    svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+f(YD(v))+'" y2="'+f(YD(v))+'" stroke="'+G_GRID+'"'+(v?' stroke-dasharray="3,4"':'')+'/>'+
         txt(L-8,YD(v)+3.5,(+v.toFixed(2))+' %','end','#e0b04a');
  }
  if(dHi>=10) svg+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+f(YD(10))+'" y2="'+f(YD(10))+'" stroke="#ff6b6b" stroke-dasharray="6,4"/>'+
                   txt(W-R-4,YD(10)-4,'límite legal 10 %','end','#ff6b6b');
  // Marcas de tiempo: medianoches si hay varios dias, cada 6 h si no.
  const span=t1-t0, marcas=[];
  const d=new Date(t0*1000);
  if(span>36*3600){
    d.setHours(24,0,0,0);
    const dias=span/86400, saltoDias=Math.max(1,Math.ceil(dias/Math.max(1,Math.floor((W-L-R)/80))));
    for(;d.getTime()/1000<t1;d.setDate(d.getDate()+saltoDias))
      marcas.push([d.getTime()/1000,d.toLocaleDateString([], {weekday:'short',day:'numeric',month:'numeric'})]);
  }else{
    d.setMinutes(0,0,0); d.setHours(Math.ceil((d.getHours()+1)/6)*6);
    for(;d.getTime()/1000<t1;d.setHours(d.getHours()+6))
      marcas.push([d.getTime()/1000,String(d.getHours()).padStart(2,'0')+':00']);
  }
  for(const [at,et] of marcas){
    if(at<=t0) continue;
    const x=X(at);
    svg+='<line x1="'+f(x)+'" x2="'+f(x)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="'+G_GRID+'"/>'+txt(x,H-B+17,et,'middle');
  }
  // Huecos largos: se sombrean en los dos paneles, rotulados una sola vez.
  for(let i=1;i<s.length;i++){
    if(s[i].at-s[i-1].at<6*3600) continue;
    const x0=X(s[i-1].at)+2, x1=X(s[i].at)-2;
    if(x1-x0<8) continue;
    svg+='<rect x="'+f(x0)+'" y="'+T+'" width="'+f(x1-x0)+'" height="'+(H-T-B)+'" fill="url(#rayas)" opacity=".9"/>';
    if(x1-x0>62){
      const h=Math.round((s[i].at-s[i-1].at)/3600), t=(x1-x0>110?'sin datos · '+h+' h':h+' h'), tw=t.length*5.6+14, cx=(x0+x1)/2, cy=yB0+hB+SEP/2;
      svg+='<rect x="'+f(cx-tw/2)+'" y="'+f(cy-8)+'" width="'+f(tw)+'" height="17" rx="8.5" fill="#11161e" stroke="#f2b23a" stroke-opacity=".5"/>'
         + '<text x="'+f(cx)+'" y="'+f(cy+4)+'" text-anchor="middle" font-size="10.5" font-weight="600" fill="#f2b23a">'+t+'</text>';
    }
  }
  if(t1>ultima){
    const x0=X(ultima)+2, x1=W-R;
    if(x1-x0>4){
      svg+='<rect x="'+f(x0)+'" y="'+T+'" width="'+f(x1-x0)+'" height="'+(H-T-B)+'" fill="url(#rayas)" opacity=".9"/>';
      if(x1-x0>90) svg+=txt((x0+x1)/2,yB0+hB+SEP/2+4,'sin medidas desde '+humanAgo(ultima*1000),'middle','#e0b04a');
    }
  }
  svg='<defs><pattern id="rayas" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'+
      '<rect width="6" height="6" fill="#0c1118"/><line x1="0" y1="0" x2="0" y2="6" stroke="#161f2b" stroke-width="3"/></pattern></defs>'+svg;
  svg+=serie(bat,YB,yB0+hB,'#3fd67a','gBat');
  svg+=serie(duty,YD,yD0+hD,'#f0b429','gDuty');
  // Rotulos al final: si no, el rayado de un hueco los tapaba.
  const rotulo=(y,t,col)=>'<rect x="'+(L-2)+'" y="'+(y-12)+'" width="'+(t.length*6.6+10)+'" height="17" rx="4" fill="#0f151f" opacity=".85"/>'+
    txt(L+3,y,t,'start',col,' font-weight="700"');
  svg+=rotulo(T-7,'🔋 Batería','#3fd67a')+rotulo(yD0-8,'📡 Emisión (duty cycle)','#f0b429');
  svg+='<g id="repHover" style="pointer-events:none"></g>'+
       '<rect id="repHoverZona" x="'+L+'" y="'+T+'" width="'+(W-L-R)+'" height="'+(H-T-B)+'" fill="transparent"/>';
  el.innerHTML=svg;
  // Lectura al pasar el raton: punto mas cercano en el tiempo.
  const zona=el.querySelector('#repHoverZona'), capa=el.querySelector('#repHover');
  const mover=ev=>{
    const r=el.getBoundingClientRect();
    const x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left;
    const at=t0+(x-L)/((W-L-R)||1)*(t1-t0);
    let k=0, best=Infinity;
    for(let i=0;i<s.length;i++){ const dd=Math.abs(s[i].at-at); if(dd<best){ best=dd; k=i; } }
    if(at>ultima+1800){ capa.innerHTML=''; return; }
    const p=s[k], px=X(p.at);
    const cuando=new Date(p.at*1000).toLocaleString([], {weekday:'short',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit'});
    const l1=cuando, l2=(p.bat_mv/1000).toFixed(2)+' V · '+p.duty_cycle.toFixed(2)+' % emisión';
    const bw=Math.max(l1.length,l2.length)*6.4+18, bx=Math.min(Math.max(px+10,L),W-R-bw), by=T+4;
    capa.innerHTML='<line x1="'+f(px)+'" x2="'+f(px)+'" y1="'+T+'" y2="'+(H-B)+'" stroke="#e8eef4" stroke-opacity=".35"/>'+
      '<circle cx="'+f(px)+'" cy="'+f(YB(bat[k]))+'" r="4" fill="#3fd67a" stroke="#0b1017" stroke-width="2"/>'+
      '<circle cx="'+f(px)+'" cy="'+f(YD(duty[k]))+'" r="4" fill="#f0b429" stroke="#0b1017" stroke-width="2"/>'+
      '<rect x="'+f(bx)+'" y="'+by+'" width="'+f(bw)+'" height="40" rx="7" fill="#0b1017" stroke="#2a3748"/>'+
      txt(bx+9,by+16,esc(l1),'start','#c8d2e0',' font-weight="700"')+txt(bx+9,by+31,esc(l2),'start',G_TXT);
  };
  zona.addEventListener('mousemove',mover);
  zona.addEventListener('touchmove',mover,{passive:true});
  zona.addEventListener('mouseleave',()=>{ capa.innerHTML=''; });
}
// Redibujar al cambiar el ancho: las graficas se hacen a tamaño real.
let statsResizeT=null;
window.addEventListener('resize',()=>{
  if(!$('#tab-stats').classList.contains('on')) return;
  clearTimeout(statsResizeT);
  statsResizeT=setTimeout(()=>{ renderStats(false,true); dibujarHistoricoRak(); },180);
});
$('#btn-stats-refresh').onclick=()=>{ statsAnimaKpis=true; renderStats(true); pintarHistoricoRak(); };
$('#statsRange').onchange=()=>renderStats();
// Pantalla completa del chat: igual que la del mapa, Esc para salir.
$('#btn-chat-full').onclick=()=>{
  const c=$('#card-chat'); c.classList.toggle('chat-full');
  const on=c.classList.contains('chat-full');
  $('#btn-chat-full').textContent=on?'Cerrar':'Ampliar';
  $('#btn-chat-full').title=on?'Salir de pantalla completa (Esc)':'Pantalla completa (Esc para salir)';
  document.body.style.overflow=on?'hidden':'';
  const b=$('#chatBox'); b.scrollTop=b.scrollHeight;
  if(on) $('#chatInput').focus();
};
document.addEventListener('keydown',e=>{
  if(e.key==='Escape' && $('#card-chat').classList.contains('chat-full')) $('#btn-chat-full').click();
});
$('#chatInput').addEventListener('input',()=>{
  const n=$('#chatInput').value.length;
  $('#chatCount').textContent=n+'/130';
  $('#chatCount').classList.toggle('lleno',n>=120);
});

// Restaurar lo guardado antes de que llegue nada nuevo por Bluetooth.
(function restoreChatLog(){
  const log=loadChatLog();
  for(const e of log){
    chatAdd(e.cls,e.who,e.text,e.meta,false,null,e.kind||'out',e.at||null);
    if(e.dedupKey) seenMsgs.add(e.dedupKey);
  }
})();
function activeChatNode(){
  // Envía por el WIO elegido si está conectado; si no, por el que lo esté.
  const ok=i=>wNodes[i]&&wNodes[i].device&&wNodes[i].device.gatt.connected&&wNodes[i]._hydrated;
  const sel=+$('#chatNode').value;
  const idx=ok(sel)?sel:ok(2)?2:ok(1)?1:0;
  return idx?wNodes[idx]:null;
}
function refreshChatUI(){
  const n=activeChatNode();
  const inp=$('#chatInput');
  inp.disabled=!n;
  $('#chatSend').disabled=!n;
  if(!n) inp.placeholder='Sin WIO: no se puede enviar';
  else if(inp.placeholder.startsWith('Sin WIO')) inp.placeholder=convSel?'Privado a '+convSel+'…':'Escribe un mensaje...';
  $('#dot-chat').classList.toggle('on',!!n);
  updateListening();
}
$('#chatNode').onchange=refreshChatUI;

async function pullMessages(node){
  // pullAll (8 s) y refreshGateway (3 s) pueden coincidir: dos vaciados a la
  // vez se pisan las tramas de la cola y salen mensajes cortados o repetidos.
  if(node._pulling) return;
  node._pulling=true;
  let msgs=[];
  try{ msgs=await node.drainMessages(); }
  catch(e){ return; }
  finally{ node._pulling=false; }
  for(const m of msgs){
    const key=m.kind+'|'+m.ts+'|'+m.text;
    // El mismo mensaje largo llegado por dos caminos (segundos de diferencia) se cuenta una vez.
    if(String(m.text||'').length>=12){
      const ult=window._ultimoMsg||(window._ultimoMsg=new Map()), nk=m.kind+'|'+(m.from||'')+'|'+m.text;
      if(ult.has(nk) && Math.abs(m.ts-ult.get(nk))<=90) continue;
      ult.set(nk,m.ts);
    }
    if(seenMsgs.has(key)) continue;
    seenMsgs.add(key);
    const when=new Date(m.ts*1000).toLocaleString();
    const via=node.info?node.info.name:'nodo';
    const snr=(m.snr!=null)?(' · SNR '+m.snr+' dB'):'';
    const who = m.kind==='CHAN' ? 'Canal '+m.channel : nombreContacto(m.from);
    if(m.kind==='CHAN')
      chatAdd('in',who,m.text,when+snr+' · vía '+via,true,key,'chan'+m.channel,m.ts*1000);
    else
      { chatAdd('in',who,m.text,when+snr+' · vía '+via,true,key,'priv',m.ts*1000); pintarContactos(); }
    if(m.kind!=='CHAN') respuestaRepetidor(m);
    if(!$('#tab-chat').classList.contains('on')){ unreadChat++; updateChatBadge(); }
    notifyNewMessage(who,m.text);
  }
}

// ============ Notificaciones de escritorio ============
// El permiso hay que pedirlo tras un gesto del usuario (un click); lo pedimos
// en el primer click que se haga en la página, sin interrumpir con un botón aparte.
if('Notification' in window && Notification.permission==='default'){
  document.addEventListener('click',()=>{ Notification.requestPermission(); },{once:true});
}
function notifyNewMessage(who,text){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  // Si ya estás mirando el chat con la pestaña activa, no hace falta interrumpir.
  if(document.visibilityState==='visible' && $('#tab-chat').classList.contains('on')) return;
  try{ new Notification('MeshCore · '+who,{body:text,tag:'meshcore-chat'}); }catch(e){}
}

// Contactos que conocen los WIO (los guarda el escaneo de vecinos del Mapa).
function contactosChat(){
  const vistos=new Map();
  for(const i of [1,2]){
    const d=loadNeighbors(i);
    for(const c of ((d&&d.contacts)||[])) if(c.pubkey&&c.name&&c.advType!==2&&!vistos.has(c.pubkey)) vistos.set(c.pubkey,c);
  }
  return [...vistos.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function nombreContacto(prefijo){
  const c=contactosChat().find(x=>x.pubkey.startsWith(prefijo));
  return c?c.name:prefijo.slice(0,8);
}
function rellenarDestinos(){
  const sel=$('#chatChan'), actual=sel.value;
  sel.querySelector('optgroup')?.remove();
  const cs=contactosChat();
  if(!cs.length) return;
  const g=document.createElement('optgroup'); g.label='Privado a…';
  for(const c of cs){ const o=document.createElement('option'); o.value='p:'+c.pubkey.slice(0,12); o.textContent=c.name; g.appendChild(o); }
  sel.appendChild(g);
  if([...sel.options].some(o=>o.value===actual)) sel.value=actual;
}
$('#chatChan').addEventListener('focus',rellenarDestinos);
$('#chatChan').addEventListener('pointerdown',rellenarDestinos);
// Pulsar un mensaje privado recibido = contestarle en privado.
$('#chatBox').addEventListener('click',e=>{
  const b=e.target.closest('.msg.in.priv'); if(!b) return;
  const nombre=b.querySelector('.who b')?.textContent||'';
  const c=contactosChat().find(x=>x.name===nombre||x.pubkey.startsWith(nombre));
  if(!c){ chatAviso('No tengo a '+nombre+' en los contactos: escanea vecinos en el Mapa.'); return; }
  elegirDestino(c);
});
// Barra lateral del chat: canales arriba, conversaciones privadas debajo y el
// resto de contactos solo al buscar. Lo elegido filtra el chat y es el destino.
var convSel=null;            // nombre del contacto cuya conversación se ve
var canalSel='all';          // 'all' | '0' | '1' | '2' cuando no hay conversación
function ultimosPrivados(){
  const ultimo=new Map();
  for(const e of loadChatLog()){
    if(e.kind!=='priv') continue;
    const n=e.cls==='in'?e.who:((String(e.meta||'').match(/· a (.+)$/)||[])[1]);
    if(n&&(!ultimo.has(n)||(e.at||0)>=(ultimo.get(n).at||0))) ultimo.set(n,e);
  }
  return ultimo;
}
function pintarContactos(){
  etiquetaBorrar();
  const q=$('#ccBuscar').value.trim().toLowerCase();
  const ultimo=ultimosPrivados();
  const cs=contactosChat();
  const hora=at=>{ const d=new Date(at); return d.toDateString()===new Date().toDateString()?d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString([], {day:'numeric',month:'short'}); };
  const item=(attrs,on,titulo,sub,derecha)=>'<button class="ccItem'+(on?' on':'')+'" '+attrs+'><span class="ccTop"><b>'+esc(titulo)+'</b>'+(derecha?'<i>'+esc(derecha)+'</i>':'')+'</span>'+(sub?'<span>'+esc(sub)+'</span>':'')+'</button>';
  let h='';
  if(!q){
    h+='<div class="ccSec">Canales</div>';
    for(const [v,t] of [['all','Todo'],['0','Public'],['1','Canal 1'],['2','Canal 2']])
      h+=item('data-canal="'+v+'"',!convSel&&canalSel===v,t,v==='all'?'todos los mensajes':'',null);
    const convs=[...ultimo.entries()].sort((x,y)=>(y[1].at||0)-(x[1].at||0));
    h+='<div class="ccSec">Privados</div>';
    h+=convs.length?convs.map(([n,u])=>item('data-conv="'+esc(n)+'"',convSel===n,n,(u.cls==='out'?'Tú: ':'')+String(u.text).slice(0,42),u.at?hora(u.at):null)).join('')
      :'<div class="ccVacio">Sin privados. Busca un contacto para escribirle.</div>';
  }else{
    const m=cs.filter(c=>c.name.toLowerCase().includes(q));
    h+='<div class="ccSec">Contactos</div>';
    h+=m.length?m.map(c=>item('data-conv="'+esc(c.name)+'"',convSel===c.name,c.name,c.advType===3?'sala':'',null)).join('')
      :'<div class="ccVacio">Nadie con ese nombre'+(cs.length?'':' (escanea vecinos en el Mapa)')+'</div>';
  }
  $('#ccLista').innerHTML=h;
}
function filtrarChat(){ $('#chatBox').querySelectorAll('.msg').forEach(applyChatFilterTo); ocultarDiasVacios(); const b=$('#chatBox'); b.scrollTop=b.scrollHeight; }
function elegirCanal(v){
  convSel=null; canalSel=v;
  $('#chatFilter').value=v==='all'?'all':'chan'+v;
  $('#chatChan').value=v==='all'?'0':v;
  $('#chatInput').placeholder='Escribe un mensaje...';
  filtrarChat(); pintarContactos();
}
function elegirDestino(c){
  convSel=c.name;
  rellenarDestinos(); $('#chatChan').value='p:'+c.pubkey.slice(0,12);
  $('#chatInput').placeholder='Privado a '+c.name+'…'; $('#chatInput').focus();
  $('#ccBuscar').value='';
  filtrarChat(); pintarContactos();
}
$('#ccLista').addEventListener('click',e=>{
  const b=e.target.closest('.ccItem'); if(!b) return;
  if(b.dataset.canal) return elegirCanal(b.dataset.canal);
  const n=b.dataset.conv;
  const c=contactosChat().find(x=>x.name===n);
  if(c) return elegirDestino(c);
  // Conversación con alguien que ya no está en contactos: se puede leer, no contestar.
  convSel=n; filtrarChat(); pintarContactos();
  chatAdd('sys',null,'No tengo a '+n+' en los contactos: escanea vecinos en el Mapa para poder contestarle.','',false);
});
$('#ccBuscar').addEventListener('input',pintarContactos);

// Panel y mapa en uno (1.16): el mapa completo vive en el Panel, sus capas y
// herramientas pasan a la pestaña «Mapa» del panel izquierdo y se quita la
// pestaña Mapa de arriba. Se mueven los mismos nodos: sus manejadores siguen.
(function unirMapaAlPanel(){
  const panel=document.createElement('div'); panel.className='devPanel'; panel.id='devpanel-mapa';
  $('#devpanel-w2').after(panel);
  const sb=$('.mapSidebar');
  if(sb){ while(sb.firstChild) panel.appendChild(sb.firstChild); sb.remove(); }
  $('#mapHint')?.remove();
  $('#btn-map-fullscreen')?.remove();
  const btn=document.createElement('button'); btn.className='devTab'; btn.dataset.dev='mapa';
  btn.innerHTML='<span class="devTabIcon">🗺️</span><span class="devTabInfo"><span class="devTabName">Mapa</span><span class="devTabSub">capas, vecinos y enlaces</span></span>';
  $('.devSidebar').appendChild(btn);
  // Al cambiar de ficha cambia el alto del panel: el mapa debe recolocarse o
  // deja rectángulos negros (visto en el teléfono, 19/10).
  document.querySelector('.devSidebar').addEventListener('click',()=>setTimeout(()=>{ if(typeof map!=='undefined') map.invalidateSize(); },60));
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.devTab').forEach(x=>x.classList.toggle('on',x===btn));
    document.querySelectorAll('.devPanel').forEach(x=>x.classList.toggle('on',x===panel));
    try{ localStorage.setItem('meshcore-devtab','mapa'); }catch(e){}
  });
  try{ if(localStorage.getItem('meshcore-devtab')==='mapa') btn.click(); }catch(e){}
  // Orden (1.20): tres bloques en vez de seis secciones que se pisaban.
  const secc=[...panel.querySelectorAll('details')], de=t=>secc.find(d=>d.querySelector('summary')?.textContent.includes(t));
  const capas=de('Capas'), vec=de('Vecinos'), enl=de('Análisis'), alc=de('Alcance'), her=de('Herramientas'), est=de('Datos de la estación');
  const quick=panel.querySelector('.mapQuick');
  if(capas){ capas.querySelector('summary').textContent='Qué se ve en el mapa'; capas.open=false; }
  if(quick){ const vt=quick.querySelector('#btn-map-fit'); if(vt) vt.textContent='Encuadrar todo'; }
  if(vec){
    vec.querySelector('summary').textContent='Vecinos (lo que oyen tus WIO)';
    const w1=vec.querySelector('#btn-scan-w1-map'), w2=vec.querySelector('#btn-scan-w2-map');
    if(w1){
      // Un solo botón: escanea por el WIO que esté conectado (antes «vía WIO1» y «vía WIO2»).
      const uno=document.createElement('button'); uno.className='p'; uno.textContent='Actualizar vecinos'; uno.style.width='100%';
      uno.onclick=()=>{ const n=[1,2].find(i=>wNodes[i]&&wNodes[i].device&&wNodes[i].device.gatt.connected)||1; $('#btn-scan-w'+n+'-map')?.click(); };
      w1.before(uno); w1.hidden=true; if(w2) w2.hidden=true;
      const est=document.createElement('div'); est.id='vecEstado'; est.className='k'; est.style.margin='6px 0 2px';
      uno.after(est);
    }
    const csv=[...vec.querySelectorAll('button')].find(b=>b.textContent.includes('CSV'));
    if(csv) csv.textContent='Exportar a CSV';
    const ar=alc&&alc.querySelector('button');
    if(ar&&csv){ ar.textContent='Ver por regiones'; ar.className=csv.className; csv.after(ar); alc.remove(); }
  }
  if(enl){
    enl.querySelector('summary').textContent='Enlace con un nodo';
    const md=her&&her.querySelector('button'), tr=[...enl.querySelectorAll('button')].find(b=>b.textContent.includes('Traceroute'));
    if(md&&tr){ md.className=tr.className; tr.after(md); her.remove(); }
  }
  if(est){ est.open=false; est.classList.add('rakBox'); $('#devpanel-rak .devPanelBody')?.appendChild(est); }
  $('#tab-equipos').prepend($('#map'));
  $('#eqMap')?.remove(); $('.eqLeyenda')?.remove();
  document.querySelector('nav.tabs button[data-tab="mapa"]')?.remove();
})();

// Temperatura de la caja del repetidor (Home Assistant, opcional en el gateway).
window.cajaInfo=null;
async function pintarCaja(){
  let j=null;
  try{ j=window.cajaTemp ? await window.cajaTemp() : null; }catch(e){}
  const m=$('#rl-caja-m'); if(!m) return;
  const antes=JSON.stringify(window.cajaInfo);
  if(!j||!j.ok||j.temp==null||isNaN(+j.temp)){ m.hidden=true; window.cajaInfo=null; }
  else{
    window.cajaInfo=j; m.hidden=false;
    const t=+j.temp, usbOff=j.usb==='off';
    $('#rl-caja').textContent=t.toFixed(1).replace('.',',')+' °C'+(usbOff?' · USB cortado':'');
    $('#rl-caja').className='v '+(t>=45?'bad':(usbOff||t>=40)?'mid':'ok');
  }
  if(antes!==JSON.stringify(window.cajaInfo)) pintarEqMap();
}
setTimeout(pintarCaja,1500); setInterval(pintarCaja,60000);
// Web app: el service worker solo muestra «sin conexión» si el panel no responde (no guarda datos).
if('serviceWorker' in navigator && (location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
  navigator.serviceWorker.register('/sw.js').catch(()=>{});
}

// «Lo he apagado» / «lo he encendido»: el relay deja de buscar o vuelve a buscar ese WIO.
[1,2].forEach(i=>{
  const b=$('#btn-w'+i+'-pausa'); if(!b) return;
  b.onclick=async()=>{
    b.disabled=true;
    try{ await window.wioPausa(i,b.dataset.on==='1'); }
    catch(e){ const l=$('#w'+i+'-log'); if(l) l.textContent='No se pudo cambiar: '+e.message; }
    finally{ setTimeout(()=>{ b.disabled=false; },2000); }
  };
});

// (1.21) Hoja arrastrable en el teléfono, ayuda corta y Red y notas plegada.
(function(){
  // 1. Hoja del Panel en el teléfono: barra para arrastrar, se queda en 3 alturas
  const wrap=$('#tab-equipos .devWrap');
  if(wrap){
    const asa=document.createElement('div'); asa.className='sheetAsa'; asa.title='Arrastra o pulsa: más mapa o más panel';
    wrap.prepend(asa);
    const alturas=[.13,.28,.62,.86]; let i=2;  // mínima (solo fichas), baja, media, alta
    const poner=k=>{ i=Math.max(0,Math.min(alturas.length-1,k)); wrap.style.height=wrap.style.maxHeight=(alturas[i]*100)+'%'; setTimeout(()=>{ if(typeof map!=='undefined') map.invalidateSize(); },300); };
    let y0=null, hIni=0;
    asa.addEventListener('pointerdown',e=>{ if(innerWidth>860) return; y0=e.clientY; hIni=wrap.getBoundingClientRect().height; asa.setPointerCapture(e.pointerId); wrap.style.transition='none'; });
    asa.addEventListener('pointermove',e=>{ if(y0==null) return; const H=wrap.parentElement.getBoundingClientRect().height; const nh=Math.max(H*.12,Math.min(H*.86,hIni+(y0-e.clientY))); wrap.style.height=wrap.style.maxHeight=nh+'px'; });
    asa.addEventListener('pointerup',e=>{
      if(y0==null) return;
      const H=wrap.parentElement.getBoundingClientRect().height, fr=wrap.getBoundingClientRect().height/H, movido=Math.abs(e.clientY-y0)>6;
      wrap.style.transition=''; y0=null;
      if(!movido) return poner((i+1)%alturas.length);
      let mejor=0; alturas.forEach((a,k)=>{ if(Math.abs(a-fr)<Math.abs(alturas[mejor]-fr)) mejor=k; }); poner(mejor);
    });
  }
  // 2. «¿Qué significa cada dato?»: una línea por dato con su resumen; el detalle al pulsar
  document.querySelectorAll('#devpanel-rak dl').forEach(dl=>{
    dl.classList.add('ayudaCorta');
    dl.querySelectorAll('dt').forEach(dt=>{
      const dd=dt.nextElementSibling; if(!dd||dd.tagName!=='DD') return;
      const txt=dd.textContent.trim(), corte=txt.search(/[.;](\s|$)/);
      const res=document.createElement('span'); res.className='ayudaRes';
      res.textContent=corte>0&&corte<110?txt.slice(0,corte+1):txt.slice(0,100)+'…';
      dt.appendChild(res); dd.hidden=true; dt.tabIndex=0; dt.setAttribute('role','button');
      const t=()=>{ dd.hidden=!dd.hidden; dt.classList.toggle('abierto',!dd.hidden); res.hidden=!dd.hidden; };
      dt.addEventListener('click',t);
      dt.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); t(); } });
    });
  });
  // 3. Red y notas: cada apartado plegado (salvo el primero); el índice abre el suyo
  document.querySelectorAll('#tab-red .redContent .card').forEach((c,k)=>{
    const head=c.querySelector(':scope > .cardhead'); if(!head) return;
    const cuerpo=document.createElement('div'); cuerpo.className='redCuerpo';
    while(head.nextSibling) cuerpo.appendChild(head.nextSibling);
    c.appendChild(cuerpo); head.classList.add('redPliega'); head.tabIndex=0; head.setAttribute('role','button');
    const abrir=on=>{ cuerpo.hidden=!on; head.classList.toggle('abierto',on); };
    abrir(k===0);
    head.addEventListener('click',()=>abrir(cuerpo.hidden));
    head.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); abrir(cuerpo.hidden); } });
  });
  document.querySelectorAll('.red-nav').forEach(b=>b.addEventListener('click',()=>{
    const c=document.getElementById(b.dataset.target), h=c&&c.querySelector('.redPliega');
    if(h && c.querySelector('.redCuerpo').hidden) h.click();
  }));
})();

let avisoRak=null;
// «Actualizado hace X · N contactos» bajo «Actualizar vecinos» (ámbar si pasa de un día).
function pintarVecEstado(){
  const el=$('#vecEstado'); if(!el) return;
  let ts=0; const vistos=new Set();
  for(const i of [1,2]){ const d=loadNeighbors(i); if(d&&d.ts>ts) ts=d.ts; for(const c of ((d&&d.contacts)||[])) vistos.add(c.pubkey); }
  if(!ts){ el.textContent='Aún no se han escaneado los vecinos.'; el.style.color='var(--warn)'; return; }
  el.textContent='Actualizado '+humanAgo(ts)+' · '+vistos.size+' contactos';
  el.style.color=(Date.now()-ts>86400000)?'var(--warn)':'';
}
function pintarEqMap(){
  pintarVecEstado();
  if(typeof map==='undefined' || !$('#map').offsetParent) return;
  map.invalidateSize();
  const est=window.rakEstado, sinRak=!est||est.vieja;
  const usbOff=!!(window.cajaInfo&&window.cajaInfo.usb==='off');
  if(avisoRak){ map.removeLayer(avisoRak); avisoRak=null; }
  if(usbOff && !sinRak){
    avisoRak=L.marker(REPEATER_POS,{icon:mapPin('📡',38,'#2a2210','#f2b23a'),zIndexOffset:2000,interactive:false}).addTo(map)
      .bindTooltip(esc(REP_NOMBRE)+' · USB de la regleta cortado'+(window.cajaInfo.temp?' · caja '+(+window.cajaInfo.temp).toFixed(1).replace('.',',')+' °C':''),
        {permanent:true,direction:'right',className:'eqTag eqAviso',offset:[18,0]});
  }
  if(sinRak){
    avisoRak=L.marker(REPEATER_POS,{icon:mapPin('📡',38,'#2a2210','#f2b23a'),zIndexOffset:2000,interactive:false}).addTo(map)
      .bindTooltip(esc(REP_NOMBRE)+' · sin señal del repetidor'+(est&&est.at?' · '+esc(humanAgo(est.at*1000)):'')+(usbOff?' · USB cortado':''),
        {permanent:true,direction:'right',className:'eqTag eqAviso',offset:[18,0]});
  }
  if(!map._centradoPanel){
    // Encuadre inicial: tu zona (repetidor, WIO, vecinos a menos de 30 km).
    const pts=[REPEATER_POS];
    if(w1Marker) pts.push(w1Marker.getLatLng());
    if(w2Marker) pts.push(w2Marker.getLatLng());
    layerNeighbors.eachLayer(m=>{ if(m.getLatLng && distKm(REPEATER_POS,[m.getLatLng().lat,m.getLatLng().lng])<=30) pts.push(m.getLatLng()); });
    const ancho=window.innerWidth>860;
    map.fitBounds(L.latLngBounds(pts).pad(.2),ancho?{paddingTopLeft:[Math.round(436*(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--esc'))||1))+30,40],paddingBottomRight:[Math.round(340*(parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--esc'))||1))+30,60],maxZoom:13}:{paddingBottomRight:[0,Math.round(window.innerHeight*.45)],maxZoom:13});
    map._centradoPanel=true;
  }
}
window.addEventListener('resize',()=>{ if(typeof map!=='undefined') map.invalidateSize(); });
// Si la pastilla de arriba no cabe entre los paneles laterales (pantalla
// estrecha o zoom del navegador al 125 %), los paneles bajan debajo de ella.
function colocarPaneles(){
  const h=document.querySelector('header'); if(!h) return;
  // Escala: a 1550 px útiles o más, tamaño normal; por debajo, todo (pastilla,
  // panel izquierdo, estado, leyenda) se reduce hasta un 60 % para que la pastilla
  // quepa ENTRE los dos paneles y a su misma altura.
  const esc=innerWidth<=860?1:Math.max(.6,Math.min(1,innerWidth/1550));
  document.documentElement.style.setProperty('--esc',esc.toFixed(3));
  document.body.classList.remove('pastilla-choca');
  if(innerWidth<=860) return;
  const a=h.getBoundingClientRect(), choca=el=>{ if(!el||!el.offsetParent) return false; const b=el.getBoundingClientRect(); return !(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top); };
  if(choca($('#tab-equipos .devWrap'))||choca($('#tab-equipos .equiposWrap .grid'))) document.body.classList.add('pastilla-choca');
}
window.addEventListener('resize',colocarPaneles);
window.addEventListener('load',()=>setTimeout(colocarPaneles,400));
setTimeout(colocarPaneles,1500);
// Fin de la pantalla de carga: ya cargó todo, se colocó el diseño y el mapa tiene su tamaño.
function listoCarga(){ document.documentElement.classList.remove('cargando'); setTimeout(()=>{ document.getElementById('splash')?.remove(); },600); }
window.addEventListener('load',()=>setTimeout(()=>{ try{ colocarPaneles(); if(typeof map!=='undefined') map.invalidateSize(); pintarEqMap(); }catch(e){} listoCarga(); },700));
setTimeout(listoCarga,6000);   // por si algo tarda: nunca se queda tapado
window.addEventListener('load',()=>{ setTimeout(pintarEqMap,300); setTimeout(()=>{ if(typeof map!=='undefined') map.invalidateSize(); },1500); });
setInterval(pintarEqMap,60000);

// Chat: pulsar un mensaje sitúa en el mapa al nodo que lo envió.
$('#chatBox').addEventListener('scroll',actualizarAlFinal,{passive:true});
// Captura: se adelanta a los otros clics de la burbuja (mapa, elegir privado).
$('#chatBox').addEventListener('click',e=>{
  const bt=e.target.closest('.resp'); if(!bt) return;
  e.stopPropagation();
  const m=bt.closest('.msg'); const quien=m.dataset.quien||m.querySelector('.who b')?.textContent||'';
  if(m.dataset.kind==='priv'){
    const c=contactosChat().find(x=>x.name===quien);
    if(c) elegirDestino(c); else chatAviso('No tengo a '+quien+' en los contactos: escanea vecinos en el Mapa.');
    return;
  }
  const ch=String(m.dataset.kind).replace('chan','');
  if(convSel) elegirCanal(ch); else $('#chatChan').value=ch;
  const inp=$('#chatInput'), tag='@['+quien+'] ';
  if(!inp.value.startsWith(tag)) inp.value=(tag+inp.value).slice(0,130);
  inp.dispatchEvent(new Event('input'));
  if(!inp.disabled){ inp.focus(); inp.setSelectionRange(inp.value.length,inp.value.length); }
  else chatAviso('Mención preparada para '+quien+'. Se podrá enviar cuando un WIO conteste.');
},true);
$('#chatAlFinal').addEventListener('click',()=>{ const b=$('#chatBox'); b.scrollTo({top:b.scrollHeight,behavior:'smooth'}); });
$('#chatBox').addEventListener('click',e=>{
  const b=e.target.closest('.msg.in'); if(!b) return;
  const nombre=(b.querySelector('.who b')?.textContent||'').trim(); if(!nombre) return;
  let c=null;
  for(const i of [1,2]){ const d=loadNeighbors(i); c=c||((d&&d.contacts)||[]).find(x=>x.name===nombre&&(x.lat||x.lon)); }
  if(!c){ chatAviso(nombre+' no anuncia su posición: no se puede situar en el mapa.'); return; }
  const z=Math.max(map.getZoom(),12), ancho=window.innerWidth>860;
  const off=ancho?[Math.min(720,window.innerWidth-32)/2,0]:[0,Math.round(window.innerHeight*.33)];
  map.flyTo(map.unproject(map.project([c.lat,c.lon],z).add(off),z),z,{duration:.8});
  const saltos=c.hops==null?'sin ruta fija':c.hops===0?'directo':c.hops+(c.hops===1?' salto':' saltos');
  L.popup({className:'popChat',autoPan:false}).setLatLng([c.lat,c.lon])
    .setContent('<b>'+esc(nombre)+'</b><br>'+saltos+' · '+distKm(REPEATER_POS,[c.lat,c.lon]).toFixed(1)+' km de tu repetidor').openOn(map);
});
$('#chatChan').addEventListener('change',()=>{
  const v=$('#chatChan').value;
  if(v.startsWith('p:')){ const c=contactosChat().find(x=>x.pubkey.startsWith(v.slice(2))); if(c) elegirDestino(c); }
  else elegirCanal(v);
});
document.querySelector('[data-tab="chat"]').addEventListener('click',()=>{ rellenarDestinos(); pintarContactos(); });
rellenarDestinos(); pintarContactos();

$('#chatSend').onclick=async()=>{
  const n=activeChatNode();
  const txt=$('#chatInput').value.trim();
  if(!n||!txt) return;
  $('#chatSend').disabled=true;
  try{
    const dest=$('#chatChan').value;
    const meta=new Date().toLocaleTimeString()+' · enviado por '+(n.info?n.info.name:'nodo');
    if(dest.startsWith('p:')){
      const c=contactosChat().find(x=>x.pubkey.startsWith(dest.slice(2)));
      await n.sendTxtMsg(dest.slice(2),txt);
      chatAdd('out',null,txt,meta+' · a '+(c?c.name:dest.slice(2,10)),true,null,'priv'); pintarContactos();
    }else{
      await n.sendChannelMsg(+dest,txt);
      chatAdd('out',null,txt,meta,true,null,'chan'+dest);
    }
    $('#chatInput').value='';
    // El otro nodo tarda un poco en recibir por radio: sondear pronto y otra vez
    setTimeout(pullAll,1500);
    setTimeout(pullAll,5000);
  }catch(e){
    chatAdd('sys',null,'No se pudo enviar: '+e.message,'',false);
  }finally{ $('#chatSend').disabled=false; }
};
$('#chatInput').onkeydown=e=>{ if(e.key==='Enter') $('#chatSend').click(); };


// Exportar clave privada (EXPORT_PRIVATE_KEY = 0x17)
async function wioExportKey(idx){
  const n=wNodes[idx];
  if(!n||!n.device||!n.device.gatt.connected){ alert('WIO'+idx+' no conectado'); return; }
  try{
    const r=await n._send([0x17]);
    if(r.type!==14){ alert('Error: respuesta tipo '+r.type); return; }
    const key=r.bytes.slice(1);
    const hex=Array.from(key).map(x=>x.toString(16).padStart(2,'0')).join('');
    const fn='WIO'+idx+'_PRIVATE_KEY_'+new Date().toISOString().slice(0,10)+'.txt';
    const blob=new Blob([hex], {type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=fn;a.click();
    alert('Clave exportada a '+fn+'. Guárdala en sitio seguro para importar en ZephCore.');
  }catch(e){ alert('Error: '+e.message); }
}
// Barra de estado del enlace: antes solo se veia entrando en cada tarjeta.
// Ademas avisa si el puente se cae del todo (no solo si falla un comando
// suelto) y recuerda exportar la clave si nunca se hizo o hace >30 dias.
let statusBarLastRelay=null;
const BATERIA_BAJA=35;  // % (LiPo 1S: por debajo de ~3,6 V queda poco)
let rakResumen='', rakResumenColor='', rakVivo=false;
async function updateStatusBar(){
  const relayEl=$('#status-relay'), w1El=$('#status-w1'), w2El=$('#status-w2'), rakEl=$('#status-rak'), keyEl=$('#keyReminder');
  if(!relayEl || typeof getGatewaySnapshot!=='function') return;
  try{
    const s=await getGatewaySnapshot();
    if(s.relay){
      relayEl.textContent='activo · desde '+humanAgo(s.relay_since*1000);
      relayEl.style.color='var(--acc)';
    }else{
      relayEl.textContent='CAÍDO';
      relayEl.style.color='var(--err)';
      if(statusBarLastRelay===true) chatAdd('sys',null,'El puente BLE se ha desconectado del todo (no solo un comando).','',false);
    }
    statusBarLastRelay=s.relay;
    const wioDe=i=>(s.wios||[]).find(w=>w&&w.idx===i)||{};  // con un solo companion ya no van en orden
    const w1=wioDe(1), w2=wioDe(2);
    // Un companion que el relay no tiene configurado no se enseña (ni pestaña,
    // ni fila de estado, ni opciones): con uno solo, el panel no muestra errores falsos.
    if(s.relay) document.body.classList.toggle('sin-w2', !(s.wios||[]).some(w=>w&&w.idx===2));
    // Resumen de un WIO: conectado / no responde (motivo del relay) / visto hace X,
    // mas la bateria del ultimo estado guardado si esta baja.
    const resumenWio=(w,idx)=>{
      const st=loadNodeState(idx)||{};
      const bateria = st.batt!=null && st.batt<BATERIA_BAJA ? '🔋 '+st.batt+' %' : '';
      let txt, color;
      if(w.connected){ txt='conectado'; color='var(--acc)'; }
      else if(w.last_failure){ txt='no responde'; color='var(--warn)'; }
      else { txt = w.last_push_at ? 'visto '+humanAgo(w.last_push_at*1000) : 'desconectado'; color='var(--dim)'; }
      if(bateria){ txt+=' · '+bateria; if(!w.connected) color='var(--warn)'; }
      return {txt, color, bateria, motivo:w.last_failure||''};
    };
    const r1=resumenWio(w1,1), r2=resumenWio(w2,2);
    [[w1,r1],[w2,r2]].forEach(([w,rr])=>{ if(w.pausado){ rr.txt='en pausa'; rr.color='var(--dim)'; rr.motivo='Marcado como apagado: el relay no lo busca'; } });
    w1El.textContent=r1.txt; w1El.style.color=r1.color; w1El.title=r1.motivo;
    w2El.textContent=r2.txt; w2El.style.color=r2.color; w2El.title=r2.motivo;
    [[1,w1],[2,w2]].forEach(([i,w])=>{
      document.getElementById('devpanel-w'+i)?.classList.toggle('pausado',!!w.pausado);
      document.getElementById('devtabdot-w'+i)?.classList.toggle('pausa',!!w.pausado);
    });
    // El repetidor solo se mide por LoRa (no tiene Bluetooth): su estado sale del historico.
    rakEl.textContent = rakResumen || 'por LoRa · sin medidas aún';
    rakEl.style.color = rakResumenColor || 'var(--dim2)';

    // Mismo dato, reflejado en el punto de estado de cada pestana de Equipos.
    const marcaTab=(idx,online,ultimo,extra)=>{
      const dot=$('#devtabdot-'+idx), sub=$('#devtabsub-'+idx);
      if(!dot) return;
      dot.classList.toggle('on', !!online);
      if(sub && sub.dataset.base===undefined) sub.dataset.base=sub.textContent;
      if(sub) sub.textContent = (online ? sub.dataset.base+' · conectado'
        : (ultimo ? sub.dataset.base+' · visto '+humanAgo(ultimo*1000) : sub.dataset.base))
        + (extra ? ' · '+extra : '');
    };
    // Verde solo si además contesta (ready); con enlace pero sin respuesta, ámbar.
    const vivo=w=>w.connected && w.ready!==false;
    marcaTab('w1', vivo(w1), w1.last_push_at, vivo(w1) ? r1.bateria : (w1.connected ? 'enlazado, no contesta' : (r1.motivo ? 'no responde' : r1.bateria)));
    marcaTab('w2', vivo(w2), w2.last_push_at, vivo(w2) ? r2.bateria : (w2.connected ? 'enlazado, no contesta' : (r2.motivo ? 'no responde' : r2.bateria)));
    $('#devtabdot-w1')?.classList.toggle('warn', w1.connected && !vivo(w1));
    $('#devtabdot-w2')?.classList.toggle('warn', w2.connected && !vivo(w2));
    marcaTab('rak', rakVivo, null);
    $('#devtabdot-rak')?.classList.toggle('warn', !rakVivo && !!rakResumen);

    const now=Date.now(), THIRTY_D=30*86400000;
    const pending=[1,2].filter(idx=>{
      const wio=idx===1?w1:w2;
      if(!wio.connected) return false;
      const last=+(localStorage.getItem('meshcore-key-export-'+idx)||0);
      return !last || (now-last)>THIRTY_D;
    });
    if(pending.length){
      keyEl.style.display='none';  // exportar la clave está desactivado por defecto (1.4.1)
    }else keyEl.style.display='none';
  }catch(e){ relayEl.textContent='sin conexión al puente'; relayEl.style.color='var(--err)'; }
}
updateStatusBar();
window.addEventListener('load',updateStatusBar);

async function pintarRakVivo(){
  if(typeof rakHistory!=='function') return;
  try{
    // 48 h a 15 min son ~200 muestras: con eso sale la tendencia y la minigrafica.
    const h=await rakHistory(220);
    const todas=(h.samples||[]).filter(x=>x.bat_mv);
    const s=todas.slice(-1)[0];
    if(!s){
      $('#rl-note').textContent=h.last_error ? 'Sin medidas: '+h.last_error : 'Aún no hay medidas del repetidor.';
      return;
    }
    const horas=s.uptime/3600, duty=s.uptime>=3600 ? s.duty_cycle : null; // recien reiniciado: duty sin sentido
    // Li-ion de 1 celda: ~3,3 V vacia, ~4,2 V llena (orientativo).
    const v=s.bat_mv/1000, pctBat=Math.round(Math.max(0,Math.min(100,(v-3.3)/0.9*100)));
    const hace24=todas.reduce((a,x)=>Math.abs(x.at-(s.at-86400))<Math.abs(a.at-(s.at-86400))?x:a,todas[0]);
    const dV=(Math.abs(hace24.at-(s.at-86400))<3*3600) ? v-hace24.bat_mv/1000 : null;
    const tend = dV==null ? '' : Math.abs(dV)<0.02 ? ' <span class="tend">= 24 h</span>'
               : ' <span class="tend '+(dV>0?'sube':'baja')+'">'+(dV>0?'▲':'▼')+' '+Math.abs(dV).toFixed(2)+' V</span>';
    $('#rl-bat').innerHTML=v.toFixed(2)+' V <span class="pctBat">'+pctBat+' %</span>'+tend;
    $('#rl-bat').className='v '+(v<3.5?'bad':v<3.7?'mid':'ok');
    pintarSparkRak(todas.filter(x=>x.at>=s.at-48*3600), s.at);
    $('#rl-uptime').textContent= horas>48 ? (horas/24).toFixed(1)+' días' : horas.toFixed(1)+' h';
    $('#rl-duty').textContent= duty==null ? '—' : duty.toFixed(2)+' %';
    $('#rl-duty').className='v '+(duty==null?'':(duty>10?'bad':duty>5?'mid':'ok'));
    $('#rl-noise').textContent=s.noise_floor+' dBm';
    $('#rl-pkts').textContent=s.nb_recv.toLocaleString()+' / '+s.nb_sent.toLocaleString();
    $('#rl-when').textContent=humanAgo(s.at*1000);
    const vieja = Date.now()/1000 - s.at > 3600;
    const antes = window.rakEstado && window.rakEstado.vieja;
    window.rakEstado = {vieja, at:s.at, noise:s.noise_floor};
    if(antes!==vieja && typeof pintarEqMap==='function') pintarEqMap();
    $('#rl-when').className='v '+(vieja?'mid':'');
    // Con la medida vieja los valores se atenuan: un 90 % en verde de hace
    // tres dias parecia el estado de ahora.
    $('#rak-live').classList.toggle('viejo',vieja);
    // El punto de la cabecera decia gris con el lateral en verde: los dos
    // siguen ahora a la misma medida por LoRa.
    $('#dot-rak')?.classList.toggle('on',!vieja);
    $('#dot-rak')?.classList.toggle('warn',vieja);
    $('#rl-note').textContent = vieja
      ? 'Sin medidas nuevas desde '+humanAgo(s.at*1000).replace(/^hace /,'hace ')+': '+motivoSinMedidas(h.last_error)
      : 'Medido por radio desde la Raspberry cada '+Math.round((h.every_seconds||900)/60)+' min. Límite legal del duty cycle: 10 %.';
    $('#rl-note').classList.toggle('avisoViejo',vieja);
    rakResumen='por LoRa · '+(s.bat_mv/1000).toFixed(2)+' V · duty '+(duty==null?'—':duty.toFixed(1)+' %')+' · '+humanAgo(s.at*1000);
    rakResumenColor = vieja ? 'var(--warn)' : 'var(--acc)';
    rakVivo = !vieja;
    updateStatusBar();
  }catch(e){ $('#rl-note').textContent='No se pudo leer el histórico: '+e.message; }
}
// El gateway explica el fallo en texto tecnico y sin tildes: se traduce.
function motivoSinMedidas(err){
  err=String(err||'');
  if(/ningun WIO conectado/i.test(err)) return 'no hay ningún WIO encendido por el que preguntar al repetidor. Enciende uno y la Raspberry vuelve a medir sola.';
  if(/sin respuesta del repetidor/i.test(err)) return 'el repetidor no contesta por radio (¿fuera de alcance o apagado?).';
  if(/relay/i.test(err)) return 'el puente de Windows no está conectado.';
  return err ? 'último error: '+err : 'no hay ningún WIO encendido por el que preguntar al repetidor.';
}
function pintarSparkRak(ms,ultimaAt){
  const wrap=$('#rak-spark-wrap'), el=$('#rak-spark');
  if(!wrap || ms.length<1){ if(wrap) wrap.hidden=true; return; }
  wrap.hidden=false;
  // Eje de 48 h completo (acaba en ahora, o en la última medida si es vieja):
  // los huecos sin datos se ven como franjas ámbar en vez de una línea cortada.
  const vieja=ultimaAt && Date.now()/1000-ultimaAt>3600;
  const t1=vieja?ultimaAt:Date.now()/1000, t0=t1-48*3600, HUECO=3600;
  const W=Math.max(220,el.clientWidth||320), H=78, PX=8, TOP=8, BAJO=H-20;
  const vs=ms.map(x=>x.bat_mv/1000);
  let lo=Math.min(...vs), hi=Math.max(...vs);
  const span=Math.max(hi-lo,.1), mid=(hi+lo)/2; lo=mid-span/2; hi=mid+span/2;   // sin exagerar variaciones de centésimas
  const X=at=>PX+(W-2*PX)*((at-t0)/(t1-t0)), Y=v=>BAJO-(BAJO-TOP)*((v-lo)/(hi-lo));
  const huecos=[]; let ant=t0;
  ms.forEach(x=>{ if(x.at-ant>HUECO) huecos.push([ant,x.at]); ant=x.at; });
  if(t1-ant>HUECO) huecos.push([ant,t1]);
  // Hueco sin medidas: franja rayada tenue con una etiqueta que dice cuánto dura.
  let g='<defs><pattern id="rkHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#f2b23a" stroke-opacity=".30" stroke-width="1.4"/></pattern></defs>';
  huecos.forEach(([a,b])=>{
    const x0=X(Math.max(a,t0)), x1=X(Math.min(b,t1)), w=Math.max(1,x1-x0), horas=Math.round((Math.min(b,t1)-Math.max(a,t0))/3600);
    g+='<rect x="'+x0.toFixed(1)+'" y="'+TOP+'" width="'+w.toFixed(1)+'" height="'+(BAJO-TOP)+'" rx="3" fill="url(#rkHatch)" stroke="#f2b23a" stroke-opacity=".28" stroke-dasharray="3 3"/>';
    const txt=w>96?'sin datos · '+horas+' h':(w>40?horas+' h':'');
    if(txt){
      const tw=txt.length*5.6+14, cx=(x0+x1)/2, cy=(TOP+BAJO)/2;
      g+='<rect x="'+(cx-tw/2).toFixed(1)+'" y="'+(cy-9).toFixed(1)+'" width="'+tw.toFixed(1)+'" height="18" rx="9" fill="#11161e" stroke="#f2b23a" stroke-opacity=".55"/>'
       + '<text x="'+cx.toFixed(1)+'" y="'+(cy+3.6).toFixed(1)+'" text-anchor="middle" font-size="10.5" font-weight="500" fill="#f2b23a">'+txt+'</text>';
    }
  });
  let d='', prev=null;
  ms.forEach((x,i)=>{ d+=((!prev||x.at-prev.at>HUECO)?'M':'L')+X(x.at).toFixed(1)+','+Y(vs[i]).toFixed(1); prev=x; });
  g+='<path d="'+d+'" fill="none" stroke="#3fd67a" stroke-width="1.6" stroke-linejoin="round"/>';
  ms.forEach((x,i)=>{ g+='<circle cx="'+X(x.at).toFixed(1)+'" cy="'+Y(vs[i]).toFixed(1)+'" r="'+(i===ms.length-1?3.2:1.5)+'" fill="#3fd67a"/>'; });
  g+='<text x="'+PX+'" y="'+(H-4)+'" font-size="10.5" fill="#8d99a8">hace 48 h</text>'
   + '<text x="'+(W-PX)+'" y="'+(H-4)+'" font-size="10.5" fill="#8d99a8" text-anchor="end">'+(vieja?'última medida':'ahora')+'</text>'
   + '<text x="'+(W/2)+'" y="'+(H-4)+'" font-size="10.5" fill="#8d99a8" text-anchor="middle">hace 24 h</text>';
  el.setAttribute('viewBox','0 0 '+W+' '+H); el.setAttribute('preserveAspectRatio','xMidYMid meet');
  el.innerHTML=g;
  $('#rak-spark-rango').textContent=Math.min(...vs).toFixed(2)+'–'+Math.max(...vs).toFixed(2)+' V';
  $('#rak-spark-wrap .rakSparkHead span').textContent = vieja ? 'Batería · hasta la última medida' : 'Batería · últimas 48 h';
}
window.addEventListener('load',pintarRakVivo);
setInterval(pintarRakVivo,5*60*1000);
setInterval(updateStatusBar,10000);

// Sondeo periódico de TODOS los nodos conectados.
// (Antes solo miraba el del desplegable: si enviabas por WIO1, lo que llegaba
//  al WIO2 no se recogía nunca y parecía que el mensaje se perdía.)
function connectedNodes(){
  return [1,2].map(i=>wNodes[i]).filter(n=>n&&n.device&&n.device.gatt.connected&&n._hydrated);
}
async function pullAll(){
  for(const n of connectedNodes()) await pullMessages(n);
}
setInterval(pullAll,8000);

$('#chatPull').onclick=async()=>{
  const ns=connectedNodes();
  if(!ns.length){ chatAdd('sys',null,'Ningún WIO conectado al puente.',''); return; }
  chatAdd('sys',null,'Consultando cola de '+ns.map(n=>n.info?n.info.name:'nodo').join(' y ')+'...','');
  const antes=seenMsgs.size;
  await pullAll();
  if(seenMsgs.size===antes)
    chatAdd('sys',null,'Cola vacía. Si el mensaje llegó al nodo, puede que ya lo leyera la app del móvil: quien lee primero se lleva los mensajes.','');
};

// Refleja en la nota qué nodos están escuchando de verdad
function updateListening(){
  const ns=connectedNodes();
  const note=$('#chatNote');
  if(!ns.length){
    const mudo=[1,2].find(i=>wNodes[i]&&wNodes[i].device&&wNodes[i].device.gatt.connected);
    note.textContent = mudo
      ? 'WIO'+mudo+' está enlazado pero no contesta. Apágalo y enciéndelo; si tienes la app MeshCore del móvil conectada a él, ciérrala.'
      : 'Ningún WIO contesta ahora mismo. El PC lo sigue buscando solo; si está encendido y no vuelve en unos minutos, apágalo y enciéndelo.';
    return;
  }
  note.textContent='Escuchando en: '+ns.map(n=>n.info?n.info.name:'nodo').join(', ')+
                   ' · máx. 130 caracteres · se envía por el nodo del desplegable';
}
setInterval(updateListening,3000);

// Botones que antes llevaban onclick en el HTML: la CSP no deja código inline.
document.querySelectorAll('[data-wio-clave]').forEach(b=>b.addEventListener('click',()=>wioExportKey(+b.dataset.wioClave)));
document.querySelectorAll('[data-recargar]').forEach(b=>b.addEventListener('click',()=>location.reload()));
