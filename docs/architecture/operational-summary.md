# Arquitectura — resumen operativo agregado

Actualizado: 2026-07-17

## Propósito

E6-H2A agrega la proyección E6-H1A para responder cuántos elementos existen y cuántos requieren
atención dentro de una ventana explícita. No crea snapshots, prioridades, SLA ni otra fuente de
verdad.

## Read model compartido

`operational-read-model.ts` contiene la única consulta `UNION ALL`, los cinco tipos, estados y la
política de atención v1. La cola paginada y el resumen importan esa misma definición; cambiar la
semántica exige modificar un único punto y repetir ambas familias de pruebas.

El resumen aplica organización dentro de cada rama, después acota `[from,to)`, tienda y tipo. Una
sola consulta PostgreSQL usa `GROUPING SETS` para producir:

- total y total que requiere atención;
- desglose por tipo;
- desglose por estado.

La ventana máxima es 31 días. Los índices tenant+timestamp+UUID de la migración 28 cubren las cinco
ramas, por lo que E6-H2A no necesita una migración ni realiza N+1.

## Límites

La respuesta solo contiene conteos y enums. No contiene IDs de elementos, clientes, mensajes,
payloads o proveedores. No se persiste el resultado y no se generan alertas ni mutaciones.
