# Evidencia E2-H4A

`pnpm wompi:verify` cubre agenda exacta +8/+16, máximo dos, carrera del scheduler, replay sin efectos,
outbox único, cancelación al aprobar y cancelación por vencimiento. `pnpm database:verify` aplica 16
migraciones desde vacío y valida secuencias/estados. `pnpm validate` cubre formato, lint, tipos,
unitarias y builds.

No existe envío WhatsApp ni tráfico Wompi real; el outbox usa exclusivamente `mode=simulation`. La
evidencia posterior de vencimiento se documenta en `e2-h5a-payment-expiration.md`.
