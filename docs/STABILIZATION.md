# LCM-STAB-001 — Checklist de estabilización

| Área | Estado | Nota |
| --- | --- | --- |
| Environment | DONE | Copia operativa fuera de OneDrive en `C:\Users\Ever\Documents\Codex\la-casa-del-material`; `C:\dev` no permitió escritura. |
| Git safety | DONE | Historial preservado, árbol limpio y rama `stabilization/lcm-019`; cambios visuales ya estaban en `c0327bb`. |
| Web build/tests | BLOCKED_EXTERNAL | Lint pasa; Vitest y Angular/esbuild no pueden enumerar `../../../../..` por restricción del entorno Codex. Reanudar con Node 20/22 en una terminal normal: `npm ci && npm run lint && npm test && npm run build`. |
| Docker | TODO | Diagnóstico pendiente fuera de OneDrive. |
| Trips web | TODO | Rutas y pantallas pendientes de auditoría. |
| Sale → Trips | TODO | Integración pendiente de auditoría. |
| TripLoad atomicity | TODO | Cancelación conjunta pendiente. |
| TripLoad UX | TODO | Cantidades y capacidad pendientes. |
| Fuel UX/tests | TODO | Etiquetas y cobertura pendientes. |
| DynamoDB integration | TODO | Suite real pendiente. |
| DynamoDB concurrency | TODO | Casos concurrentes pendientes. |
| DynamoDB indexes | TODO | Scans operativos pendientes de sustitución. |
| Navigation | TODO | Reportes y funciones futuras pendientes de revisión. |
| E2E | TODO | Smoke logístico pendiente. |
| Final verification | BLOCKED_EXTERNAL | La fase web impide continuar de forma validable a fases posteriores en esta sesión. |

Estados permitidos: `TODO`, `DONE`, `BLOCKED_EXTERNAL`.

## LCM-020-UX-001

Repository moved to:
`C:\Users\Ever\Documents\Codex\la-casa-del-material-lcm-020-ux-001`

La ruta preferida `C:\dev\la-casa-del-material` no pudo crearse por permisos. La copia está fuera de OneDrive, conserva `.git`, código, documentación, `package-lock.json` y cambios locales, y excluyó `node_modules`, `dist`, `.angular` y `coverage`. `npm ci` finalizó correctamente. Web lint pasa después de compilar contracts, pero Vitest y Angular/esbuild continúan fallando con `Cannot read directory "../../../../..": Access is denied` por una restricción externa del entorno.

Next action:
Open Codex in `C:\Users\Ever\Documents\Codex\la-casa-del-material-lcm-020-ux-001` with Node 20/22 and rerun LCM-020-UX-001 validations before continuing UI changes.

Synchronization:
Los cambios de LCM-020-UX-001 fueron reflejados nuevamente en el repositorio principal `C:\Users\Ever\OneDrive\Escritorio\Git\LaCasaDelMaterial`. La copia externa se conserva para ejecutar validaciones sin depender de OneDrive.
