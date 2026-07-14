# Registro de integraciones Shopify

## Alcance E1-H1A

El módulo registra tiendas y credenciales, prueba el ciclo de vida mediante un proveedor simulado y
mantiene la conexión real apagada. No recibe webhooks, no sincroniza pedidos y no realiza tráfico de
red.

`ShopifyIntegrationService` depende de `ShopifyProvider`; actualmente el único binding es
`ShopifyMockProvider`. Esta inversión permite incorporar el adaptador GraphQL real sin acoplar el
dominio. Shopify documenta el dominio permanente `myshopify.com` como identificador estable y la
autenticación del Admin API mediante `X-Shopify-Access-Token`: [Shop API](https://shopify.dev/docs/api/customer-account-ui-extensions/latest/target-apis/order-apis/shop-api)
y [GraphQL Admin API](https://shopify.dev/docs/api/admin-graphql/latest).

## Flujo

1. Owner/admin envía dominio, metadata y token con clave idempotente.
2. El dominio se normaliza y se restringe a un único host `*.myshopify.com`; esquemas, rutas, puertos,
   IP y sufijos adicionales se rechazan antes de persistir.
3. Se genera el UUID de tienda y se cifra el token con AES-256-GCM, nonce aleatorio y AAD compuesto
   por proveedor, organización y tienda.
4. Una transacción serializable crea `stores`, `integration_connections`, snapshot idempotente y
   auditoría. Un advisory lock acota carreras por tenant/recurso.
5. La prueba de conexión descifra solo en memoria y usa el fixture versionado. Activar exige el último
   resultado saludable; rotar credenciales vuelve a `pending/unknown`.

La FK compuesta `(organization_id, store_id)` impide asociaciones entre tenants. La unicidad global
del dominio impide registrar la misma tienda Shopify en dos organizaciones.

## Controles operativos

- `SHOPIFY_INTEGRATIONS_ENABLED=false`.
- `SHOPIFY_INTEGRATIONS_KILL_SWITCH=true`.
- `SHOPIFY_SIMULATION_MODE=true`.
- Si el modo simulación se apaga, este módulo falla cerrado porque el proveedor real no existe.

Rollback: desactivar los endpoints mediante kill switch. La migración es expand-only; no debe
eliminarse en un entorno compartido y se corrige hacia adelante.
