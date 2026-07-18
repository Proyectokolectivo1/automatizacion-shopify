# Contrato E3-H7A — asignación WhatsApp simulada

Actualizado: 2026-07-17

Todas las rutas requieren sesión, tienda tenant-safe, `Idempotency-Key`, flags habilitados y modo
simulación. Las respuestas incluyen `Cache-Control: no-store`.

## Rutas

- `POST /operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations/:conversationId/assignment/claim`
  con `{ "expectedVersion": 0 }`.
- `POST /operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations/:conversationId/assignment/reassign`
  con `{ "expectedVersion": 1, "assigneeMembershipId": "uuid", "reasonCode": "SHIFT_CHANGE" }`.
- `POST /operations/organizations/:organizationId/whatsapp/stores/:storeId/conversations/:conversationId/assignment/unassign`
  con `{ "expectedVersion": 2, "reasonCode": "MANUAL_RELEASE" }`.

`reassign` acepta `WORKLOAD_BALANCE`, `SHIFT_CHANGE` o `SPECIALIST_ROUTING`; `unassign` acepta
`AGENT_UNAVAILABLE`, `MANUAL_RELEASE` o `SHIFT_CHANGE`. No hay texto libre.

## Respuesta

La respuesta devuelve únicamente ID interno de conversación/membresía, acción, modo, versión y
timestamp. La razón queda en historial/outbox, no en la respuesta. Nunca devuelve email, teléfono,
contenido ni IDs externos.

## Errores

- `400`: cuerpo, UUID, versión, razón o idempotency key inválidos.
- `403`: permiso insuficiente.
- `404`: tienda, conversación o membresía ajenas/inexistentes, sin revelar tenant.
- `409`: versión obsoleta, conversación ya asignada, membresía inactiva/no elegible o colisión de
  idempotencia.
- `503`: integración, bandeja o asignaciones deshabilitadas, kill switch cerrado o simulación
  desactivada.
