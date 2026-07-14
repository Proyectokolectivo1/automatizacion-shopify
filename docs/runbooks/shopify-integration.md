# Runbook del registro Shopify simulado

## Verificación

1. Mantener conexión real deshabilitada.
2. Suministrar en un entorno aislado una clave de 32 bytes y su versión.
3. Habilitar `SHOPIFY_INTEGRATIONS_ENABLED=true`, mantener
   `SHOPIFY_INTEGRATIONS_KILL_SWITCH=false` y `SHOPIFY_SIMULATION_MODE=true`.
4. Ejecutar `pnpm shopify:verify`.
5. Confirmar `ecommerce_api_shopify_operations_total` y auditoría sin secretos.

## Incidentes

- Fuga sospechada: kill switch, rotar clave y token en Shopify, luego re-cifrar y probar.
- Salud `unhealthy`: no activar; revisar que se está usando el fixture esperado.
- 503: revisar flags y disponibilidad de todas las versiones del keyring, sin imprimir valores.
- 409 al registrar: comprobar ownership del dominio; no reasignar entre tenants desde SQL.
- Error de descifrado: restaurar la versión correspondiente; nunca sustituir el sobre por plaintext.

## Activación real futura

Requiere credenciales de development store, OAuth/instalación acordada, adaptador separado, timeout,
rate limits, política de reintentos, documentación oficial vigente, pruebas contractuales reales y
aprobación. Hasta entonces el estado es `BLOQUEADO_POR_CREDENCIALES`.
