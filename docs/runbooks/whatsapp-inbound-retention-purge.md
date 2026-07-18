# Runbook: purga de contenido inbound

## Controles

```text
WHATSAPP_RETENTION_PURGE_ENABLED=false
WHATSAPP_RETENTION_PURGE_KILL_SWITCH=true
WHATSAPP_RETENTION_PURGE_POLL_INTERVAL_MS=300000
WHATSAPP_RETENTION_PURGE_BATCH_SIZE=100
```

Habilite deliberadamente el flag y abra el kill switch solo después de revisar la política aplicable.
El scheduler ejecuta lotes periódicos y nunca modifica contenido vigente.

## Señales

- `ecommerce_api_whatsapp_retention_purges_total{outcome="purged|noop|skipped|failure"}`;
- auditoría `whatsapp.inbound_content.purged` con `purgedCount` por organización;
- backlog SQL: mensajes inbound vencidos con `encrypted_body_json IS NOT NULL`.

Ante errores, cierre el kill switch y conserve la evidencia. No restaure ciphertext purgado ni cambie
deadlines manualmente. Investigue constraints, locks y conectividad; la siguiente ejecución retoma los
pendientes de forma idempotente.
