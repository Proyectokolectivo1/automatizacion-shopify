# Seguridad del smoke local de release

- Las credenciales productivas no son necesarias ni aceptadas como evidencia del gate.
- El Bearer de métricas y la clave del BFF se generan aleatoriamente en memoria por ejecución.
- Los procesos reciben únicamente variables explícitas; el reporte no incluye variables, puertos,
  respuestas, comandos completos ni salidas de hijos.
- `/metrics` debe responder 401 sin Bearer y 200 únicamente con el valor efímero.
- El BFF debe responder 401 y `Cache-Control: no-store` sin una sesión válida.
- Las cabeceras CSP, frame, nosniff, referrer, permissions y COOP se comprueban sobre Next productivo.
- El cierre se valida activamente para evitar procesos o listeners huérfanos.

Pendiente antes de producción: TLS/proxy, secret manager, autenticación de infraestructura, SAST/DAST,
escaneo especializado de secretos y ejecución del smoke dentro del entorno objetivo.
