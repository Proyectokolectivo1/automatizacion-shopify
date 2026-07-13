# Contrato de entrega de correo

Actualizado: 2026-07-12

El adaptador expone entrega de invitación sin asumir proveedor. Estados: `blocked` cuando está
desactivado o el kill switch está activo; `simulated` con un receipt no sensible en simulación. Modo
real sin proveedor falla cerrado con 503.

Valores por defecto: `EMAIL_DELIVERY_ENABLED=false`, `EMAIL_KILL_SWITCH=true` y
`EMAIL_SIMULATION_MODE=true`. No se realiza ninguna conexión externa, no hay credenciales y el estado
es `BLOQUEADO_POR_DECISION` hasta elegir dominio/proveedor. Los tokens nunca se registran.
