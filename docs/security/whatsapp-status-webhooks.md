# Seguridad — webhook de estados WhatsApp simulado

- El HMAC-SHA256 se valida en tiempo constante sobre bytes crudos antes de JSON/Zod.
- El header y el secreto son sintéticos y versionados; no se presentan como firma oficial Meta.
- El secreto webhook usa el mismo keyring versionado pero AAD distinto al token de envío, por lo que
  intercambiar sobres cifrados falla cerrado.
- La ruta real permanece cerrada por `WHATSAPP_WEBHOOKS_ENABLED`, modo simulación y kill switch.
- Target, mensaje, evento e historial conservan claves foráneas compuestas de organización/tienda.
- El cuerpo, teléfono, texto, variables y `providerMessageId` no aparecen en evento, outbox,
  auditoría ni métricas; solo se persisten hashes/resúmenes acotados.
- Eventos e historial son inmutables mediante triggers SQL y las colisiones de ID fallan con 409.
- RBAC protege la rotación del secreto; el ingreso usa autenticidad criptográfica y no una sesión.
- No hay llamadas de red a Meta, Shopify, Wompi o Mastershop.
