/* Panel MeshCore browser adapter.
 * The page talks to /api/ble on the Pi; BLE never runs in the browser.
 * Safe to inject after dashboard.html: it replaces only the WIO transport
 * functions and leaves the existing UI/protocol parsing in place.
 */
(() => {
  'use strict';
  if (window.__MESHCORE_GATEWAY_PATCH__) return;
  window.__MESHCORE_GATEWAY_PATCH__ = true;

  const API = '/api/ble';
  const nodes = Object.create(null);
  let gatewayOnline = false;

  async function api(path, opts = {}) {
    const r = await fetch(API + path, {
      cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(opts.headers || {})},
      ...opts
    });
    const text = await r.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (_) {}
    if (!r.ok) throw new Error((body && (body.detail || body.error || body.message)) || text || ('HTTP ' + r.status));
    return body;
  }

  class GatewayNode {
    constructor(idx, status) {
      this.idx = idx;
      this.base = '/wio/' + idx;
      this.status = status || {};
      this.info = {};
      this.onMessagesWaiting = null;
      this.device = {
        id: this.status.device_id || ('gateway-' + idx),
        name: this.status.name || ('WIO' + idx),
        gatt: {
          connected: !!this.status.connected,
          disconnect: async () => { await this.disconnect(); }
        }
      };
    }
    get connected() { return !!this.device.gatt.connected; }
    async connect() {
      const st = await api(`${this.base}/connect`, {method:'POST', body:'{}'});
      this.status = st || this.status;
      this.device.name = this.status.name || this.device.name;
      this.device.id = this.status.device_id || this.device.id;
      this.device.gatt.connected = true;
      this._manualOff = false;
      syncLegacyNode(this.idx, this);
      return this;
    }
    async disconnect() {
      // The gateway intentionally keeps BLE alive across browser reloads.
      // A UI disconnect only detaches this browser-side handle.
      this.device.gatt.connected = false;
      // Sin esta marca, el siguiente /status (3 s) volvia a poner connected=true
      // y el "Desconectar" de la UI se deshacia solo. connect() la borra.
      this._manualOff = true;
      syncLegacyNode(this.idx, this);
      if (typeof setWConnectedUI === 'function') setWConnectedUI(this.idx, false);
      if (typeof refreshChatUI === 'function') refreshChatUI();
    }
    async _send(frame) {
      const out = await api(`${this.base}/command`, {
        method:'POST', body:JSON.stringify({frame:b64(frame)})
      });
      this.status = out || this.status;
      this.device.gatt.connected = !!out.connected;
      syncLegacyNode(this.idx, this);
      return u8(unb64(out.frame || ''));
    }
    async appStart() {
      const r = await this._send([0x01,0x03,0x20,0x20,0x20,0x20,0x20,0x20,0x6d,0x63,0x63,0x6c,0x69]);
      if (!r.length || r[0] !== 0x05) throw new Error('handshake rechazado (resp '+(r[0] ?? '?')+')');
      this.info = parseSelfInfo(r);
      syncLegacyNode(this.idx, this);
      return this.info;
    }
    async battery() {
      const r = await this._send([0x14]);
      if (!r.length || r[0] !== 0x0c) throw new Error('resp batería inesperada');
      return r[1] | (r[2] << 8);
    }
    async sendChannelMsg(chan, text) {
      const ts = Math.floor(Date.now()/1000);
      const f = [0x03,0x00,chan,ts&255,(ts>>8)&255,(ts>>16)&255,(ts>>24)&255];
      for (const b of new TextEncoder().encode(text)) f.push(b);
      const r = await this._send(f);
      if (r[0] === 1) throw new Error('el nodo rechazó el envío');
      return true;
    }
    // Mensaje privado: SEND_TXT_MSG (2), texto normal (0), intento 0, ts, 6 bytes del destino.
    async sendTxtMsg(prefixHex, text) {
      const ts = Math.floor(Date.now()/1000);
      const f = [0x02,0x00,0x00,ts&255,(ts>>8)&255,(ts>>16)&255,(ts>>24)&255];
      for (let i=0;i<12;i+=2) f.push(parseInt(prefixHex.slice(i,i+2),16));
      for (const b of new TextEncoder().encode(text)) f.push(b);
      const r = await this._send(f);
      if (r[0] === 1) throw new Error('el nodo rechazó el envío');
      return true;
    }
    async drainMessages(max=25) {
      const out=[];
      for(let i=0;i<max;i++){
        const r=await this._send([0x0a]);
        if(r[0]===0x0a) break;
        const m=parseMessage(r);
        if(m) out.push(m); else break;
      }
      return out;
    }
    // GET_CONTACTS (0x04) contesta con varias tramas (START/CONTACT.../END) en
    // vez de una sola respuesta. El endpoint /contacts del gateway ya las
    // junta todas; aqui solo se descartan START/END y se parsean las de tipo 3.
    async getContacts() {
      const out = await api(`${this.base}/contacts`, {method:'POST', body:'{}'});
      const contacts = [];
      for (const f of (out.frames || [])) {
        const b = u8(unb64(f));
        if (b.length && b[0] === 3) contacts.push(parseContact(b));
      }
      return contacts;
    }
  }

  function b64(bytes){return btoa(String.fromCharCode(...u8(bytes)));}
  function unb64(s){const raw=atob(s);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
  function u8(a){return a instanceof Uint8Array?a:new Uint8Array(a);}
  function dv(a){return new DataView(a.buffer,a.byteOffset,a.byteLength);}
  function parseSelfInfo(b){
    const d=dv(b);
    return {adv_type:b[1],tx_power:b[2],max_tx_power:b[3],public_key:Array.from(b.slice(4,36)).map(x=>x.toString(16).padStart(2,'0')).join(''),lat:d.getInt32(36,true)/1e6,lon:d.getInt32(40,true)/1e6,freq:d.getUint32(48,true)/1000,bw:d.getUint32(52,true)/1000,sf:b[56],cr:b[57],name:new TextDecoder().decode(b.slice(58)).replace(/\0+$/,'')};
  }
  function parseContact(b){
    const d=dv(b);
    const plen=b[35];
    // 255 = ruta flood/directa, sin nº de saltos fijo conocido; si no, son los 6 bits bajos.
    const hops = plen===255 ? null : (plen & 0x3F);
    return {
      pubkey: Array.from(b.slice(1,33)).map(x=>x.toString(16).padStart(2,'0')).join(''),
      advType: b[33],
      hops,
      name: new TextDecoder().decode(b.slice(100,132)).replace(/\0+$/,''),
      lastAdvert: d.getUint32(132,true),
      lat: d.getInt32(136,true)/1e6,
      lon: d.getInt32(140,true)/1e6
    };
  }
  function parseMessage(b){
    const d=dv(b);
    if(b[0]===17) return {kind:'CHAN',snr:new Int8Array([b[1]])[0]/4,channel:b[4],txtType:b[6],ts:d.getUint32(7,true),text:new TextDecoder().decode(b.slice(11))};
    if(b[0]===8) return {kind:'CHAN',snr:null,channel:b[1],txtType:b[3],ts:d.getUint32(4,true),text:new TextDecoder().decode(b.slice(8)).replace(/\0+$/,'')};
    if(b[0]===16) {const txtType=b[11],off=txtType===2?20:16;return {kind:'PRIV',snr:new Int8Array([b[1]])[0]/4,from:Array.from(b.slice(4,10)).map(x=>x.toString(16).padStart(2,'0')).join(''),txtType,ts:d.getUint32(12,true),text:new TextDecoder().decode(b.slice(off))};}
    if(b[0]===7) {const txtType=b[8],off=txtType===2?17:13;return {kind:'PRIV',snr:null,from:Array.from(b.slice(1,7)).map(x=>x.toString(16).padStart(2,'0')).join(''),txtType,ts:d.getUint32(9,true),text:new TextDecoder().decode(b.slice(off)).replace(/\0+$/,'')};}
    return null;
  }
  function hexOf(b){return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join('');}
  function pct(mv){return Math.round(Math.max(0,Math.min(100,(mv-3300)/900*100)));}

  function syncLegacyNode(idx, node){
    nodes[idx] = node;
    // dashboard.html declares "const wNodes" at top level: that never attaches
    // to window (unlike var/function), so "typeof window.wNodes" was always
    // undefined and this sync silently never ran. wNodes stayed {1:null,2:null}
    // forever, which is why scanNeighbors() always said "no conectado" even
    // with the WIO live — it's the one caller that reads wNodes directly
    // instead of going through a window.* override. Classic scripts share one
    // global scope, so the bare identifier reaches it; window.* does not.
    if (typeof wNodes !== 'undefined') wNodes[idx] = node;
  }

  function putNode(idx,status,connectedOverride){
    const st=status||{};
    const connected=connectedOverride!=null?connectedOverride:!!st.connected;
    if(!nodes[idx]) nodes[idx]=new GatewayNode(idx,st);
    nodes[idx].status=st;
    nodes[idx].device.name=st.name||nodes[idx].device.name;
    nodes[idx].device.id=st.device_id||nodes[idx].device.id;
    // Desconectado a mano desde la UI: manda sobre lo que diga el gateway.
    nodes[idx].device.gatt.connected=nodes[idx]._manualOff?false:connected;
    syncLegacyNode(idx,nodes[idx]);
    return nodes[idx];
  }

  let refrescando=false;
  async function refreshGateway(){
    if(refrescando) return;
    refrescando=true;
    try{ await refreshGatewayUnaVez(); } finally { refrescando=false; }
  }
  async function refreshGatewayUnaVez(){
    try{
      const s=await api('/status');
      gatewayOnline=true;
      for(const idx of [1,2]){
        const st=(s.wios||[]).find(w=>w&&w.idx===idx);  // con un solo companion ya no van en orden
        const n=putNode(idx,st);
        // El badge #w{idx}-device-status es del selector Bluetooth del navegador
        // (heredado de antes del puente). Con el puente, la unica fuente de
        // verdad de si el WIO esta enlazado es este /status: lo pisamos aqui
        // para que no se quede colgado en "No detectado".
        if(typeof setWDeviceStatus==='function') {
          const motivo=st&&(st.last_failure||st.error);
          if(st&&st.pausado) setWDeviceStatus(idx,'En pausa: no se busca (lo marcaste como apagado)');
          else setWDeviceStatus(idx, st&&st.connected ? 'Conectado por el PC' : (!st ? 'No configurado en el relay' : 'Sin conectar'+(motivo?': '+motivo:'')), !!(st&&st.connected));
          const bp=document.querySelector('#btn-w'+idx+'-pausa');
          if(bp&&st){ bp.hidden=false; bp.textContent=st.pausado?'Lo he encendido: búscalo':'Lo he apagado: deja de buscarlo'; bp.dataset.on=st.pausado?'0':'1'; }
        }
        if(st && st.connected && !n._manualOff && (!n.info || !n.info.name || !nodes[idx]._hydrated)){
          try{
            const info=await n.appStart();
            n.info=info; nodes[idx]._hydrated=true; n._lastPushSeq=st.push_seq;
            const mv=await n.battery();
            if(typeof setWConnectedUI==='function') setWConnectedUI(idx,true);
            // Reemplaza el log en vez de anadir: si no, el aviso de "estado
            // conocido de hace X" escrito al cargar la pagina se queda debajo
            // del aviso de conexion en vivo y contradice lo que se ve arriba.
            const logEl=$('#w'+idx+'-log');
            if(logEl) logEl.textContent='Puente BLE: '+info.name+' · '+info.freq.toFixed(4)+' MHz';
            if(document.querySelector('#w'+idx+'-name')){
              $('#w'+idx+'-seen').textContent=new Date().toLocaleTimeString();
              $('#w'+idx+'-freq').textContent=info.freq.toFixed(4)+' MHz';
              $('#w'+idx+'-radio').textContent=info.bw+' / SF'+info.sf+' / CR'+info.cr;
              $('#w'+idx+'-name').textContent=info.name||'(sin nombre)';
              $('#w'+idx+'-tx').textContent=info.tx_power+' dBm';
              $('#w'+idx+'-batt').textContent=pct(mv)+'% ('+(mv/1000).toFixed(2)+'V)';
              if(typeof setBattBar==='function') setBattBar(idx,pct(mv));
            }
            // Antes solo se guardaba al pulsar «Conectar»: al recargar volvía el
            // «último estado conocido (hace 29 días)» aunque el WIO estuviera vivo.
            if(typeof saveNodeState==='function') saveNodeState(idx,{name:info.name,freq:info.freq,bw:info.bw,sf:info.sf,cr:info.cr,tx:info.tx_power});
            document.querySelector('#devpanel-w'+idx)?.classList.remove('stale');
            n._batAt=0;   // fuerza leer la batería en esta misma vuelta
            // El conectar "a mano" (connectWisblock) siempre enganchaba esto;
            // el auto-hidratado de aqui nunca lo hacia, asi que el chat se
            // quedaba mudo en cuanto el enlace pasaba a depender del puente.
            n.onMessagesWaiting=()=>pullMessages(n);
            if(typeof pullMessages==='function') await pullMessages(n);
          }catch(e){
            // Enlazado por Bluetooth no es lo mismo que contestar: sin esto se
            // veía «Conectado por el PC» en verde con los datos de hace semanas.
            if(typeof setWDeviceStatus==='function') setWDeviceStatus(idx,'Enlazado, pero no contesta (reintentando)',false);
            const logEl=$('#w'+idx+'-log');
            if(logEl) logEl.textContent='El PC ve el WIO por Bluetooth pero no contesta a los comandos ('+e.message+'). Se reintenta solo cada pocos segundos; si sigue así, apágalo y enciéndelo.';
          }
        }
        if(st && st.connected && !n._manualOff && n._hydrated && Date.now()-(n._batAt||0)>(n._batOk?120000:Math.min(120000,15000*Math.pow(2,n._batFallos||0)))){
          n._batAt=Date.now();
          try{
            const mv=await n.battery();
            n._batOk=true; n._batFallos=0;
            $('#w'+idx+'-batt').textContent=pct(mv)+'% ('+(mv/1000).toFixed(2)+'V)';
            if(typeof setBattBar==='function') setBattBar(idx,pct(mv));
            if(typeof saveNodeState==='function') saveNodeState(idx,{batt:pct(mv),mv});
          }catch(e){
            n._batOk=false; n._batFallos=(n._batFallos||0)+1;
            const b=$('#w'+idx+'-batt'); if(b) b.textContent=b.textContent.replace(/ ?\(sin leer ahora\)$/,'')+' (sin leer ahora)';
          }
        }
        // Un mensaje nuevo llega al relay de Windows y sube push_seq en el
        // gateway, pero eso no empuja nada al navegador: solo lo sabemos al
        // sondear /status. Si el contador subio desde la ultima vez, hay cola
        // que vaciar aunque no sea la primera hidratacion.
        if(st && st.connected && !n._manualOff && n._hydrated && typeof st.push_seq==='number' && st.push_seq!==n._lastPushSeq){
          n._lastPushSeq=st.push_seq;
          if(typeof pullMessages==='function') await pullMessages(n);
        }
        if(!st || !st.connected){
          setWConnectedUI(idx,false);
          // Al volver el enlace hay que repetir APP_START: sin el, el nodo no
          // manda avisos de mensajes y el chat queda mudo hasta recargar.
          n._hydrated=false;
        }
      }

      if(typeof refreshChatUI==='function') refreshChatUI();
    }catch(e){
      gatewayOnline=false;
      for(const idx of [1,2]){
        setWConnectedUI(idx,false);
        if(typeof setWDeviceStatus==='function') setWDeviceStatus(idx,'Puente no disponible');
        const el=$('#w'+idx+'-log'); if(el) el.textContent='Puente BLE no disponible: '+e.message;
      }
    }
  }

  window.connectWisblock = async function(idx){
    const btn=$('#btn-w'+idx+'-connect');
    const logEl=$('#w'+idx+'-log');
    try{
      if(nodes[idx] && nodes[idx].device.gatt.connected){
        await nodes[idx].disconnect();
        return;
      }
      btn.disabled=true;
      logEl.textContent='Conectando WIO'+idx+' mediante el puente de la Raspberry...';
      const n=putNode(idx,{connected:false});
      await n.connect();
      const info=await n.appStart(); n.info=info; n._hydrated=true;
      setWConnectedUI(idx,true);
      $('#w'+idx+'-seen').textContent=new Date().toLocaleTimeString();
      $('#w'+idx+'-freq').textContent=info.freq.toFixed(4)+' MHz';
      $('#w'+idx+'-radio').textContent=info.bw+' / SF'+info.sf+' / CR'+info.cr;
      $('#w'+idx+'-name').textContent=info.name||'(sin nombre)';
      $('#w'+idx+'-tx').textContent=info.tx_power+' dBm';
      const mv=await n.battery();
      $('#w'+idx+'-batt').textContent=pct(mv)+'% ('+(mv/1000).toFixed(2)+'V)';
      setBattBar(idx,pct(mv));
      saveNodeState(idx,{name:info.name,freq:info.freq,bw:info.bw,sf:info.sf,cr:info.cr,tx:info.tx_power,batt:pct(mv),mv});
      if(typeof refreshMarkers==='function') refreshMarkers();
      if(typeof refreshChatUI==='function') refreshChatUI();
      n.onMessagesWaiting=()=>pullMessages(n);
      await pullMessages(n);
      logEl.textContent='Conectado por puente: '+info.name;
    }catch(e){
      logEl.textContent='Error del puente: '+e.message;
      nodes[idx]=null;
      if (typeof wNodes !== 'undefined') wNodes[idx]=null;
    }finally{btn.disabled=false;}
  };

  // ===== Gestion remota del RAK vía un WIO ya conectado (sin BLE al RAK) =====
  // Asi es como la app oficial de MeshCore lo gestiona "aunque este en casa":
  // LOGIN manda la contrasena de admin por LoRa a traves de un companion, no
  // por Bluetooth directo. Protocolo confirmado contra meshcore_py (SEND_LOGIN
  // = 26, SEND_TXT_MSG = 2 con TxtType.CLI_DATA).
  window.rakFindPubkey = async function(viaIdx, nameMatch){
    const n = nodes[viaIdx];
    if (!n || !n.connected) throw new Error('WIO'+viaIdx+' no conectado');
    const contacts = await n.getContacts();
    const target = contacts.find(c=>c.advType===2 && (!nameMatch || (c.name||'').toUpperCase().includes(nameMatch.toUpperCase())))
                || contacts.find(c=>c.advType===2);
    if (!target) throw new Error('No se encontró ningún repetidor en los contactos de WIO'+viaIdx);
    return target;
  };
  const loginDesde = Object.create(null);
  function pushAt(p, tipo){ const e=p && p.pushes && p.pushes[String(tipo)]; return e ? e.at : 0; }
  window.rakRemoteLogin = async function(viaIdx, pubkeyHex, password){
    const p = await api(`/wio/${viaIdx}/pushes`);
    loginDesde[viaIdx] = {ok: pushAt(p,0x85), ko: pushAt(p,0x86)};
    return api(`/wio/${viaIdx}/login`, {method:'POST', body: JSON.stringify({pubkey:pubkeyHex, password})});
  };
  window.rakRemoteCmd = async function(viaIdx, pubkeyHex, cmd, confirmed=false){
    return api(`/wio/${viaIdx}/remote_cmd`, {method:'POST', body: JSON.stringify({pubkey:pubkeyHex, cmd, confirmed})});
  };

  // ===== Estado remoto de cualquier nodo (peticion binaria 0x32, tipo STATUS) =====
  // No necesita login: son contadores publicos del nodo. La respuesta no vuelve
  // como reply, llega como push BINARY_RESPONSE (0x8C), asi que se sondea.
  function parseRemoteStatus(b){
    // 0x8C | reservado | tag(4) | 52+ bytes de contadores
    const d=b.slice(6);
    const v=new DataView(d.buffer,d.byteOffset,d.byteLength);
    const uptime=v.getUint32(20,true), airTx=v.getUint32(16,true);
    return {
      bat_mv:v.getUint16(0,true),
      tx_queue:v.getUint16(2,true),
      noise_floor:v.getInt16(4,true),
      last_rssi:v.getInt16(6,true),
      nb_recv:v.getUint32(8,true),
      nb_sent:v.getUint32(12,true),
      airtime_tx:airTx,
      uptime:uptime,
      sent_flood:v.getUint32(24,true),
      sent_direct:v.getUint32(28,true),
      recv_flood:v.getUint32(32,true),
      recv_direct:v.getUint32(36,true),
      last_snr:v.getInt16(42,true)/4,
      dups_direct:v.getUint16(44,true),
      dups_flood:v.getUint16(46,true),
      airtime_rx:v.getUint32(48,true),
      // Lo que de verdad importa para cumplir la norma de la comunidad:
      duty_cycle: uptime>0 ? (airTx/uptime*100) : null
    };
  }
  // Espera a que llegue un push 0x8C nuevo (las respuestas binarias son asincronas).
  async function awaitBinaryPush(viaIdx, sendFn, timeoutMs){
    const before = await api(`/wio/${viaIdx}/pushes`);
    let prevAt = (before.pushes && before.pushes['140']) ? before.pushes['140'].at : 0;
    const sent = await sendFn();
    const tag = sent && sent.tag;
    const deadline = Date.now()+timeoutMs;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,1500));
      const p = await api(`/wio/${viaIdx}/pushes`);
      const entry = p.pushes && p.pushes['140'];
      if(entry && entry.at>prevAt){
        prevAt = entry.at;
        const raw = u8(unb64(entry.frame));
        if(!tag || hexOf(raw.slice(2,6))===tag) return raw;
      }
    }
    throw new Error('el nodo no contestó a tiempo (puede estar fuera de alcance)');
  }

  // NEIGHBOURS (0x06): que nodos oye DIRECTAMENTE ese repetidor. Es lo que
  // permite dibujar la topologia real de la malla y no solo tus contactos.
  // Traceroute real (CMD_SEND_TRACE_PATH, 36): se manda por tu propio WIO, la
  // malla lo reenvia en flood y cada repetidor que lo toca añade su hash+SNR
  // a la respuesta (push TRACE_DATA, 0x89). Es la ruta que de verdad tomo el
  // paquete, no una lista de contactos.
  function parseTraceData(b){
    // 0x89 | reservado(1) | path_len(1) | flags(1) | tag(4) | auth(4) | [hash+snr]*n | final_snr
    const reserved=b[1], rawPathLen=b[2], flags=b[3];
    const hashLen=1<<(flags&3);
    const n = hashLen>0 ? Math.floor(rawPathLen/hashLen) : 0;
    const tag=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(4,true);
    let o=12, hops=[];
    for(let i=0;i<n && o+hashLen+1<=b.length;i++){
      const hash=Array.from(b.slice(o,o+hashLen)).map(x=>x.toString(16).padStart(2,'0')).join('');
      const snr=(new Int8Array([b[o+hashLen]])[0])/4;
      hops.push({hash,snr});
      o+=hashLen+1;
    }
    const finalSnr = o<b.length ? (new Int8Array([b[o]])[0])/4 : null;
    return {tag, hops, finalSnr};
  }
  window.rakSendTrace = async function(viaIdx, pathHex, timeoutMs=20000){
    const tag = Math.floor(Math.random()*0xFFFFFFFF);
    const before = await api(`/wio/${viaIdx}/pushes`);
    let prevAt = (before.pushes && before.pushes['137']) ? before.pushes['137'].at : 0;
    await api(`/wio/${viaIdx}/trace`, {method:'POST', body: JSON.stringify({tag, path:pathHex||''})});
    const deadline=Date.now()+timeoutMs;
    while(Date.now()<deadline){
      await new Promise(r=>setTimeout(r,1500));
      const p=await api(`/wio/${viaIdx}/pushes`);
      const entry=p.pushes && p.pushes['137'];
      if(entry && entry.at>prevAt){
        prevAt=entry.at; // solo se guarda el ultimo push de este tipo: avanzar el marcador evita releer el mismo dato
        const raw=u8(unb64(entry.frame));
        const parsed=parseTraceData(raw);
        if(parsed.tag===tag) return parsed;
        // Push de un tag distinto (otro trace en curso): sigue esperando el nuestro.
      }
    }
    throw new Error('sin respuesta del traceroute (puede que ningún repetidor lo haya reenviado)');
  };

  window.rakRequestNeighbours = async function(viaIdx, pubkeyHex, timeoutMs=25000){
    const PK_LEN=4;
    const tag=[0,0,0,0].map(()=>Math.floor(Math.random()*256));
    // version 0 | count 255 | offset uint16 | order_by 0 | prefix_len | tag uint32
    const data=[0x00,0xff,0x00,0x00,0x00,PK_LEN,...tag];
    const hex=data.map(x=>x.toString(16).padStart(2,'0')).join('');
    const raw=await awaitBinaryPush(viaIdx, ()=>api(`/wio/${viaIdx}/binary_req`,
      {method:'POST', body: JSON.stringify({pubkey:pubkeyHex, req_type:6, data:hex})}), timeoutMs);
    const d=raw.slice(6);
    const v=new DataView(d.buffer,d.byteOffset,d.byteLength);
    const total=v.getInt16(0,true), count=v.getInt16(2,true);
    const out=[];
    let o=4;
    for(let i=0;i<count && o+PK_LEN+5<=d.length;i++){
      out.push({
        pubkey:Array.from(d.slice(o,o+PK_LEN)).map(x=>x.toString(16).padStart(2,'0')).join(''),
        secs_ago:v.getInt32(o+PK_LEN,true),
        snr:(new Int8Array([d[o+PK_LEN+4]])[0])/4
      });
      o+=PK_LEN+5;
    }
    return {total, neighbours:out};
  };

  // TELEMETRY (0x03): CayenneLPP. Se parsean los tipos que de verdad manda
  // un nodo MeshCore; el resto se salta por tamano para no descuadrar la trama.
  // Tabla estandar CayenneLPP (IPSO). Antes solo cubria 4 tipos; el RAK y
  // sensores MeshCore tipicos (GPS, acelerometro...) usan mas.
  const LPP_SIZES={
    0:1,1:1,2:2,3:2,101:2,102:1,103:2,104:1,113:6,115:2,116:2,
    117:2,118:2,120:2,121:4,122:2,125:2,128:3,134:6,135:1,136:9,142:1
  };
  const LPP_NOMBRES={
    0:'Entrada digital',1:'Salida digital',2:'Entrada analógica',3:'Salida analógica',
    101:'Luminosidad',102:'Presencia',103:'Temperatura',104:'Humedad',
    113:'Acelerómetro',115:'Presión',116:'Voltaje',117:'Corriente',118:'Potencia',
    120:'Distancia',121:'Energía',122:'Dirección',125:'Concentración (gas)',
    128:'Color',134:'Girómetro',135:'GPS (unixtime)',136:'GPS',142:'Interruptor'
  };
  function parseLpp(d){
    const v=new DataView(d.buffer,d.byteOffset,d.byteLength);
    const out=[]; let i=0;
    while(i+2<=d.length && d[i]!==0){
      const chan=d[i], type=d[i+1], size=LPP_SIZES[type];
      if(size==null || i+2+size>d.length) break;
      const o=i+2;
      let value=null, unit='';
      // CayenneLPP va en big-endian (comprobado contra el RAK: 01 9c = 4,12 V).
      if(type===2||type===3||type===116){ value=v.getInt16(o,false)/100; unit='V'; }
      else if(type===103){ value=v.getInt16(o,false)/10; unit='°C'; }
      else if(type===104){ value=d[o]/2; unit='%HR'; }
      else if(type===115){ value=v.getUint16(o,false)/10; unit='hPa'; }
      else if(type===101){ value=v.getUint16(o,false); unit='lux'; }
      else if(type===117){ value=v.getInt16(o,false)/1000; unit='A'; }
      else if(type===118){ value=v.getInt16(o,false); unit='W'; }
      else if(type===120){ value=v.getInt16(o,false)/1000; unit='m'; }
      else if(type===121){ value=v.getUint32(o,false)/1000; unit='kWh'; }
      else if(type===122){ value=v.getUint16(o,false); unit='°'; }
      else if(type===125){ value=v.getUint16(o,false); unit='ppm'; }
      else if(type===128){ value=Array.from(d.slice(o,o+3)).map(x=>x.toString(16).padStart(2,'0')).join(''); unit='RGB'; }
      else if(type===113||type===134){ // acelerometro/girometro: x,y,z int16/1000
        value=[0,2,4].map(off=>v.getInt16(o+off,false)/1000).join(', ');
        unit=type===113?'g':'°/s';
      }
      else if(type===136){ // GPS: lat/lon int24/10000, alt int24/100 (signed)
        const s24=(off)=>{ let n=(d[o+off]<<16)|(d[o+off+1]<<8)|d[o+off+2]; if(n&0x800000) n-=0x1000000; return n; };
        value=(s24(0)/10000).toFixed(4)+', '+(s24(3)/10000).toFixed(4)+' · '+(s24(6)/100).toFixed(1)+'m alt';
        unit='';
      }
      else if(type===0||type===1||type===102||type===135||type===142){ value=d[o]; }
      else { value=null; }
      out.push({channel:chan,type,value,unit});
      i=o+size;
    }
    return out;
  }
  window.LPP_NOMBRES = LPP_NOMBRES;
  window.rakRequestTelemetry = async function(viaIdx, pubkeyHex, timeoutMs=25000){
    const raw=await awaitBinaryPush(viaIdx, ()=>api(`/wio/${viaIdx}/binary_req`,
      {method:'POST', body: JSON.stringify({pubkey:pubkeyHex, req_type:3})}), timeoutMs);
    return parseLpp(raw.slice(6));
  };

  // Altitudes del terreno, via la Pi (evita CORS y navegadores sin internet).
  window.rakElevations = async function(points){
    const lats=points.map(p=>p[0].toFixed(5)).join(',');
    const lons=points.map(p=>p[1].toFixed(5)).join(',');
    const r=await api(`/elevation?lats=${lats}&lons=${lons}`);
    return r.elevation||[];
  };

  // Historico que recoge la Pi cada 15 min (el movil no puede hacer esto).
  window.rakHistory = (limit=500)=>api(`/history?limit=${limit}`);
  window.cajaTemp = ()=>api('/caja');
  window.wioPausa = (idx,on)=>api(`/wio/${idx}/pausa`,{method:'POST',body:JSON.stringify({on})});
  window.rakRxLog = (limit=2000)=>api(`/rxlog?limit=${limit}`);
  window.rakRxHoras = (dias=7)=>api(`/rxlog/horas?dias=${dias}`);
  window.rakHistorySampleNow = ()=>api('/history/sample',{method:'POST',body:'{}'});

  window.rakRequestStatus = async function(viaIdx, pubkeyHex, timeoutMs=20000){
    const raw=await awaitBinaryPush(viaIdx, ()=>api(`/wio/${viaIdx}/binary_req`,
      {method:'POST', body: JSON.stringify({pubkey:pubkeyHex, req_type:1})}), timeoutMs);
    if(raw.length<58) throw new Error('respuesta de estado incompleta ('+raw.length+' bytes)');
    return parseRemoteStatus(raw);
  };
  // Traduce el ultimo push del WIO a un veredicto de login, si lo hay.
  window.rakGetWioStatus = async function(idx){
    const s = await api('/status');
    const st = s.wios[idx-1];
    const base = loginDesde[idx];
    if (st && base) {
      const p = await api(`/wio/${idx}/pushes`);
      const ok = pushAt(p,0x85), ko = pushAt(p,0x86);
      st._login = (ok>base.ok && ok>=ko) ? 'success' : (ko>base.ko ? 'failed' : null);
    }
    return st;
  };
  window.rakLoginPushVerdict = function(status){
    if (!status) return null;
    if ('_login' in status) return status._login;
    if (status.last_push_type === 0x85) return 'success';
    if (status.last_push_type === 0x86) return 'failed';
    return null;
  };

  window.connectedNodes = function(){
    return [1,2].map(i=>nodes[i]).filter(n=>n&&n.device&&n.device.gatt.connected);
  };

  const aviso=(t,ok)=>window.avisoMapa?avisoMapa(t,ok?undefined:'var(--warn)'):console.warn(t);
  window.wioExportKey = async function(idx){
    const n=nodes[idx];
    if(!n||!n.device.gatt.connected){aviso('WIO'+idx+' no está conectado: conéctalo para exportar su clave.');return;}
    try{
      const r=await n._send([0x17]);
      if(r[0]!==14){aviso('El WIO ha respondido algo inesperado (tipo '+r[0]+'): no se ha exportado la clave.');return;}
      const hex=Array.from(r.slice(1)).map(x=>x.toString(16).padStart(2,'0')).join('');
      const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([hex],{type:'text/plain'}));a.download='WIO'+idx+'_PRIVATE_KEY_'+new Date().toISOString().slice(0,10)+'.txt';a.click();
      try{ localStorage.setItem('meshcore-key-export-'+idx, String(Date.now())); }catch(e){}
      aviso('Clave de WIO'+idx+' exportada. Guárdala en un sitio seguro.',1);
    }catch(e){aviso('No se pudo exportar la clave: '+e.message);}
  };
  // ---- Ajustes del dispositivo (1.37) ----
  // Al conectar: pone el reloj en hora y avisa si el WIO no coincide con lo esperado.
  // Cambiar nombre/potencia/radio exige dos pulsaciones y guarda el valor anterior.
  const revisados={};
  const CAMPOS=['nombre','tx_power','freq','bw','sf','cr'];
  const valorInfo=(i)=>({nombre:i.name,tx_power:i.tx_power,freq:i.freq,bw:i.bw,sf:i.sf,cr:i.cr});
  const igual=(k,a,b)=>k==='nombre'?String(a)===String(b):Math.abs(Number(a)-Number(b))<0.0015;
  const ETQ={nombre:'nombre',tx_power:'potencia',freq:'frecuencia',bw:'ancho',sf:'SF',cr:'CR'};
  function esperado(idx){
    const w=(typeof CFG!=='undefined'&&CFG.wios&&CFG.wios[idx])||{};
    return Object.assign({}, window.PANEL_CONFIG&&w.nombre?{nombre:w.nombre}:{}, w.esperado||{});
  }
  // Diferencias entre lo que dice el WIO y lo esperado (solo los campos que el usuario fijó).
  window.wioDiferencias=function(info,e){
    const act=valorInfo(info||{}), dif=[];
    for(const k of CAMPOS){ if(e&&e[k]!==undefined && !igual(k,act[k],e[k])) dif.push(ETQ[k]+' es '+act[k]+' y debería ser '+e[k]); }
    return dif;
  };
  // ---- Placa, antena y límite legal (1.38) ----
  // El firmware dice su modelo (DEVICE_QUERY) y su potencia máxima (SELF_INFO); el catálogo
  // añade lo que el equipo no cuenta. Si un modelo no está, se muestra el texto tal cual.
  const PLACAS=[
    [/wio.?tracker.?l1/i,{marca:'Seeed',chip:'nRF52840',radio:'SX1262'}],
    [/t1000/i,{marca:'Seeed SenseCAP',chip:'nRF52840',radio:'LR1110',conector:'antena interna'}],
    [/xiao.*(s3|esp32)/i,{marca:'Seeed',chip:'ESP32-S3',radio:'SX1262 (Wio-SX1262)'}],
    [/xiao.*nrf/i,{marca:'Seeed',chip:'nRF52840',radio:'SX1262 (Wio-SX1262)'}],
    [/rak.?3401/i,{marca:'RAKwireless',chip:'nRF52840',radio:'SX1262 + 1 W',pa:true}],
    [/rak.?4631|wisblock|rak.?wismesh/i,{marca:'RAKwireless',chip:'nRF52840',radio:'SX1262',conector:'IPEX'}],
    [/rak.?3112/i,{marca:'RAKwireless',chip:'ESP32-S3',radio:'SX1262',conector:'IPEX'}],
    [/t114/i,{marca:'Heltec',chip:'nRF52840',radio:'SX1262',conector:'IPEX'}],
    [/heltec.*v[34]/i,{marca:'Heltec',chip:'ESP32-S3',radio:'SX1262',conector:'IPEX'}],
    [/heltec/i,{marca:'Heltec'}],
    [/t-?beam.*1w/i,{marca:'LilyGo',chip:'ESP32-S3',radio:'SX1262 + 1 W',conector:'SMA',pa:true}],
    [/t-?beam/i,{marca:'LilyGo',chip:'ESP32',radio:'SX1262/SX1276',conector:'SMA'}],
    [/t-?echo/i,{marca:'LilyGo',chip:'nRF52840',radio:'SX1262'}],
    [/t-?deck/i,{marca:'LilyGo',chip:'ESP32-S3',radio:'SX1262'}],
    [/lilygo|t3.?s3/i,{marca:'LilyGo'}],
    [/station.?g2/i,{marca:'Unit Engineering',chip:'ESP32-S3',radio:'SX1262 + PA',conector:'SMA',pa:true}],
    [/thinknode/i,{marca:'Elecrow'}],
  ];
  window.placaDe=(modelo)=>{ for(const [re,d] of PLACAS) if(re.test(modelo||'')) return d; return {}; };
  // ERP = potencia + ganancia de la antena (dBi) − pérdidas del cable − 2,15 (dBi → dBd).
  window.wioErp=(tx,dbi,perd)=>Math.round((Number(tx)+Number(dbi||0)-Number(perd||0)-2.15)*10)/10;
  // Límites ERP de la UE en 863–870 MHz: 500 mW (27 dBm) en 869,4–869,65; 25 mW (14 dBm) en el resto.
  window.limiteErp=(freq)=>(freq>=869.4&&freq<=869.65)?27:14;
  const leerLocal=(k,def)=>{ try{ return JSON.parse(localStorage.getItem(k)||'null')??def; }catch(e){ return def; } };
  const guardarLocal=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
  window.wioApodo=(idx)=>leerLocal('mc-wio-apodo-'+idx,'')||('WIO'+idx);
  function antena(idx){
    const w=(typeof CFG!=='undefined'&&CFG.wios&&CFG.wios[idx]&&CFG.wios[idx].antena)||{};
    return leerLocal('mc-wio-antena-'+idx,{dbi:w.dbi??2,perdidas:w.perdidas??0});
  }
  const modelos={};
  async function modelo(idx){
    if(modelos[idx]) return modelos[idx];
    try{ modelos[idx]=await api('/wio/'+idx+'/modelo',{method:'POST',body:'{}'}); }catch(e){ return null; }
    return modelos[idx];
  }

  window.wioRevisar=async function(idx){
    const n=nodes[idx];
    if(!n||!n.info||!n.info.name||revisados[idx]) return;
    revisados[idx]=true;
    try{
      const h=await api(n.base+'/hora',{method:'POST',body:'{}'});
      const min=Math.round(Math.abs(h.desvio_s)/60);
      if(h.ajustada) aviso('WIO'+idx+': reloj corregido (iba '+(min?min+' min ':Math.abs(h.desvio_s)+' s ')+(h.desvio_s<0?'atrasado':'adelantado')+').',1);
      else if(h.motivo) aviso('WIO'+idx+': el reloj va desviado '+min+' min y '+h.motivo+'.');
    }catch(e){}
    const a=antena(idx), erp=window.wioErp(n.info.tx_power,a.dbi,a.perdidas), lim=window.limiteErp(n.info.freq);
    if(erp>lim) aviso(window.wioApodo(idx)+' emite '+erp+' dBm ERP y el límite en '+n.info.freq+' MHz es '+lim+' dBm. Baja la potencia en Ajustes del dispositivo.');
    const dif=window.wioDiferencias(n.info,esperado(idx));
    if(dif.length) aviso('WIO'+idx+' no coincide con lo esperado: '+dif.join('; ')+'. Se cambia en Gestión → WIO'+idx+' → Ajustes del dispositivo.');
  };
  setInterval(()=>{ for(const i of [1,2]){ const n=nodes[i]; if(!n) continue; if(n.device&&n.device.gatt.connected) window.wioRevisar(i); else { revisados[i]=false; delete modelos[i]; } } },4000);

  function ajustesUI(idx){
    const $i=(id)=>document.getElementById('aj'+idx+'-'+id);
    const det=document.getElementById('g-w'+idx+'-aj'); if(!det||!$i('aplicar')) return;
    const clave='mc-wio-prev-'+idx;
    let armado=null;
    const pintarErp=()=>{
      const tx=+$i('tx').value, f=+$i('freq').value, erp=window.wioErp(tx,$i('dbi').value,$i('perd').value), lim=window.limiteErp(f), m=Math.round((lim-erp)*10)/10;
      const el=$i('erp'); el.hidden=!tx;
      el.className='d '+(erp>lim?'erp-mal':'erp-ok');
      el.textContent='Potencia radiada: '+erp+' dBm ERP. Límite en '+f+' MHz: '+lim+' dBm ERP. '+(erp>lim?'Te pasas '+(-m)+' dB: baja la potencia o usa otra antena.':'Dentro, con '+m+' dB de margen.');
      return erp<=lim;
    };
    async function pintarModelo(){
      const n=nodes[idx]; if(!n||!n.info) return;
      const m=await modelo(idx), p=window.placaDe(m&&m.modelo);
      const txt=[m&&m.modelo?(p.marca&&!new RegExp(p.marca.split(' ')[0],'i').test(m.modelo)?p.marca+' ':'')+m.modelo:'modelo desconocido (firmware antiguo)', p.chip, p.radio, m&&m.version?'firmware '+m.version:'', 'máx. '+n.info.max_tx_power+' dBm', p.conector?'conector '+p.conector:''].filter(Boolean).join(' · ');
      $i('modelo').textContent='Detectado: '+txt+(p.pa?'. Lleva amplificador: la potencia radiada real es mayor que la que marca el firmware, mira la hoja del fabricante.':'');
      const max=Math.min(22,n.info.max_tx_power||22); $i('tx').max=max;
    }
    const leer=()=>({nombre:$i('nombre').value.trim(),tx_power:+$i('tx').value,freq:+$i('freq').value,bw:+$i('bw').value,sf:+$i('sf').value,cr:+$i('cr').value});
    const rellenar=(v)=>{ $i('nombre').value=v.nombre; $i('tx').value=v.tx_power; $i('freq').value=v.freq; $i('bw').value=String(v.bw); $i('sf').value=v.sf; $i('cr').value=v.cr; };
    const previo=()=>{ try{ return JSON.parse(localStorage.getItem(clave)||'null'); }catch(e){ return null; } };
    const desarmar=()=>{ armado=null; $i('aplicar').textContent='Aplicar cambios'; $i('volver').textContent='Volver al valor anterior'; };
    function refrescar(){
      const n=nodes[idx], on=!!(n&&n.info&&n.info.name&&n.device.gatt.connected);
      for(const b of ['aplicar','hora']) $i(b).disabled=!on;
      $i('volver').hidden=!previo(); $i('volver').disabled=!on;
      if(!on){ $i('estado').textContent='Conecta el WIO para ver y cambiar sus ajustes.'; return; }
      if(!armado) rellenar(valorInfo(n.info));
      const a=antena(idx); $i('dbi').value=a.dbi; $i('perd').value=a.perdidas; $i('apodo').value=leerLocal('mc-wio-apodo-'+idx,'');
      pintarErp(); pintarModelo();
      $i('estado').textContent='Valores actuales del dispositivo. Cambiar la radio puede dejarlo fuera de la red.';
    }
    det.addEventListener('toggle',()=>{ if(det.open) refrescar(); });
    const diff=(nuevo,act)=>CAMPOS.filter(k=>!igual(k,nuevo[k],act[k]));
    async function enviar(nuevo,act,cual){
      const cambios=diff(nuevo,act);
      if(!pintarErp()){ $i('estado').textContent='No se aplica: pasaría del límite legal de potencia radiada.'; desarmar(); return; }
      const max=+$i('tx').max||22;
      if(nuevo.tx_power>max){ $i('estado').textContent='Esta placa admite como mucho '+max+' dBm.'; desarmar(); return; }
      if(!cambios.length){ $i('estado').textContent='Nada que cambiar.'; desarmar(); return; }
      const texto=cambios.map(k=>ETQ[k]).join(', ');
      if(armado!==cual){
        armado=cual; $i(cual).textContent='Confirmar: cambia '+texto;
        $i('estado').textContent='Pulsa otra vez para confirmar. Se guarda el valor actual para poder volver.';
        setTimeout(()=>{ if(armado===cual) desarmar(); },8000); return;
      }
      desarmar();
      const body={confirmed:true};
      if(cambios.includes('nombre')) body.nombre=nuevo.nombre;
      if(cambios.includes('tx_power')) body.tx_power=nuevo.tx_power;
      if(['freq','bw','sf','cr'].some(k=>cambios.includes(k))) body.radio={freq:nuevo.freq,bw:nuevo.bw,sf:nuevo.sf,cr:nuevo.cr};
      try{
        await api('/wio/'+idx+'/ajuste',{method:'POST',body:JSON.stringify(body)});
        try{ localStorage.setItem(clave,JSON.stringify(act)); }catch(e){}
        const n=nodes[idx]; n.info=await n.appStart();
        aviso('WIO'+idx+': '+texto+' cambiado.',1); refrescar();
      }catch(e){ $i('estado').textContent='No se pudo cambiar: '+e.message; aviso('WIO'+idx+': no se pudo cambiar ('+e.message+').'); }
    }
    for(const k of ['tx','freq','dbi','perd']) $i(k).addEventListener('input',pintarErp);
    for(const k of ['dbi','perd']) $i(k).addEventListener('change',()=>guardarLocal('mc-wio-antena-'+idx,{dbi:+$i('dbi').value||0,perdidas:+$i('perd').value||0}));
    $i('apodo').addEventListener('change',()=>{ guardarLocal('mc-wio-apodo-'+idx,$i('apodo').value.trim()); document.getElementById('g-w'+idx+'-aj-t').textContent='Ajustes del dispositivo · '+window.wioApodo(idx); });
    document.getElementById('g-w'+idx+'-aj-t').textContent='Ajustes del dispositivo · '+window.wioApodo(idx);
    $i('aplicar').addEventListener('click',()=>{ const n=nodes[idx]; if(n&&n.info) enviar(leer(),valorInfo(n.info),'aplicar'); });
    $i('volver').addEventListener('click',()=>{ const n=nodes[idx], p=previo(); if(n&&n.info&&p) enviar(p,valorInfo(n.info),'volver'); });
    $i('hora').addEventListener('click',async()=>{
      try{
        const h=await api('/wio/'+idx+'/hora',{method:'POST',body:'{}'});
        $i('estado').textContent=h.ajustada?'Reloj corregido.':(h.motivo||'El reloj ya estaba en hora (desvío '+Math.round(h.desvio_s)+' s).');
      }catch(e){ $i('estado').textContent='No se pudo: '+e.message; }
    });
  }
  [1,2].forEach(ajustesUI);
  window.getGatewaySnapshot = ()=>api('/status');

  setTimeout(refreshGateway, 50);
  setInterval(refreshGateway, 3000);
})();
