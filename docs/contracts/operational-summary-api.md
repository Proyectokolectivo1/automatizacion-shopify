# Contrato API — resumen operativo v1

Actualizado: 2026-07-17

## Endpoint

`GET /operations/organizations/:organizationId/queue/summary`

Usa el permiso `operations.queue.read`, porque es una proyección menos granular del mismo read model.
Solo owner/admin/operations acceden. La respuesta incluye `Cache-Control: no-store`.

## Query

| Campo     | Regla                                        |
| --------- | -------------------------------------------- |
| `from`    | ISO-8601 con offset, obligatorio e inclusivo |
| `to`      | ISO-8601 con offset, obligatorio y exclusivo |
| `type`    | tipo operacional v1 opcional                 |
| `storeId` | UUID interno de tienda opcional              |

Debe cumplirse `from < to` y la ventana no puede exceder 31 días. Campos desconocidos, UUIDs, fechas,
tipos o rangos inválidos responden `400`.

## Respuesta

```json
{
  "byStatus": [{ "requiresAttention": 3, "status": "open", "total": 4 }],
  "byType": [{ "requiresAttention": 1, "total": 2, "type": "order" }],
  "contractVersion": "v1",
  "filters": { "storeId": null, "type": null },
  "totals": { "requiresAttention": 5, "total": 7 },
  "window": {
    "from": "2026-07-17T04:00:00.000Z",
    "to": "2026-07-17T11:00:00.000Z"
  }
}
```

Sin resultados, los totales son cero y los desgloses son listas vacías. El contrato no expone IDs,
PII, texto, payloads, secretos, prioridad, severidad o SLA.

La disponibilidad reutiliza `OPERATIONAL_QUEUE_ENABLED` y `OPERATIONAL_QUEUE_KILL_SWITCH`; el estado
seguro predeterminado continúa deshabilitado.
