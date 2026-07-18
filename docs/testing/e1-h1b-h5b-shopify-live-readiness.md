# Evidencia E1-H1B a E1-H5B

Fecha: 2026-07-18.

Resultado local: gates Shopify verdes sobre PostgreSQL/Redis reales, con Admin GraphQL simulado a nivel
HTTP para no usar credenciales. Se validaron:

- endpoint 2026-07, token header, error redaction, 429 y GraphQL errors;
- health check de orders/inventory/locations;
- consulta de pedido, line items paginados, límite 500 y pedidos sin customer/address;
- listado por ventana/cursor y scheduler que drena/reanuda páginas;
- webhook remoto consulta-before-create y secreto activo/anterior con deadline;
- ingreso simulation existente, replay, HMAC, límites y pipeline outbox sin regresión;
- `MARK`, `CANCEL` sin refund, cancelación ya aplicada y doble gate destructivo;
- gates de registro, webhooks, pedido, clasificación y reconciliación completos.

No validado: scopes reales, suscripción visible en Shopify, entrega firmada real, throttle real y
mutaciones sobre tienda development. Estado: `BLOQUEADO_POR_CREDENCIALES`, no fallo de código local.
