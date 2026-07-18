# Ingreso de eventos Wompi

E2-H3A recibe `transaction.updated` únicamente en simulación. Express conserva el cuerpo crudo; el servicio admite solo fixtures `v1`, valida la ventana temporal y el checksum SHA-256 en el orden de `signature.properties`, consulta `WompiProvider.getTransaction` y compara id, referencia, monto, moneda y estado antes de actualizar la intención.

`payment_provider_events` conserva hash, resultado y metadatos redactados. La clave externa derivada de tipo+timestamp+transacción hace el ingreso idempotente; un replay con otro payload se rechaza. La actualización de intención y `payment.intent.status-updated.v1` son atómicas. No cambia el pedido ni confirma logística.
