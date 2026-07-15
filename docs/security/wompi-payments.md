# Seguridad de pagos Wompi

- La aplicación nunca captura PAN, CVV ni datos de tarjeta; el checkout será alojado por Wompi.
- Firma SHA-256 se calcula en servidor. El secreto de integridad no se devuelve ni se registra.
- El fixture contiene exclusivamente valores sintéticos y un host `.invalid` no enrutable.
- Monto COP y referencia se derivan de pedido/tarifa durables; el cliente no puede modificarlos.
- RBAC y FKs compuestas aplican default-deny y aislamiento organizacional.
- Idempotency-Key se almacena como hash; logs, auditoría y outbox no incluyen URL ni firma.
- Flag, modo simulación y kill switch están cerrados por defecto.

Antes de sandbox real se requieren keyring separado para pública/integridad/eventos/privada, rotación,
URLs HTTPS, política de retención y pruebas de firma/consulta authoritative.
