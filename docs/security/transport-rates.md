# Seguridad de tarifas de transporte

- RBAC default-deny: owner/admin administran; operations solo previsualiza y resuelve; read-only no
  accede.
- Toda lectura y mutación exige `organizationId` coincidente y FKs compuestas preservan ownership de
  tienda, pedido, política y regla.
- Los importes usan `BIGINT`/enteros en unidades menores y solo COP en esta versión.
- Activación, resolución y fallos generan auditoría; las métricas solo usan etiquetas acotadas.
- La clave idempotente se valida y persiste únicamente como hash contextual.
- Respuestas usan `no-store`; logs y auditorías no deben incluir direcciones, secretos o payloads.
- Flags, kill switch y simulación fallan cerrados. Esta superficie no autoriza pagos ni fulfillment.

Antes de producción se requiere aprobación comercial de políticas, retención legal de decisiones,
alertas conectadas y pruebas de carga/race bajo el volumen objetivo.
