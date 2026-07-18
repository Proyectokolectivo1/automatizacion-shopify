# Contrato de administración de identidad

Actualizado: 2026-07-14

Base: `/identity/organizations/:organizationId/memberships`. Todos los endpoints requieren Bearer
token, tenant coincidente, permiso `identity.manage` y `Cache-Control: no-store`. La superficie está
desactivada por defecto mediante `IDENTITY_ADMIN_ENABLED=false` y
`IDENTITY_ADMIN_KILL_SWITCH=true`.

## Listar membresías

`GET /identity/organizations/:organizationId/memberships?limit=25&cursor=...`

Devuelve `items` y `nextCursor`. Cada item contiene únicamente `membershipId`, `userId`, `email`,
`role`, `status`, `userStatus`, `createdAt` y `updatedAt`. El cursor es opaco; `limit` acepta 1–100.

## Cambiar rol

`PATCH /identity/organizations/:organizationId/memberships/:membershipId/role`

Requiere `Idempotency-Key` de 8–200 caracteres y body `{ "role": "OPERATIONS" }`. Owner puede
administrar roles de terceros. Admin no puede administrar owner/admin ni asignar esos roles. Ningún
actor puede cambiar su propia membresía. Una mutación real revoca todas las sesiones del usuario en
la organización.

## Revocar membresía

`POST /identity/organizations/:organizationId/memberships/:membershipId/revoke`

Requiere `Idempotency-Key`. Devuelve
`{ "membershipId": "...", "releasedConversationCount": 2, "status": "revoked" }`. La revocación es
atómica con la invalidación de sesiones y la liberación de todas las conversaciones WhatsApp asignadas;
protege el último owner activo. Cada liberación incrementa su versión y conserva historial/outbox con
la razón cerrada `MEMBERSHIP_REVOKED`.

## Errores y replay

- `400`: body, UUID, cursor o clave inválidos.
- `401`: sesión ausente, expirada o revocada.
- `403`: tenant/rol no autorizado, auto-mutación o escalamiento prohibido.
- `404`: membresía ausente en el tenant autenticado; no revela tenant ajeno.
- `409`: último owner, membresía no activa o clave reutilizada para otra solicitud.
- `503`: flag apagado o kill switch activo.

La misma clave y solicitud devuelve el snapshot persistido. La clave cruda nunca se persiste; se
almacena un hash con scope y tenant. Auditoría y métricas usan acciones acotadas y no incluyen email,
password, token, secreto ni clave idempotente.
