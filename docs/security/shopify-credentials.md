# Seguridad de credenciales Shopify

Los access tokens nunca se guardan en texto plano. `encrypted_credentials` contiene exclusivamente
un sobre `{version, iv, authTag, ciphertext}` generado con AES-256-GCM. El AAD
`shopify:{organizationId}:{storeId}:access-token` impide mover el sobre a otro tenant o tienda.

La variable `SHOPIFY_CREDENTIAL_KEYS_JSON` contiene un mapa de claves base64url de exactamente 32
bytes y `SHOPIFY_CREDENTIAL_KEY_VERSION` selecciona la clave de escritura. Ambas se suministran por
secret manager/entorno y están ausentes de `.env.example`. Para rotar:

1. agregar la nueva versión sin retirar la anterior;
2. seleccionar la nueva versión;
3. rotar cada credencial mediante API y volver a probar/activar;
4. confirmar que ningún sobre usa la versión anterior;
5. retirar la clave antigua.

No registrar el keyring, token, dominio completo, body ni sobre. Auditoría y métricas usan acción,
resultado, UUID y `mode=simulation`. La API aplica `Cache-Control: no-store`.

Ante pérdida/corrupción de clave: activar kill switch, no sobrescribir sobres, restaurar la versión
desde el secret manager y verificar una tienda simulada. No existe recuperación desde la base.
