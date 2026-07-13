# Seguridad de logs y métricas

Pino elimina valores de claves sensibles conocidas, incluidas `authorization`, `cookie`, `email`,
`password`, `phone` y `token`. La redacción es defensa adicional: el código no debe registrar bodies,
payloads de proveedor, query strings ni objetos de configuración completos.

Reglas:

- usar campos estructurados y mensajes estables;
- incluir `correlationId`, proveedor y resultado cuando apliquen;
- no usar valores externos como nombres de métricas o labels;
- no devolver stack traces ni mensajes 5xx internos;
- conservar `/metrics` fuera del acceso público;
- añadir rutas de redacción antes de registrar una nueva estructura sensible.

La prueba `pnpm observability:verify` envía Authorization y PII sintéticos y falla si aparecen en los
logs o métricas capturados.
