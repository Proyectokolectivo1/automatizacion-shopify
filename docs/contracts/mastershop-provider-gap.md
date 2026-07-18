# Brecha contractual de Mastershop

Estado: `BLOQUEADO_POR_PROVEEDOR`.

Solo se conoce que Mastershop permite importar información de funnels usando una API Key y la URL
del sistema. Esto no define endpoints, métodos HTTP, autenticación exacta, paginación, payloads,
errores, límites, idempotencia, webhooks, sandbox ni ciclo de guías/tracking.

No se inventará un contrato ni se presentará un mock especulativo como integración terminada. Para
desbloquearla se requiere documentación versionada o una colección oficial que incluya:

1. base URL por ambiente y esquema de autenticación;
2. endpoints y schemas de request/response/error;
3. rate limits, timeouts, paginación e idempotencia;
4. creación/anulación de guía, etiqueta y tracking;
5. webhooks, firma, reintentos y orden de eventos;
6. credenciales sandbox y datos de prueba no personales.

Con esa evidencia se implementarán adaptador, simulador, fixtures, pruebas de contrato, feature flag,
modo simulación y kill switch antes de habilitar tráfico externo.
