# Seguridad de operaciones Shopify live

- Live permanece cerrado si integración o componente tiene kill switch activo.
- `SHOPIFY_WEBHOOK_CALLBACK_BASE_URL` debe ser HTTPS cuando live está habilitado.
- Los modos activos de registro, webhooks, sync y reconciliación deben coincidir con el modo global.
- Tokens y secretos se cifran AES-256-GCM con AAD de organización, tienda y propósito separados.
- La rotación de HMAC conserva solo un envelope anterior cifrado y su deadline; no crea una cadena.
- Logs, auditoría, métricas, errores y snapshots de outbox no contienen token, HMAC, dominio ni PII del
  webhook.
- `SHOPIFY_ORDER_CANCEL_ENABLED=false` por defecto. Cancelar requiere además actions enabled y kill
  switch abierto; la acción es irreversible y no configura reembolso automático.
- GraphQL tiene timeout, retry acotado y backoff; no se reenvía el texto de errores que pueda contener
  secretos o datos del comercio.
- El contrato durable limita line items a 500 y falla ante páginas adicionales para evitar pedidos
  parciales con totales aparentemente válidos.

Riesgo residual: hasta ejecutar el runbook en una tienda development no hay evidencia de scopes,
entrega HMAC, rate limit ni mutaciones reales. No habilitar live productivo con pruebas mock solamente.
