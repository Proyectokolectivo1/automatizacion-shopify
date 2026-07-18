# Arquitectura — cola operativa unificada

Actualizado: 2026-07-17

## Propósito

E6-H1A ofrece una vista operativa de solo lectura sobre hechos que ya pertenecen a los dominios de
pedidos, conciliación Shopify, pagos, conciliación Wompi y conversaciones WhatsApp. No crea una
nueva fuente de verdad ni cambia estados.

## Diseño

La API ejecuta una única consulta PostgreSQL `UNION ALL`. Cada rama aplica `organization_id` antes
de unificar resultados y proyecta exclusivamente:

- tipo e ID interno del elemento;
- tienda interna, estado y fecha operativa;
- indicador y razón enumerada de atención;
- referencia interna relacionada cuando existe.

El orden global es descendente por un timestamp de origen inmutable y por `tipo:uuid`. El cursor
codifica ambos valores, por lo que una inserción posterior no desplaza ni duplica elementos de una
página ya iniciada. Cinco índices tenant+timestamp+UUID sostienen las ramas de lectura.

## Política de atención v1

- Pedido: `invalid_data`, `transport_payment_expired`, `abandono_pago_transporte` o `manual_review`.
- Incidencia Shopify: `open` o `reprocessing`.
- Intención de pago: `error`.
- Incidencia Wompi: `open`.
- Conversación WhatsApp: `open` y sin asignación.

`requiresAttention=true` es el filtro predeterminado. La política es determinista y contractual; no
inventa prioridad, SLA ni severidad. Cambiarla exige versionar el contrato y sus pruebas.

## Límites

La cola no descifra mensajes, carga clientes/direcciones, expone payloads ni consulta proveedores.
Tampoco ejecuta reprocesos o asignaciones. Las mutaciones continúan en los endpoints especializados
con sus permisos, locks e idempotencia propios.
