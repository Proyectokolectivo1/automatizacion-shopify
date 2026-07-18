# Evidencia E3-H8A: purga inbound

Fecha: 2026-07-18.

`pnpm whatsapp:verify` pasó 26/26 sobre una base PostgreSQL aislada con las 31 migraciones.

La prueba crea contenido inbound vencido y vigente. PostgreSQL rechaza borrar el vigente; el servicio
purga exactamente el vencido, anula ciphertext/fingerprint, fija `content_purged_at`, conserva
`sender_hash` y escribe una única auditoría agregada. Una segunda corrida devuelve cero y no duplica
auditoría. Las métricas `purged`/`noop` aparecen y el timeline continúa sin revelar texto vencido.

La migración 31 es expand-only, añade el índice parcial y reemplaza el trigger de inmutabilidad por una
única excepción irreversible después del deadline. No hubo Meta, PII real, outbox ni despliegue.
