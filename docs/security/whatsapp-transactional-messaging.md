# Seguridad de mensajería WhatsApp simulada

- RBAC, consultas y FK compuestas verifican organización y tienda.
- Solo clientes con consentimiento de tratamiento y teléfono E.164 pueden generar un mensaje.
- El token se descifra con AAD de organización/tienda únicamente para el adaptador; el mock no lo
  devuelve, registra ni incorpora a su identificador determinista.
- Cuerpo, teléfono y valores de variables se excluyen de respuesta, auditoría, métricas y outbox.
- `WHATSAPP_MESSAGES_ENABLED`, `WHATSAPP_MESSAGES_KILL_SWITCH` y
  `WHATSAPP_MESSAGES_SIMULATION_MODE` fallan cerrados.
- La base restringe el estado a aceptación simulada, prohíbe timestamps reales e impide modificar el
  contenido persistido.
- Las claves de idempotencia y de negocio se almacenan hasheadas; las colisiones funcionales con
  variables diferentes se rechazan.

Antes de habilitar tráfico real se requieren credenciales separadas, política aprobada de retención/PII,
pruebas de contrato contra Meta, webhook autenticado para estados y revisión del worker de entrega.
