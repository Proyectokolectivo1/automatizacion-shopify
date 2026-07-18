# ADR-005 — Estados de mensaje WhatsApp exclusivamente simulados

Fecha: 2026-07-14  
Estado: aceptada para E3-H4A

## Contexto

La plataforma necesita probar duplicados, carreras y eventos fuera de orden antes de disponer de una
aplicación Meta, un secreto oficial o mensajes reales. La aceptación local de E3-H3A no permite
inferir envío, entrega o lectura.

## Decisión

- Los estados son `simulated_accepted`, `simulated_sent`, `simulated_delivered`, `simulated_read` y
  `simulated_failed`; ninguno representa evidencia Meta.
- `simulated_read` y `simulated_failed` son terminales. Un terminal nunca se sobrescribe.
- La progresión normal es accepted → sent → delivered → read y puede omitir estados intermedios.
- `failed` puede aplicarse desde accepted/sent, pero no desde delivered/read ni sobre otro terminal.
- Todo evento autenticado conocido genera historial inmutable, incluso si se ignora por ser tardío.
- La autenticación v1 usa un HMAC sintético sobre bytes crudos. Su secreto se cifra con AAD
  `webhook-secret`, separado del token de envío `access-token`.
- El contrato Meta real, su firma y su payload deberán revalidarse antes de habilitar tráfico real.

## Consecuencias

La simulación permite comprobar monotonicidad e idempotencia sin inventar confirmaciones Meta. La
entrega real continúa `BLOQUEADO_POR_CREDENCIALES` y requerirá un adaptador/contrato nuevo o una
versión explícita del ingreso, no una reinterpretación silenciosa de v1.
