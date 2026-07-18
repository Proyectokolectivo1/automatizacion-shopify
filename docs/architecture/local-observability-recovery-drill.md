# Drill local de observabilidad y recuperación

E9-H5A convierte la prueba runtime existente en un gate autónomo: construye la API, inicia Compose,
usa puerto y credenciales efímeros, inyecta fallos y restaura los servicios en `finally`.

El drill mide dos presupuestos de laboratorio:

- detección local máxima de 15 segundos;
- recuperación local máxima de 30 segundos.

Detener Redis debe producir readiness 503 con las demás dependencias sanas y un único `firing`.
El drill reinicia la API mientras Redis sigue caído y exige que la hidratación no duplique `firing`.
Reiniciar Redis debe recuperar readiness y producir exactamente `resolved`. Detener el Collector no debe
alterar liveness ni terminar la API; al volver, una traza nueva debe aparecer. Correlación W3C,
métricas Bearer, `no-store` y redacción se verifican en el mismo flujo.

Los tiempos incluyen scheduling y operaciones Docker Desktop. Son umbrales de regresión local, no
SLO, SLI ni estimaciones de capacidad productiva. El reporte solo conserva duraciones y booleanos.
