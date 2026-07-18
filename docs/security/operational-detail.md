# Seguridad de detalle operativo E6-H6A

- OWNER, ADMIN y OPERATIONS poseen `operations.detail.read`; los demás roles fallan con `403`.
- API y BFF derivan organización desde la sesión; un tenant del navegador nunca es aceptado.
- AES-256-GCM autentica y oculta UUID/tipo/tenant; AAD versionado evita reutilización entre usos.
- Referencias expiran en 15 minutos y se rechazan al alterarse, expirar o cambiar de organización.
- El replay dentro del TTL solo repite una lectura autorizada y `no-store`; no existe mutación.
- Todas las proyecciones usan `select`/allowlist. No se leen columnas JSON libres ni PII.
- Auditoría registra tipo y tamaño de timeline, nunca IDs; Prometheus solo etiqueta `outcome`.
- `OPERATIONAL_DETAIL_ENABLED` y `OPERATIONAL_DETAIL_KILL_SWITCH` fallan cerrados.
- Producción exige `WEB_DETAIL_REFERENCE_KEY` base64url de 32 bytes desde secret manager.
