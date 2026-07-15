# Runbook — estados WhatsApp simulados

## Controles

Mantenga por defecto:

```text
WHATSAPP_WEBHOOKS_ENABLED=false
WHATSAPP_WEBHOOKS_KILL_SWITCH=true
WHATSAPP_WEBHOOKS_SIMULATION_MODE=true
```

Para una prueba local controlada, habilite integración y webhooks, desactive ambos kill switches y
configure el secreto sintético mediante la API protegida. Nunca reutilice el token de envío.

## Diagnóstico

- 401: firma ausente/incorrecta; rote el secreto de forma auditada y regenere el HMAC del raw body.
- 404: conexión no activa/saludable o secreto ausente; no consulte identificadores de otro tenant.
- 409: el mismo ID externo llegó con otro hash; trate el evento como colisión, no como replay.
- 503: flag, modo o kill switch cerraron el ingreso.
- `ignored_out_of_order`/`ignored_terminal_state`: revise historial; no edite el mensaje en SQL.

Observe `ecommerce_api_whatsapp_status_webhooks_total{outcome}` y los eventos outbox
`whatsapp.message.simulated-status-updated.v1`. Valide con `pnpm whatsapp:verify`,
`pnpm database:verify` y `pnpm validate`.

Ante duda active el kill switch. La activación Meta real requiere credenciales, contrato oficial
revalidado, sandbox y un release explícito; este runbook no autoriza tráfico real.
