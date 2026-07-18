# Evidencia E2-H5A

`pnpm wompi:verify` cubre expiración a la hora 24, doble ejecución concurrente, replay, cancelación de
recordatorios, historial de dos transiciones, outbox único, políticas `MARK`/`CANCEL`, aislamiento de
tenant y carrera contra aprobación authoritative. Si una aprobación llega después del estado terminal,
la intención no retrocede y el pedido queda en revisión manual.

`pnpm database:verify` aplica 17 migraciones dos veces desde vacío, exige cero drift, prueba los nuevos
enum values y la coherencia `EXPIRED`/`expired_at`. `pnpm validate` cubre formato, lint, typecheck,
unitarias y builds. No existe tráfico externo ni datos productivos.
