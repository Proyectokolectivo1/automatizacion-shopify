# Contrato API de operaciones DLQ

Actualizado: 2026-07-14

Ambas rutas requieren Bearer session, tenant coincidente y permiso `outbox.manage`, asignado solo a
OWNER y ADMIN. Los controles `OUTBOX_OPERATIONS_ENABLED` y `OUTBOX_OPERATIONS_KILL_SWITCH` fallan
cerrados con 503.

## Inspección

`GET /operations/organizations/{organizationId}/dlq?limit=25&cursor=...&eventType=...`

Devuelve `items` ordenados por creación descendente y `nextCursor`. Cada item contiene identificador,
tipo de evento/agregado, conteos, timestamps y categoría de error. Nunca devuelve `payloadJson`,
`lastErrorJson`, mensajes crudos, secretos ni PII completa. `limit` admite 1 a 100.

## Reproceso

`POST /operations/organizations/{organizationId}/dlq/{eventId}/reprocess`

Requiere header `Idempotency-Key` de 8 a 200 caracteres. Responde 202 con `eventId`, `status=pending`,
`deliveryVersion` y `reprocessCount`. Repetir la misma clave devuelve el mismo snapshot. Una segunda
clave concurrente recibe 409; evento ajeno/no existente recibe 404 y estado no-DLQ recibe 409.

La transición limpia lease/error/publicación, reinicia intentos del publisher, incrementa la versión
y queda auditada. La clave recibida se persiste solo como hash.
