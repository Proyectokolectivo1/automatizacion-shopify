# Seguridad — mensajes entrantes WhatsApp simulados

- El HMAC-SHA256 se valida en tiempo constante sobre el cuerpo crudo antes de JSON/Zod.
- El header, fixture, IDs y secreto son sintéticos y no se presentan como autenticación Meta.
- El ingreso exige los controles de integración, webhook e inbound; cualquiera falla cerrado.
- Todas las consultas y claves foráneas incluyen organización/tienda; un target ajeno responde 404.
- El texto se cifra AES-256-GCM con AAD por mensaje. `body` debe ser nulo por constraint SQL.
- El remitente desconocido se guarda como HMAC tenant-safe; teléfono y texto quedan fuera de
  eventos, auditoría, outbox, métricas y respuestas.
- Seudónimo y fingerprint se derivan del keyring cifrado, separado del secreto webhook y compatible
  con rotación mientras se conserven versiones anteriores.
- Evento y contenido cifrado son inmutables; replay y colisiones se distinguen de forma durable.
- `retention_expires_at` marca la ventana configurada de 1 a 365 días. En esta etapa no circula PII
  real; la purga física debe implementarse y aprobarse antes de abrir Meta real.
- No hay respuesta automática, bandeja, llamadas Meta ni tráfico a Shopify, Wompi o Mastershop.
