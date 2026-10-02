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
