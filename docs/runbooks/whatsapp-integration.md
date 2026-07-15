# Runbook de conexión WhatsApp simulada

Actualizado: 2026-07-14

## Activación local

1. Configure un keyring sintético y `WHATSAPP_CREDENTIAL_KEY_VERSION=v1` fuera de Git.
2. Active `WHATSAPP_INTEGRATIONS_ENABLED=true` y `WHATSAPP_INTEGRATIONS_KILL_SWITCH=false`.
3. Mantenga obligatoriamente `WHATSAPP_SIMULATION_MODE=true`.
4. Configure sobre una tienda existente, pruebe y solo después active.

## Detención segura

Cambie `WHATSAPP_INTEGRATIONS_KILL_SWITCH=true`. Las nuevas operaciones administrativas responden
503; los registros durables no se borran.

## Diagnóstico

- 409 al configurar: la tienda ya tiene canal o el `phoneNumberId` pertenece a otra conexión.
- 409 al activar: falta prueba saludable después de la última rotación.
- 404: conexión ausente dentro del tenant autenticado; no revela recursos ajenos.
- 503: controles cerrados, keyring ausente/incorrecto o envelope no descifrable.
- Métrica: `ecommerce_api_whatsapp_operations_total{action,outcome}`.

## Verificación

Ejecute `pnpm whatsapp:verify`, `pnpm database:verify` y `pnpm validate`. La activación real requiere
credenciales Meta, verificación contractual y autorización separada; este runbook no habilita tráfico.
