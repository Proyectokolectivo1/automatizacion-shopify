# Contrato API de alertas operativas v1

Base: `/operations/organizations/:organizationId/alerts`. Todos los endpoints requieren Bearer,
tenant idéntico al principal y permiso `operations.alerts.read` (owner, admin u operations). Responden
`Cache-Control: no-store`.

## `GET /alerts/rules`

Devuelve `contractVersion: "v1"` y cinco reglas con:

- `key`, `version` y `type`;
- `condition` y `matchingStatuses`;
- `window.lookbackHours`.

No expone ni inventa severidad o SLA.

## `GET /alerts`

Filtros opcionales estrictos:

- `status=open|resolved`;
- `type` dentro de los cinco tipos operativos;
- `limit=1..100`, predeterminado 20;
- `cursor` opaco, máximo 512 caracteres.

Respuesta:

```json
{
  "contractVersion": "v1",
  "items": [
    {
      "alertId": "uuid",
      "rule": { "key": "order_attention", "version": 1 },
      "type": "order",
      "status": "open",
      "observedCount": 2,
      "window": { "from": "ISO-8601", "to": "ISO-8601" },
      "firstDetectedAt": "ISO-8601",
      "lastDetectedAt": "ISO-8601",
      "lastEvaluatedAt": "ISO-8601",
      "resolvedAt": null
    }
  ],
  "nextCursor": null
}
```

La proyección excluye store/resource IDs, relaciones, nombres, contactos, cuerpos y snapshots. La API
no ofrece endpoints de creación, resolución o reenvío: las transiciones son internas.

Errores: 400 entrada/cursor inválido, 401 sin sesión, 403 rol o tenant, 503 flag/kill switch cerrado.
