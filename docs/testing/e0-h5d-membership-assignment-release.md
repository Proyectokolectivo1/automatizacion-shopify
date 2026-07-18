# Evidencia E0-H5D — revocación y liberación de asignaciones

Actualizado: 2026-07-18

La prueba de identidad crea dos conversaciones válidamente asignadas y una tercera que compite por
claim mientras dos solicitudes idempotentes revocan la membresía. El estado final exige membresía y
sesiones revocadas, cero conversaciones retenidas por el agente, una sola versión/historia/outbox por
liberación y auditoría agregada sin correo ni clave idempotente. Una conversación del tenant ajeno no
cambia.

La suite de base aplica 33 migraciones desde vacío y prueba que `membership_revoked` solo es válido
para `unassign`, preservando FKs tenant-safe, shape checks e inmutabilidad del historial.

```text
pnpm identity:verify  # 5/5
pnpm whatsapp:verify  # 26/26
pnpm database:verify  # 16/16, 33 migraciones, cero drift
```

No usa credenciales, Meta real, contenido de mensajes ni operaciones fuera de la base aislada.
