# Runbook de webhook Wompi

Para simulación habilite Wompi y webhooks, desactive ambos kill switches y mantenga simulation mode. Ejecute `pnpm wompi:verify`. Revise `payment_provider_events`, la métrica `ecommerce_api_payment_intent_operations_total{action="webhook"}` y el outbox ante rechazos.

No active un receptor real sin secreto de eventos sandbox, URL pública TLS, rotación de secretos, prueba de firma oficial y consulta API authoritative. Ante anomalías active `WOMPI_WEBHOOKS_KILL_SWITCH=true`; no corrija estados editando la base manualmente.
