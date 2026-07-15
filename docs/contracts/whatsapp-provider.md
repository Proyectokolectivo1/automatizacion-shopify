# Contrato WhatsAppProvider v1

Actualizado: 2026-07-14

## Operación implementada

`testConnection` recibe token, `apiVersion`, `businessAccountId` y `phoneNumberId`. Devuelve salud,
modo, versión del fixture y etiquetas sintéticas del negocio/teléfono. Nunca devuelve el token.

El mock v1 es determinista para la misma entrada y reconoce `mock-whatsapp-invalid-token` como
credencial no saludable. Todos sus identificadores y resultados son sintéticos.

## API administrativa

- `POST /integrations/organizations/:organizationId/whatsapp/stores/:storeId`: configurar.
- `POST .../:storeId/test`: probar credencial/configuración.
- `POST .../:storeId/activate`: activar después de una prueba saludable.
- `POST .../:storeId/deactivate`: desactivar solo el canal.
- `PATCH .../:storeId/credentials`: rotar token y volver a `PENDING`.

Todas exigen Bearer, permiso `integration.manage`, coincidencia de tenant e `Idempotency-Key`.

## Contrato real pendiente

Antes de implementar el adaptador real se debe contrastar nuevamente la documentación oficial,
fijar versión Graph soportada, scopes, códigos de error/rate limit y sandbox. Como referencia primaria
se conserva el repositorio oficial de ejemplos de Meta:
<https://github.com/fbsamples/whatsapp-api-examples>.
