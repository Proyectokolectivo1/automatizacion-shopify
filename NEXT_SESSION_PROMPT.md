# Prompt para la siguiente sesión

Continúa directamente en `C:\Users\Usuario\Documents\Automatizacion Shopify`. El proyecto está
`EN_DESARROLLO`; no está listo para piloto ni producción. E0-H1, E0-H2 y E0-H3 están completas. No
reinicies ni reemplaces trabajo válido.

## Fuentes obligatorias

Lee completamente antes de editar:

1. `C:\Users\Usuario\Downloads\ESPECIFICACION_MAESTRA_ECOMMERCE_INTELIGENTE.md`.
2. `C:\Users\Usuario\.codex\attachments\209e3c64-68f0-4f6a-b13b-8485a5bb70d8\pasted-text.txt`.
3. Los nueve archivos de control del repositorio.

## Baseline obligatorio

1. Revisa `git status --short --branch`, herramientas y Docker.
2. Ejecuta `pnpm install --frozen-lockfile`, `pnpm validate`, `pnpm test:integration`,
   `pnpm observability:verify`, `pnpm audit --prod` y `pnpm infra:verify`.
3. No borres volúmenes ni uses `docker compose down -v`.

## Siguiente vertical exacta: E0-H4A

Implementa la primera capa persistente:

- Prisma con versiones exactas y configuración validada;
- migración inicial expand-only;
- tablas `organizations`, `stores`, `idempotency_keys` y `outbox_events`;
- claves foráneas, unicidad, timestamps, estados, restricciones e índices explícitos;
- prueba de migración desde base vacía y reaplicación segura/no-op;
- pruebas de integración de constraints sobre PostgreSQL real;
- documentación de contrato, estrategia de migración y rollback operativo.

No implementes todavía publicador outbox, BullMQ, pedidos, autenticación ni proveedores. Repite todos
los gates y actualiza los nueve archivos de control.

Pendiente E0-H3B: OpenTelemetry, alertas conectadas y restricción productiva de `/metrics`. Bloqueos:
Shopify/Wompi/Meta por credenciales, Mastershop por proveedor e impresión por inventario. MinIO
comunitario está prohibido para producción. No despliegues ni ejecutes operaciones destructivas.
