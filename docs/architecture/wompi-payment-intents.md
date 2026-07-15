# Intenciones Wompi simuladas

E2-H2A crea una intención local para cobrar únicamente el transporte de pedidos COD que permanecen
en `PENDING_TRANSPORT_PAYMENT`. El pedido debe tener tarifa positiva y una decisión de tarifa durable
por el mismo importe.

`PaymentIntentService` depende de `WompiProvider`. El binding actual es `WompiMockProvider`, que
concatena referencia + monto + COP + expiración ISO + secreto sintético y calcula SHA-256 en servidor.
Construye los parámetros del Web Checkout oficial sobre `checkout.wompi.simulated.invalid`; el dominio
reservado nunca dirige a Wompi ni procesa dinero.

Un lock por organización/pedido y la idempotencia serializable permiten una sola intención pendiente.
La intención y `payment.intent.created.v1` se persisten atómicamente. Una segunda clave devuelve la
intención viva; una intención vencida falla cerrada hasta E2-H5, sin cambiar estados silenciosamente.

El adaptador real futuro deberá separar la persistencia y cualquier I/O externo mediante outbox; no
reutilizará la llamada local dentro de la transacción.
