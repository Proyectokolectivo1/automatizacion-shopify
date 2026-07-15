# Seguridad de webhooks Wompi

El checksum se compara en tiempo constante y cubre las propiedades declaradas más timestamp y secreto de eventos. Se exige ventana temporal, tamaño máximo y fixture sintético. Nunca se persisten cuerpo, checksum, secreto, checkout URL o PII: solo hashes y campos operativos acotados.

El evento no es authoritative. Incluso con firma válida se consulta el proveedor y se comparan id, referencia, monto, moneda y estado. Firma inválida y divergencias quedan durables como rechazadas.
