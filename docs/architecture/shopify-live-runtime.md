# Runtime Shopify live

Estado: implementación local completa; validación contra tienda development pendiente de credenciales.

`ShopifyProviderRouter` selecciona exclusivamente por `SHOPIFY_SIMULATION_MODE`: el mock conserva los
fixtures v1 y el adaptador live usa Admin GraphQL API fijada en `2026-07`. El health check live consulta
tienda, pedidos, inventario y ubicaciones para demostrar los scopes de lectura requeridos antes de
permitir activación.

El cliente live usa dominio `*.myshopify.com` ya normalizado, `X-Shopify-Access-Token`, timeout de 10 s
y hasta tres intentos para transporte, HTTP 429/5xx y `THROTTLED`. Los errores expuestos contienen solo
categoría, HTTP status o request ID técnico; nunca token, body ni mensaje upstream. Pedidos actualizados
se recorren con cursor, 100 por página. Un pedido pagina line items en bloques de 250, acepta como máximo
500 y falla en vez de truncar; shipping lines se limitan a 20 de forma explícita.

En activación live se consulta la suscripción `ORDERS_CREATE` y solo se crea si no existe la misma URI
HTTPS. El webhook verifica bytes crudos con secreto activo o anterior dentro del overlap, deduplica por
delivery ID y hash, y guarda una proyección sin PII. El secreto anterior vence por defecto en 24 h.

El consumidor de abandono valida evento, tenant, intención `EXPIRED`, política histórica y estado del
pedido. `MARK` añade `transport_payment_abandoned`. `CANCEL` tiene flags propios, no reembolsa, espera el
job asíncrono y solo entonces pasa el pedido local a `CANCELLED`; un replay primero consulta si Shopify
ya lo canceló. El scheduler de reconciliación procesa tiendas activas, reanuda ventana/cursor durable y
detiene una ejecución al máximo configurado de páginas.

Referencias oficiales: [Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql/2026-07),
[orders](https://shopify.dev/docs/api/admin-graphql/2026-07/queries/orders),
[webhookSubscriptionCreate](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/webhookSubscriptionCreate),
[orderCancel](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/orderCancel) y
[límites](https://shopify.dev/docs/api/usage/limits).
