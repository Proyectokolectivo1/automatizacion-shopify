# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1, E0-H2, E0-H3 y E0-H4A están
completas. No reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. Los nueve archivos de control del repositorio.

## Baseline obligatorio

Revisa Git, Node/pnpm/Docker y ejecuta:

```bash
pnpm install --frozen-lockfile
pnpm validate
pnpm test:integration
pnpm database:verify
pnpm database:status
pnpm observability:verify
pnpm audit --prod
pnpm infra:verify
```

No borres volúmenes ni uses `docker compose down -v`.

## Siguiente vertical exacta: E0-H4B

Implementa una vertical técnica pequeña y demostrable para outbox y colas:

- lifecycle Prisma integrado en NestJS sin conexiones globales duplicadas;
- transacción real que persista un agregado de prueba y su outbox de forma atómica;
- claim concurrente seguro de eventos disponibles, sin doble publicación;
- BullMQ con Redis, nombres/versiones de jobs y propagación de correlation ID;
- reintentos acotados, backoff, DLQ y error redacted;
- idempotencia ante duplicado y respuesta perdida;
- feature flag del publisher, modo simulación y kill switch;
- pruebas PostgreSQL/Redis reales para commit, rollback, concurrencia, caída y recuperación;
- métricas, runbook, contrato y migración expand-only adicional si resulta necesaria.

No implementes todavía pedidos ni proveedores externos. Mantén pendiente E0-H3B: OpenTelemetry,
alertas conectadas y restricción productiva de `/metrics`. Bloqueos: Shopify/Wompi/Meta por
credenciales, Mastershop por proveedor e impresión por inventario. MinIO comunitario sigue prohibido
para producción. No despliegues ni ejecutes operaciones destructivas.
