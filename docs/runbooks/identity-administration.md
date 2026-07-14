# Runbook de bootstrap y administración de identidad

Actualizado: 2026-07-14

## Bootstrap local del primer owner

El comando no acepta argumentos y solo crea datos cuando la tabla `users` está vacía. Configure las
variables exclusivamente en el entorno efímero del proceso:

```text
IDENTITY_BOOTSTRAP_ENABLED=true
IDENTITY_BOOTSTRAP_KILL_SWITCH=false
IDENTITY_BOOTSTRAP_SECRET=<aleatorio de al menos 32 caracteres>
IDENTITY_BOOTSTRAP_EMAIL=<correo del owner>
IDENTITY_BOOTSTRAP_PASSWORD=<password temporal robusto>
IDENTITY_BOOTSTRAP_ORGANIZATION_NAME=<organización>
```

Ejecute `pnpm identity:bootstrap` desde una terminal local autorizada. El resultado solo indica
`initialized` o `already_initialized`. Retire inmediatamente todas las variables y reactive el kill
switch. No copie el secreto o password a argumentos, historial, tickets o logs. El comando usa lock
advisory y transacción serializable: ejecuciones concurrentes producen un único owner.

## Habilitación administrativa controlada

1. Verifique `pnpm identity:verify` y backups antes de habilitar.
2. Configure `IDENTITY_ADMIN_ENABLED=true` y `IDENTITY_ADMIN_KILL_SWITCH=false`.
3. Reinicie la API y compruebe `/health/ready`.
4. Realice cambios con una `Idempotency-Key` nueva por intención y conserve el correlation ID.
5. Confirme membresía, sesiones revocadas, auditoría `identity.*` y métrica
   `ecommerce_api_identity_operations_total`.
6. Ante actividad inesperada, active `IDENTITY_ADMIN_KILL_SWITCH=true` y reinicie la API.

No edite membresías directamente en SQL salvo recuperación de desastre aprobada. Nunca elimine el
último owner. El procedimiento no habilita registro público, correo real, MFA ni despliegue.
