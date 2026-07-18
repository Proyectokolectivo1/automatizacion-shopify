# Seguridad de credenciales WhatsApp

Actualizado: 2026-07-14

- `WHATSAPP_CREDENTIAL_KEYS_JSON` vive fuera de Git y contiene claves base64url de 32 bytes por versión.
- `WHATSAPP_CREDENTIAL_KEY_VERSION` selecciona la versión de escritura; versiones antiguas permanecen
  disponibles durante la rotación.
- AES-256-GCM autentica ciphertext y AAD de proveedor, organización, tienda y propósito.
- API, respuesta idempotente, auditoría, métricas y outbox omiten token y envelope.
- Al rotar, salud y estado vuelven a `UNKNOWN/PENDING`; no se reutiliza una prueba anterior.
- Los identificadores Meta no son secretos, pero se acotan y no se incluyen en auditoría/outbox.
- El sistema falla cerrado si falta keyring, flag, simulación o si el kill switch está activo.

Las credenciales reales no deben incorporarse hasta usar secret manager, validar scopes mínimos y
revocar el PAT de GitHub previamente expuesto (riesgo independiente R-023).
