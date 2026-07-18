# Runbook — asignación WhatsApp simulada

Actualizado: 2026-07-17

## Controles

- `WHATSAPP_ASSIGNMENTS_ENABLED=false`
- `WHATSAPP_ASSIGNMENTS_KILL_SWITCH=true`
- `WHATSAPP_ASSIGNMENTS_SIMULATION_MODE=true`

Para pruebas locales se requiere habilitar el feature, abrir el kill switch y conservar simulación.
El ingreso, la bandeja y la integración WhatsApp también deben estar disponibles.

## Diagnóstico

- `409`: refrescar la conversación y reintentar con la versión actual; no reutilizar una clave de
  idempotencia con un cuerpo distinto.
- `404`: comprobar tenant y tienda sin intentar enumerar recursos ajenos.
- `503`: revisar los cuatro grupos de controles antes de tocar datos.
- Membresía revocada/inactiva ya asignada: la revocación normal la libera atómicamente. Si aparece una
  asignación legacy, repetir la revocación con una clave nueva repara la invariante; no editar SQL.

La métrica `ecommerce_api_whatsapp_assignment_operations_total{action,outcome}` permite observar
éxitos, replay, conflictos, denegaciones y fallos sin etiquetas de alta cardinalidad. Correlacionar
con auditoría por IDs internos; nunca copiar contenido de mensajes al incidente.

## Verificación

Ejecutar `pnpm whatsapp:verify`, `pnpm database:verify`, `pnpm validate` y la regresión completa. La
operación es exclusivamente sintética: no habilitar tráfico Meta.
