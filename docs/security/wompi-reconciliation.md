# Seguridad de conciliación Wompi

Actualizado: 2026-07-14

- Fail-closed: proveedor, reconciliación, simulación y kill switches deben permitir la ejecución.
- No se almacenan cuerpos authoritative, referencias, transaction IDs, URLs, firmas ni secretos en
  reportes, incidencias, auditoría o alertas.
- Todas las claves foráneas críticas incluyen organización y tienda.
- La huella de deduplicación usa únicamente UUID interno y tipo de diferencia.
- Una diferencia nunca muta la intención, el pedido ni el último evento aceptado.
- El checkpoint avanza únicamente al finalizar una comparación completa.
- Wompi real continúa `BLOQUEADO_POR_CREDENCIALES`; habilitar estos flags no autoriza tráfico real.
