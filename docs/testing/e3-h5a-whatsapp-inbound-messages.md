# Evidencia E3-H5A — mensajes entrantes WhatsApp simulados

La vertical cubre contrato/fixture estricto, HMAC sobre cuerpo crudo, cifrado de texto, retención
marcada, identidad conocida/desconocida, conversación seudónima, tenant, replay, colisión, carrera,
dedupe por mensaje externo, kill switch, inmutabilidad, redacción, outbox, auditoría y métricas.

```text
pnpm whatsapp:verify  # 17/17
pnpm database:verify  # 14/14, 26 migraciones, cero drift
pnpm validate         # 20 archivos, 69 pruebas, cobertura crítica 100 %, lint/types/builds verdes
```

También quedaron verdes `pnpm test:integration`, todos los gates funcionales previos,
`pnpm infra:verify` y `pnpm observability:verify`. Las migraciones 24/25/26 se aplicaron en la base
local persistente y `pnpm database:status` confirmó 26/26.

No se usaron credenciales, teléfonos, mensajes ni PII reales y no hubo tráfico Meta. El primer
baseline de integración falló porque Docker Desktop estaba detenido; se inició el servicio y la
misma prueba pasó. La fecha contractual fija de Wompi había vencido el día de ejecución y se movió a
2099 para que el fixture siga siendo determinista. `pnpm audit --prod` continúa bloqueado por HTTP
410 del endpoint npm retirado.
