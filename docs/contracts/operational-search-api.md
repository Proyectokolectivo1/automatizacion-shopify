# Contrato de búsqueda operativa E6-H5A

`GET /operations/organizations/:organizationId/search` ofrece búsqueda global de solo lectura sobre
el read model operativo v1. Requiere `operations.search.read` y responde `Cache-Control: no-store`.

## Consulta

- `q`: obligatorio, 2 a 80 caracteres, sin caracteres de control. Los espacios se normalizan a `_`.
- `from` y `to`: ISO 8601 obligatorios; ventana `[from,to)` positiva de máximo 31 días.
- `limit`: 20 por defecto, máximo 50.
- `type`, `status` y `requiresAttention`: filtros opcionales con valores cerrados.
- `cursor`: opaco, máximo 768 caracteres y válido únicamente para la consulta y filtros que lo crearon.

Solo son consultables `item_id` exacto cuando `q` es UUID, `item_type`, `status` y
`attention_reason`. El orden es estable: ID exacto, campo exacto, prefijo, contenido; después fecha
descendente y clave interna descendente.

## Respuesta v1

Cada elemento contiene `itemId`, `type`, `status`, `occurredAt`, `requiresAttention`,
`attentionReason` y `matchKind`. El BFF valida esta respuesta y elimina `itemId` y `matchKind` antes
de responder al navegador. No hay tienda, relación, cliente, teléfono, correo, cuerpo, payload,
referencia externa, detalle ni exportación.

La ruta responde `503` salvo que `OPERATIONAL_SEARCH_ENABLED=true` y
`OPERATIONAL_SEARCH_KILL_SWITCH=false`.
