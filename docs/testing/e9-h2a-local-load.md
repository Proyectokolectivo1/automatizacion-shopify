# Pruebas E9-H2A

Fecha: 2026-07-18.

- Workload: 500 webhooks firmados, concurrencia 25, cuatro publicadores, worker/lote 50 y 50 replays.
- Ingreso final de regresión: 3.562 ms, 140,36 req/s y p95 251 ms.
- Recovery final: backlog inicial 500, drain 7.843 ms y 63,75 pedidos/s.
- Resultado: 500 pedidos `READY_FOR_LOGISTICS`, 1.500 transiciones, cero errores/DLQ y cleanup total.
- Umbrales: >=5 req/s, p95 <=2.500 ms, drain >=2 pedidos/s y <=120.000 ms.

La primera corrida con un publicador agotó 120 s en 230/500. Cuatro publicadores y concurrencia 50
expusieron `P2034`/`TransactionWriteConflict`: 103 jobs terminaron en DLQ. Una corrida diagnóstica de
100 reprodujo el problema en sync/clasificación. Ambos servicios ya tenían advisory lock por pedido;
se cambió a `READ COMMITTED` y cinco reintentos exponenciales. Sus regresiones dedicadas pasaron y el
gate final de 500 completó en 19,47 s de suite.

Los números describen esta estación y datos simulados; no son una garantía de capacidad productiva.
