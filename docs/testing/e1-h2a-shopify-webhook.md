# Evidencia de pruebas E1-H2A

Suite dedicada: `pnpm shopify:webhooks:verify`.

Cobertura funcional:

- secreto cifrado y sin texto plano;
- HMAC válido/inválido y cuerpo alterado;
- HMAC antes de parsear JSON inválido;
- topic/domain no permitidos y body 413 con correlación;
- concurrencia y replay idéntico exactamente una vez;
- replay con mismo ID y distinto hash;
- webhook + outbox atómicos;
- Redis inaccesible, estado failed, recuperación, BullMQ y `PROCESSED`;
- métricas y auditoría sin secreto, HMAC, dominio completo ni payload.

La suite usa PostgreSQL temporal real, Redis local real para recuperación y un puerto Redis
deliberadamente inaccesible para el fallo. El fixture está marcado como sintético y se elimina la base
temporal al finalizar.

Prueba manual reproducible: seguir `docs/runbooks/shopify-webhooks.md`. No usar datos productivos.
