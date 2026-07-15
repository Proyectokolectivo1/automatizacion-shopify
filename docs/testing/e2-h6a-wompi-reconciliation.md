# Evidencia E2-H6A

Actualizado: 2026-07-14

`pnpm wompi:verify` cubre ejecución consistente, advisory lock concurrente, replay, checkpoint diario,
divergencia local/authoritative, ausencia de evento aceptado, deduplicación, resolución, caída y
recuperación del proveedor, diferencia financiera, tenant isolation y ausencia de autocorrección.

`pnpm database:verify` despliega las 18 migraciones dos veces desde una base vacía y valida FKs
tenant-safe, huellas únicas, ventanas, conteos y consistencia `OPEN/RESOLVED`.

Los fixtures son sintéticos. No se usaron credenciales, PII, Wompi sandbox ni tráfico externo.
