# Contrato API de tarifas de transporte v1

Base: `/operations/organizations/:organizationId/transport-rates`. Todos los endpoints requieren
Bearer token, coincidencia de tenant y responden `Cache-Control: no-store`.

## Crear política

`POST /policies`, permiso `transport-rates.manage` para owner/admin y cabecera `Idempotency-Key` de
8 a 200 caracteres. Cuerpo:

```json
{
  "currency": "COP",
  "storeId": "uuid-opcional",
  "rules": [
    {
      "ruleKey": "bogota-base",
      "priority": 100,
      "amountMinor": 12000,
      "city": "Bogotá",
      "department": "Cundinamarca",
      "shopifyProductId": "gid://shopify/Product/1",
      "validFrom": "2026-07-14T00:00:00-05:00",
      "validTo": "2026-08-14T00:00:00-05:00"
    }
  ]
}
```

Se admiten 1 a 200 reglas, claves únicas, prioridad 0..10000 e importe entero 1..1000000000 en
unidades menores. Los selectores y fechas son opcionales.

## Activar política

`POST /policies/:policyId/activate`, mismo permiso y cabecera idempotente. Solo activa una política
del tenant; la versión activa anterior del mismo alcance queda desactivada.

## Previsualizar

`POST /preview`, permiso `transport-rates.resolve` para owner/admin/operations:

```json
{ "orderId": "uuid", "evaluatedAt": "2026-07-14T12:00:00-05:00" }
```

`evaluatedAt` es opcional. No persiste decisión ni modifica el pedido.

## Resolver

`POST /orders/:orderId/resolve`, permiso `transport-rates.resolve` y `Idempotency-Key`. Solo admite un
pedido COD real del tenant. Persiste exactamente una decisión por efecto lógico y retorna el mismo
resultado ante replay de la misma clave. Una clave nueva encuentra la decisión durable y devuelve
`outcome: replayed` sin duplicar outbox ni actualización monetaria.

Entradas inválidas retornan 400, autenticación inválida 401, permisos/tenant 403 y ausencia o
ambigüedad de tarifa falla cerrada. No se exponen detalles SQL, secretos ni claves idempotentes.
