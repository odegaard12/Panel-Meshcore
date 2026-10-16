# Cambiar el firmware de un companion sin perder su identidad

La identidad de un nodo MeshCore es su clave privada. Si el flasheo borra la memoria (cambio
de SoftDevice, de rol o entre variantes de firmware), sale con una clave nueva y para la red es
otro nodo. Guárdala antes y vuelve a ponerla después.

## 1. Antes de flashear

- **Exporta la clave privada** desde el panel: pestaña **Equipos**, botón **Exportar clave**
  del companion. Guárdala fuera del repo y en un sitio seguro: quien la tenga puede hacerse
  pasar por tu nodo.
- **Canales privados**: van cifrados. Apunta la clave de cada uno; sin ella no vuelves a entrar.
  El canal público y los contactos se recuperan solos.

## 2. Flasheo UF2 por USB

1. Descarga el firmware *companion BLE* para tu placa desde las releases oficiales de
   [MeshCore](https://github.com/meshcore-dev/MeshCore) o usa el
   [flasher web](https://flasher.meshcore.co.uk).
2. Conecta la placa por USB con un cable de datos (no de solo carga).
3. Doble pulsación rápida al botón de reset: aparece una unidad de disco nueva.
4. Abre `INFO_UF2.TXT` de esa unidad y mira la versión de SoftDevice/bootloader. Si el
   firmware nuevo usa otra, o cambias de variante, copia primero el *formatter* UF2 que
   corresponda (borra la memoria) y vuelve a entrar con doble reset.
5. Arrastra el `.uf2` del firmware a la unidad. La placa se reinicia sola.

## 3. Después

1. Empareja de nuevo por Bluetooth con PIN (por defecto `123456`).
2. En el panel, **Equipos** → importa la clave privada que guardaste.
3. Vuelve a añadir los canales privados con sus claves.

Cambiar de rol (companion ↔ repetidor) también borra todo: elige bien antes de flashear.
