# Registro de conexiones WhatsApp simuladas

Actualizado: 2026-07-14

## Alcance E3-H1A

La vertical configura un canal WhatsApp por tienda, prueba su contrato mediante un proveedor
determinista y permite activar, desactivar y rotar el token. No envía mensajes, registra plantillas,
crea webhooks ni llama Meta.

## Diseño

- `IntegrationConnection` conserva el ownership organización/tienda y `provider=WHATSAPP`.
- `config_json` contiene `businessAccountId`, `phoneNumberId`, `apiVersion`, `fixtureVersion` y
  `mode=simulation`; PostgreSQL valida la forma y evita reutilizar un `phoneNumberId` entre tenants.
- El token se persiste exclusivamente como sobre AES-256-GCM con keyring versionado y AAD
  `whatsapp:organizationId:storeId:access-token`.
- `WhatsAppProvider` define el límite de proveedor; únicamente `WhatsAppMockProvider` está vinculado.
- Cada mutación usa idempotencia durable, transacción serializable, advisory lock, auditoría, métrica
  y evento outbox sin token.
- Activar exige una prueba saludable. Desactivar o activar el canal nunca modifica el estado global
  de la tienda Shopify.

## Estados

`PENDING → TESTED → ACTIVE → DISABLED`. Una prueba inválida produce `ERROR`; rotar el token vuelve a
`PENDING`, limpia la salud y exige probar de nuevo.

## Límites

La versión Graph se almacena como configuración y no implica compatibilidad real. El adaptador y las
credenciales Meta siguen `BLOQUEADO_POR_CREDENCIALES`; la aprobación de plantillas pertenece a E3-H2.
