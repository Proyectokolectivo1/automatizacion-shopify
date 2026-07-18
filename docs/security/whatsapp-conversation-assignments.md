# Seguridad — asignación WhatsApp simulada

Actualizado: 2026-07-17

- `SUPPORT` puede leer y reclamar para sí; no puede elegir otro agente ni liberar conversaciones.
- `OWNER`, `ADMIN` y `OPERATIONS` pueden reclamar, reasignar y desasignar.
- `READ_ONLY`, `FINANCE` y `LOGISTICS` permanecen default-deny.
- El cliente aporta una membresía, no un `userId`; tenant, estado de membresía, estado del usuario y
  rol elegible se validan dentro de la transacción.
- Locks, versión esperada e idempotencia impiden ownership perdido por carreras o reintentos.
- Las razones son enums cerrados; no se acepta texto libre ni PII.
- El historial es append-only y la evidencia operativa omite contenido, teléfonos, emails e IDs
  externos.
- Los controles de asignación tienen feature flag, kill switch y requisito de simulación propios.

Revocar una membresía ya asignada no libera automáticamente la conversación. Hasta coordinar este
ciclo con identidad, un manager debe reasignar o desasignar explícitamente; el riesgo queda abierto.
