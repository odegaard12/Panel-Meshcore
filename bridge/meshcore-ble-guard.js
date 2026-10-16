/* Panel MeshCore browser BLE/Serial hard-disable for gateway mode. */
(()=>{
'use strict';
const bt={async getDevices(){return[]},async requestDevice(){throw new Error('Bluetooth gestionado por el gateway')}};
const serial={async getPorts(){return[]},async requestPort(){throw new Error('Serial gestionado por el gateway')}};
const np=Object.getPrototypeOf(navigator);
try{const d=Object.getOwnPropertyDescriptor(np,'bluetooth');if(!d||d.configurable)Object.defineProperty(np,'bluetooth',{configurable:true,get:()=>bt})}catch(_){ }
try{const d=Object.getOwnPropertyDescriptor(np,'serial');if(!d||d.configurable)Object.defineProperty(np,'serial',{configurable:true,get:()=>serial})}catch(_){ }
window.__MESHCORE_GATEWAY_ONLY__=true;
})();
