# Seguridad del vencimiento de pagos

- Flags, modo simulación y kill switch fallan cerrados.
- `MARK` es la política predeterminada; `CANCEL` requiere configuración explícita.
- El scheduler bloquea intención y pedido con `FOR UPDATE ... SKIP LOCKED`, y el webhook bloquea la
  misma intención antes de decidir una transición.
- Los estados terminales no son sobrescritos por webhooks tardíos; una aprobación tardía abre revisión
  manual.
- Constraints exigen correspondencia entre `EXPIRED` y `expired_at`.
- Outbox, auditoría e historial se escriben en la misma transacción y no contienen PII ni secretos.
- No se llama Shopify, Wompi, WhatsApp o Mastershop desde el scheduler.

El PAT expuesto fuera del repositorio sigue siendo un riesgo operativo y debe revocarse. No se copia
en configuración, logs, pruebas ni documentación.
