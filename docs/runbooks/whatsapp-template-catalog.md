# Runbook — catálogo WhatsApp simulado

## Habilitación local

Configure `WHATSAPP_TEMPLATES_ENABLED=true`, `WHATSAPP_TEMPLATES_KILL_SWITCH=false` y
`WHATSAPP_TEMPLATES_SIMULATION_MODE=true`. Debe existir primero una conexión WhatsApp simulada para
la tienda. Nunca desactive el modo simulación: el servicio falla cerrado.

## Operación segura

1. Cree un borrador con una clave idempotente nueva.
2. Revise cuerpo, variables, evento e idioma; si cambia contenido cree una versión.
3. Registre `APPROVE` o `REJECT`. Ambos son resultados locales simulados.
4. Active únicamente la versión seleccionada. La anterior del mismo evento/idioma se desactiva en la
   misma transacción.
5. Ante un incidente, active el kill switch; no modifique filas manualmente.

Ejecute `pnpm whatsapp:verify`, `pnpm database:verify` y `pnpm validate`. Observe
`ecommerce_api_whatsapp_template_operations_total` y eventos `whatsapp.template.*.v1`.
