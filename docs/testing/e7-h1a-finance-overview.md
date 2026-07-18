# Evidencia E7-H1A — resumen financiero local

Actualizado: 2026-07-18.

`pnpm finance:verify` crea una base aislada con las 33 migraciones, inicia la API y ejecuta cuatro
pruebas PostgreSQL/HTTP:

- read-only y tenant ajeno reciben 403;
- cartera Wompi/COP simulada se agrega por estado y total;
- un importe superior a `Number.MAX_SAFE_INTEGER` se conserva exactamente como decimal string;
- auditoría solo guarda conteo y minutos de ventana;
- ventana vacía devuelve ceros; rango vacío o mayor a 31 días recibe 400;
- kill switch activo recibe 503.

Resultado: 4/4. La base temporal y aplicaciones se cierran al terminar. No se contacta Wompi, no se
usan credenciales y no se afirma contabilidad, recaudo, costo o rentabilidad reales.
