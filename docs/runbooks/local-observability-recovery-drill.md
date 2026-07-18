# Runbook del drill local de observabilidad

## Ejecutar

```powershell
pnpm observability:verify
```

El comando construye la API e inicia todas las dependencias. No ejecute el drill contra un entorno
compartido: detiene intencionalmente Redis y el Collector locales.

## Resultado esperado

- readiness degrada solo Redis y vuelve a `ready`;
- el receptor observa `firing,resolved` una sola vez cada uno;
- un reinicio intermedio de API reconstruye el firing activo sin volver a enviarlo;
- liveness continúa durante la caída del Collector y la exportación se recupera;
- detección queda bajo 15 s y recuperación bajo 30 s;
- Redis y Collector terminan saludables y el proceso API/puerto se cierran.

Si falla, conserve el reporte agregado y revise `docker compose ps` y logs redactados. No elimine
volúmenes. Repetir una vez permite distinguir ruido local; no aumente presupuestos sin registrar la
causa. Routing, escalamiento, guardias y SLO productivos requieren una decisión separada.
