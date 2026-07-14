# Runbook: webhooks Shopify simulados

## Habilitación local controlada

1. Mantener `SHOPIFY_SIMULATION_MODE=true` y configurar el keyring fuera de Git.
2. Registrar/probar una tienda simulada.
3. Configurar el secreto sintético con el endpoint autenticado e idempotente.
4. Activar la tienda.
5. Habilitar `SHOPIFY_WEBHOOKS_ENABLED=true`, desactivar su kill switch y conservar simulación.
6. Firmar los bytes exactos del fixture v1 y enviar los headers del contrato.

## Diagnóstico

- 401: verificar bytes exactos, secreto, base64 y dominio; nunca imprimir el secreto/HMAC.
- 404: confirmar tienda, conexión, salud, activación y secreto configurado.
- 409: el ID ya existe con otro hash; investigar productor, no generar otro efecto manualmente.
- 413: reducir payload o revisar el límite; no aumentarlo sin evaluación de memoria/DoS.
- Outbox `failed`: Redis no disponible; el webhook ya está en PostgreSQL. Restaurar Redis y dejar que
  el backoff lo publique.
- `dead_letter`: usar la operación DLQ autenticada y el runbook de outbox; no editar DB.

## Contención

1. Activar `SHOPIFY_WEBHOOKS_KILL_SWITCH=true`.
2. Mantener PostgreSQL y evidencia; no eliminar eventos fallidos.
3. Si el secreto se comprometió, preparar rotación y solicitar autorización humana antes de cambiarlo.
4. La suscripción remota no existe en E1-H2A; no ejecutar acciones en Shopify.
