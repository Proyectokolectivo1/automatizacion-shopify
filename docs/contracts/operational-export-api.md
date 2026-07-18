# Contrato de export operativo E6-H7A

API interna: `GET /operations/organizations/:organizationId/export`.

- `from`/`to`: ISO 8601 obligatorios, `[from,to)`, máximo 7 días.
- `limit`: 500 por defecto, rango 1..1.000.
- `type`, `status`, `requiresAttention`: filtros opcionales cerrados.
- permiso: `operations.export.read`, solo OWNER/ADMIN.

Respuesta JSON v1: `rows`, `truncated` y `window`. Cada fila contiene exclusivamente
`occurredAt`, `type`, `status`, `requiresAttention`, `attentionReason`; no incluye IDs.

BFF: `GET /api/operations/export`, sin parámetro de tenant. Devuelve CSV con columnas
`occurred_at,type,status,requires_attention,attention_reason`, BOM UTF-8, CRLF, comillas RFC 4180,
`Content-Disposition: attachment`, `no-store` y headers acotados de conteo/truncado.
