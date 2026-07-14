# Contrato de consulta y normalización de pedido Shopify

Estado: `simulation/v1`.

## Entrada del proveedor

`ShopifyProvider.fetchOrder` recibe:

- `accessToken`: descifrado únicamente dentro del worker y nunca registrado;
- `shopDomain`: dominio canónico de la tienda activa;
- `orderId`: identificador técnico extraído del webhook verificado.

El resultado es tratado como `unknown` y debe superar el normalizador Zod v1. El mock solo devuelve
`shopify-orders-create.v1.json` cuando el identificador coincide y el token no está en su lista de
fallos sintéticos.

## Contrato mínimo del fixture v1

- `_fixture.synthetic=true`, `_fixture.version=v1` y `test=true`;
- identificadores de pedido, checkout, cliente, dirección, línea, producto y variante;
- `created_at`, `updated_at`, moneda ISO y montos decimales como strings;
- cliente con email normalizado y teléfono E.164;
- dirección con país ISO-2;
- entre 1 y 500 items, cantidad positiva;
- la ecuación `subtotal - descuentos + impuestos + transporte = total` debe cerrar.

## Salida durable

Se persisten `customers`, `customer_addresses`, `orders` y `order_items`. Los montos se convierten a
unidades menores `BIGINT`. Cada sincronización efectiva emite `shopify.order.synchronized.v1` con
solo IDs internos, tienda, proveedor, modo y versión del fixture.

Errores de contrato, moneda, recurso inexistente o flags cerrados fallan el job, siguen el retry
acotado existente y terminan en DLQ al agotar intentos.
