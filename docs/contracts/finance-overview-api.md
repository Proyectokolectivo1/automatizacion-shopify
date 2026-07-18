# Contrato API — resumen de cartera financiera v1

Actualizado: 2026-07-18.

## Endpoint

`GET /finance/organizations/:organizationId/overview?from=<ISO>&to=<ISO>`

- Bearer obligatorio.
- Permiso `finance.overview.read`: owner, admin y finance.
- `from` inclusivo, `to` exclusivo, ambos ISO con offset y rango máximo 31 días.
- `Cache-Control: no-store`.
- Feature flag `FINANCE_OVERVIEW_ENABLED` y kill switch independiente.

## Respuesta 200

```json
{
  "contractVersion": "v1",
  "mode": "simulation",
  "provider": "wompi",
  "currency": "COP",
  "window": {
    "from": "2026-07-18T00:00:00.000Z",
    "to": "2026-07-19T00:00:00.000Z"
  },
  "totals": {
    "count": 4,
    "amountMinor": "2800000"
  },
  "byStatus": [
    {
      "status": "approved",
      "count": 1,
      "amountMinor": "800000"
    }
  ]
}
```

`amountMinor` es un entero decimal no negativo serializado como string para conservar exactitud más
allá de `Number.MAX_SAFE_INTEGER`. `count` solo se entrega si es un entero seguro. Los estados posibles
son `approved`, `declined`, `expired` y `pending`; no se crean buckets vacíos.

## Semántica y límites

El total representa cartera de intenciones de pago creadas en la ventana, no recaudo bancario,
liquidación, caja, ingreso contable, costo ni utilidad. Solo consulta `provider=wompi`, `currency=COP`
y el tenant autenticado. `mode=simulation` impide presentarlo como evidencia de Wompi real.

- `400`: tenant/fechas inválidos o rango mayor a 31 días.
- `401/403`: sesión, rol o tenant no autorizado.
- `503`: flag apagado, kill switch activo o resultado fuera del contrato seguro.
