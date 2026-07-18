# Activación Shopify live

## Precondiciones

1. Tienda development autorizada y token con `read_orders`, `write_orders`, `read_inventory` y
   `read_locations`, además del permiso necesario para administrar webhooks.
2. Secreto de firma de la app en secret manager; nunca en Git, ticket, chat o log.
3. Callback HTTPS público que termine en
   `/webhooks/shopify/{storeId}/orders-create` y conserve el cuerpo crudo.
4. `SHOPIFY_CREDENTIAL_KEYS_JSON` y versión activa cargados desde secret manager.

## Secuencia

1. Mantener todos los kill switches cerrados y configurar `SHOPIFY_SIMULATION_MODE=false` junto con
   modos componentes coherentes.
2. Registrar tienda y secreto mediante API owner/admin; comprobar que la respuesta diga `mode=live`.
3. Abrir integración y ejecutar `POST .../{storeId}/test`. Debe quedar `healthy/tested` y registrar las
   capacidades orders/inventory/locations.
4. Abrir webhooks/order sync, activar la tienda y comprobar que se guardó el ID técnico de la
   suscripción, nunca la URL o secreto.
5. Crear un pedido de prueba, verificar webhook 202, outbox procesado, pedido normalizado y
   reconciliación sin faltantes.
6. Probar 429/5xx en sandbox o proxy controlado y confirmar retry/backoff sin token en logs.
7. Probar `MARK`. Probar `CANCEL` solo con aprobación humana, pedido descartable y
   `SHOPIFY_ORDER_CANCEL_ENABLED=true`; volver a cerrarlo inmediatamente.
8. Rotar el secreto, entregar una firma con secreto anterior dentro de la ventana y confirmar rechazo
   después del deadline.

## Contención

Cerrar primero `SHOPIFY_ORDER_ACTIONS_KILL_SWITCH`, luego webhooks/sync/reconciliación según el fallo.
No borrar checkpoints ni outbox. Una cancelación Shopify no se revierte; escalarla como incidente. Para
credencial comprometida, rotar token/secreto y clave envelope, revocar el valor anterior en Shopify y
repetir test/activación.
