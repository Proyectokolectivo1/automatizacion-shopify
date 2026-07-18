# Runbook del baseline de seguridad E9-H3A

Ejecute desde la raíz, con Git y pnpm disponibles:

```powershell
pnpm security:verify
```

El comando necesita red hacia el advisory DB de pnpm. Éxito significa cero secretos high-confidence,
cero artefactos prohibidos y cero vulnerabilidades productivas high/critical, además de configuración
CI/Compose/web conforme. El reporte agregado queda ignorado en `.artifacts/security`.

Ante `Secret scan encontró`, no copie la coincidencia a tickets ni logs. Revise localmente la ruta y
línea, retire el dato, rote la credencial si fue real y vuelva a ejecutar. Si el secreto llegó a Git,
la eliminación del archivo no basta: rote primero y coordine saneamiento de historial.

Ante fallo de audit por red, no omita el gate: restablezca acceso y repita. Una excepción de seguridad,
un falso positivo o una reducción de controles requiere decisión humana documentada.
