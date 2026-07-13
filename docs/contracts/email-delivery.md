# Contrato de entrega de correo

Actualizado: 2026-07-13

El adaptador admite invitaciones y recuperación de contraseña sin asumir proveedor. Sus estados son `blocked` cuando está desactivado o el kill switch está activo y `simulated` con un identificador no sensible en simulación. El modo real sin proveedor falla cerrado con 503.

La simulación conserva fixtures efímeros en memoria para pruebas de contrato; no expone endpoint HTTP, no escribe tokens en logs y desaparece al reiniciar el proceso. Ningún token se persiste en claro: PostgreSQL conserva SHA-256.

Valores por defecto: `EMAIL_DELIVERY_ENABLED=false`, `EMAIL_KILL_SWITCH=true` y `EMAIL_SIMULATION_MODE=true`. No se realiza conexión externa ni existen credenciales. El correo real permanece `BLOQUEADO_POR_DECISION` por DP-001 hasta seleccionar dominio/proveedor y contrastar el adaptador con documentación oficial.
