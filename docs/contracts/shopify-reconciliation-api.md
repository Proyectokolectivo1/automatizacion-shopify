# Contrato API de reconciliación Shopify

Base: `/operations/organizations/:organizationId/shopify/reconciliation`.

Todos los endpoints requieren Bearer token, coincidencia de organización y permiso
`reconciliation.manage`. Lo poseen `OWNER`, `ADMIN` y `OPERATIONS`; `READ_ONLY` falla con 403.

## Ejecutar una ventana

`POST /stores/:storeId/run`

```json
{
  "windowStartedAt": "2026-07-14T12:00:00.000Z",
  "windowEndedAt": "2026-07-14T15:00:00.000Z"
}
```

La ventana es semiabierta, debe ser positiva y no superar
`SHOPIFY_RECONCILIATION_MAX_WINDOW_HOURS`. Responde 200 con checkpoint y conteos de señales
detectadas, creadas, repetidas y resueltas.

## Consultar incidencias

`GET /issues?status=OPEN&limit=25`

- `status`: opcional; `OPEN`, `REPROCESSING` o `RESOLVED`.
- `limit`: 1 a 100, 25 por defecto.

La respuesta omite payloads, tokens y datos personales. Expone solo identificadores operativos,
tipo, estado, referencias acotadas, conteos y timestamps.

## Reprocesar una incidencia

`POST /issues/:issueId/reprocess`

Requiere `Idempotency-Key` de 8 a 200 caracteres. Responde 202. Repetir la misma clave devuelve el
mismo resultado; claves concurrentes tampoco duplican efectos porque la incidencia se bloquea en
PostgreSQL. Solo se pueden reprocesar incidencias `OPEN`.

## Errores

- 400: identificador, ventana, filtro o clave inválidos.
- 401/403: sesión o permiso insuficientes.
- 404: tienda o incidencia fuera de la organización.
- 409: ventana inválida o incidencia no reprocesable.
- 503: flag apagado, kill switch activo, modo no simulado o integración no activa.
