# Evidencia E2-H3A

`pnpm wompi:verify` cubre checksum/property order, checkout, intención, RBAC/tenant, aprobación authoritative, replay concurrente, monto discordante y firma inválida. `pnpm database:verify` aplica 15 migraciones desde vacío, repite deploy y verifica cero drift. `pnpm validate` cubre formato, lint, tipos, unitarias y builds.

Todo usa host `.invalid`, secretos sintéticos y bases efímeras; no existe tráfico Wompi real.
