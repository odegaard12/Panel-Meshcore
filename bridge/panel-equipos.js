    // Cambio de pestana de dispositivo: aparte del script grande de la pagina
    // a proposito, para que un fallo en cualquier otro sitio (BLE, mapa...)
    // no deje sin funcionar la barra lateral de Equipos.
    (function(){
      const K='meshcore-devtab';
      function ir(dev){
        document.querySelectorAll('.devTab').forEach(b=>b.classList.toggle('on',b.dataset.dev===dev));
        document.querySelectorAll('.devPanel').forEach(p=>p.classList.toggle('on',p.id==='devpanel-'+dev));
        try{ localStorage.setItem(K,dev); }catch(e){}
      }
      document.querySelectorAll('.devTab').forEach(b=>{
        b.addEventListener('click',()=>ir(b.dataset.dev));
      });
      let inicial='rak';
      try{ const g=localStorage.getItem(K); if(g) inicial=g; }catch(e){}
      ir(inicial);
    })();
