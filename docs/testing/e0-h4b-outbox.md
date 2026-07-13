# Evidencia de pruebas E0-H4B

Actualizado: 2026-07-12

`pnpm outbox:verify` usa PostgreSQL y Redis reales con recursos temporales. Cubre:

- commit atómico de agregado, snapshot idempotente y outbox;
- dos solicitudes concurrentes con una sola organización/evento;
- replay por respuesta perdida y conflicto si cambia el payload;
- rollback completo ante constraint inválido;
- dos publishers concurrentes sin job duplicado;
- conexión Redis inaccesible con fallo rápido y posterior recuperación;
- dos intentos del consumidor, registro durable y envío final a DLQ.

La migración se valida aparte con `pnpm database:verify`, incluyendo base vacía, reaplicación no-op y
`migrate diff` sin drift. El quality gate completo continúa siendo `pnpm validate`.
