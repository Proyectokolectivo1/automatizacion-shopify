# Contrato API de registro Shopify simulado

Base: `/integrations/organizations/:organizationId/shopify/stores`. Todos los endpoints exigen
Bearer token, permiso `integration.manage`, coincidencia de organización y header `Idempotency-Key`
de 8 a 200 caracteres. Solo owner/admin poseen el permiso.

## Operaciones

- `POST /`: registra tienda. Body: `name`, `displayName`, `shopDomain`, `accessToken`, `timezone` y
  `currency`. Devuelve 201.
- `POST /:storeId/test`: ejecuta el contrato del mock y devuelve 200.
- `POST /:storeId/activate`: requiere prueba saludable y devuelve 200.
- `POST /:storeId/deactivate`: desactiva la conexión y devuelve 200.
- `PATCH /:storeId/credentials`: cifra un token nuevo, invalida la salud previa y devuelve 200.

Respuesta mínima:

```json
{
  "storeId": "uuid",
  "shopDomain": "example.myshopify.com",
  "status": "pending|tested|active|disabled|error",
  "health": "unknown|healthy|unhealthy",
  "mode": "simulation"
}
```

Nunca se devuelve token, ciphertext, nonce, tag, versión de clave ni configuración interna. Los
errores usan 400 para entrada inválida/SSRF, 401 sesión, 403 RBAC/tenant de ruta, 404 recurso no
visible, 409 duplicado/transición y 503 controles apagados o keyring inválido.

El mock `v1` es determinista, sin red y siempre marca `mode=simulation`. El token reservado
`mock-invalid-token` produce salud `unhealthy` para probar el fallo contractual.
