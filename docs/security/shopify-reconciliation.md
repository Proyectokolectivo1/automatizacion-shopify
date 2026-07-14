# Seguridad de la reconciliación Shopify

- RBAC default-deny y coincidencia de organización se aplican antes del servicio.
- Solo `OWNER`, `ADMIN` y `OPERATIONS` reciben `reconciliation.manage`.
- Tienda, checkpoint, incidencia, webhook, pedido y outbox conservan ownership tenant-safe.
- El reproceso exige clave idempotente, advisory lock y transacción serializable con retry acotado.
- Las respuestas no exponen payloads, credenciales, direcciones, correo ni nombres de clientes.
- Los eventos internos se marcan `reconciliation_generated=true` y `signature_valid=false`; un
  constraint evita fingir una firma Shopify.
- Flags, modo simulación y kill switch cierran el flujo por defecto.
- La ventana y el límite de consulta reducen abuso y escaneos sin cota.
- Auditoría y métricas registran actor, organización, recurso y resultado sin secretos.

Antes de conectar Shopify real se requiere validar el contrato oficial, credenciales en secret
manager, scopes mínimos, rate limits, paginación real y política de retención de PII.
