# Seguridad de logs, trazas, alertas y métricas

Pino elimina valores de claves sensibles conocidas, incluidas `authorization`, `cookie`, `email`,
`password`, `phone` y `token`. La redacción es defensa adicional: el código no registra bodies,
payloads de proveedor, query strings ni objetos de configuración completos.

Reglas:

- usar campos estructurados y mensajes estables;
- incluir `correlationId`, `traceId`, `spanId`, proveedor y resultado cuando apliquen;
- limitar atributos de spans y labels a valores enumerados o patrones de ruta;
- no incluir URL completa, headers, query, PII, secretos, contenido ni IDs externos en telemetría;
- no devolver stack traces ni mensajes 5xx internos;
- restringir `/metrics` por socket loopback en desarrollo y Bearer técnico en producción;
- no confiar en `X-Forwarded-For` para autorizar `/metrics`;
- exigir endpoints OTLP/Alertmanager HTTP(S) sin usuario, contraseña, query ni fragmento;
- no reutilizar el token de métricas como credencial de usuario o proveedor;
- añadir rutas de redacción antes de registrar una estructura sensible nueva.

Los puertos de Collector (`4318`, `13133`), Alertmanager (`9093`) y receptor (`18080`) se publican
solo en `127.0.0.1` en el compose local. Los controles `*_ENABLED` y `*_KILL_SWITCH` impiden habilitar
telemetría externa de forma accidental.

`pnpm observability:verify` envía Authorization, token técnico y PII sintéticos; falla si aparecen en
logs, métricas o salida del Collector.
