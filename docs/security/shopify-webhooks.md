# Seguridad de webhooks Shopify

## Controles

- Parser binario dedicado: HMAC-SHA256 se valida antes de `JSON.parse`.
- Digest esperado y recibido se comparan con `timingSafeEqual` y longitud exacta.
- El secreto usa un sobre AES-256-GCM distinto al access token y AAD por tenant/tienda/propósito.
- Tienda, conexión, dominio y secreto deben coincidir y estar activos.
- Topic allowlist, fixture sintético versionado y límite de body.
- Replay idéntico no repite efecto; replay conflictivo se rechaza.
- DB impone tenant FK, formato de hash, proveedor y unicidad.
- Logs/auditoría/métricas excluyen HMAC, secreto, dominio completo y payload.

## Timestamp y eventos tardíos

`X-Shopify-Triggered-At` debe ser una fecha válida y se conserva en UTC. No se rechaza por antigüedad
en este borde porque la especificación exige tolerar eventos tardíos; las reglas de orden temporal se
aplicarán en la máquina de estados y conciliación.

## Controles cerrados por defecto

- `SHOPIFY_WEBHOOKS_ENABLED=false`
- `SHOPIFY_WEBHOOKS_KILL_SWITCH=true`
- `SHOPIFY_WEBHOOKS_SIMULATION_MODE=true`
- `SHOPIFY_WEBHOOKS_MAX_BODY_BYTES=262144`

No colocar secretos en `.env.example`, fixtures, comandos versionados ni GitHub Actions.
