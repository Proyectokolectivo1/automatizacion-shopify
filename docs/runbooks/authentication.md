# Runbook de autenticación

Actualizado: 2026-07-13

Ejecute `pnpm auth:verify` para crear una base temporal, aplicar cinco migraciones, iniciar la API y verificar sesiones, RBAC, invitaciones y recuperación. La suite usa correo simulado y elimina la base al finalizar.

Controles seguros por defecto:

- `AUTH_ACCOUNT_ACTIONS_ENABLED=false`
- `AUTH_ACCOUNT_ACTIONS_KILL_SWITCH=true`
- `EMAIL_DELIVERY_ENABLED=false`
- `EMAIL_KILL_SWITCH=true`
- `EMAIL_SIMULATION_MODE=true`

Para pruebas locales aisladas, habilite las dos features, desactive ambos kill switches y mantenga simulación activa. No active modo real: no existe proveedor. Al fallar entrega de invitación se revoca el token y se devuelve 503; en recuperación se revoca y se conserva la respuesta uniforme 202.

Señales: `ecommerce_api_auth_events_total`, 400/401/403/429/503 y `audit_logs`. Nunca copie tokens/hashes completos a tickets o logs. Ante compromiso, active los kill switches; para sesiones use logout o una operación administrativa auditada futura. El bootstrap del primer owner aún requiere un procedimiento operativo aprobado.

No habilite producción hasta resolver HTTPS, CORS, CSP, cookie/CSRF, proxy confiable, retención/limpieza de tokens y proveedor de correo DP-001.
