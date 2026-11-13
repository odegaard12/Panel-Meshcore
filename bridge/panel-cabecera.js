/* Antes de pintar nada: se oculta la interfaz y se calcula la escala, para que no se vea cómo se recolocan los menús */
(function(){var d=document.documentElement;d.classList.add('cargando');
d.style.setProperty('--esc',(innerWidth<=860?1:Math.max(.6,Math.min(1,innerWidth/1550))).toFixed(3));})();
