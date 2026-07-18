# Runbook — bandeja WhatsApp simulada

## Controles

```text
WHATSAPP_INBOX_ENABLED=false
WHATSAPP_INBOX_KILL_SWITCH=true
WHATSAPP_INBOX_SIMULATION_MODE=true
```

Para una prueba local controlada habilite además la integración WhatsApp simulada y mantenga Meta
real desconectada. Conceda acceso mediante roles; no agregue bypasses por usuario.

## Diagnóstico

- 400: cursor, filtro, límite o UUID inválido; descarte el cursor y reinicie la página.
- 403: rol sin `whatsapp-conversations.read`; no eleve READ_ONLY/FINANCE/LOGISTICS ad hoc.
- 404: tienda o conversación inexistente/ajena; preserve la respuesta no reveladora.
- 503: integración/inbox cerrados, modo real no soportado, keyring ausente o descifrado fallido.
- `contentState=expired`: comportamiento esperado; no consulte directamente el ciphertext.

Observe `ecommerce_api_whatsapp_inbox_operations_total{action,outcome}`. Audite acciones
`whatsapp.inbox.*` sin agregar el contenido a metadata. Valide con `pnpm whatsapp:verify` y
`pnpm validate`. Ante exposición active el kill switch y revoque sesiones afectadas.
