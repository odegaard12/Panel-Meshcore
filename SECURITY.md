# Seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 1.0.x | Sí |
| < 1.0 | No |

## Avisar de un fallo

Si encuentras un fallo de seguridad, **no abras un issue público**: usa
[«Report a vulnerability»](https://github.com/odegaard12/panel-meshcore/security/advisories/new)
en la pestaña Security del repo.

Ten en cuenta al desplegarlo:

- El panel está pensado para tu red local. La terminal web da acceso a la Raspberry: no la
  expongas a internet sin otra capa delante (VPN, Cloudflare Access…).
- Usa contraseña bcrypt: `sudo htpasswd -B /etc/nginx/meshcore-tls/htpasswd TU_USUARIO`.
- Tu `config.js` lleva tus coordenadas y nombres: no lo subas a ningún repo
  (`python tools/check_privado.py` antes de cada push).
- El detalle de cómo está protegido (login, límites, cabeceras, token) está en
  [`deploy/DESPLIEGUE.md`](deploy/DESPLIEGUE.md#seguridad).
