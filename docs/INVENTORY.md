# Mantenimiento de inventario

InventoryMovement = historical source of truth. InventoryBalance = operational projection.
Las utilidades requieren las variables de conexión DynamoDB del proyecto (.env local o entorno).
No arrancan automáticamente ni modifican movimientos existentes. Ejecútelas desde la raíz:

```powershell
npm run build --workspace @lcm/contracts
npm run inventory:backfill-receipts
npm run inventory:backfill-receipts
npm run inventory:verify
npm run inventory:rebuild-balances
npm run inventory:verify
```

- Backfill verifica recepciones confirmadas y su relación línea/lote antes de crear movimientos. Cada escritura reserva condicionalmente la fuente y actualiza saldo en la misma transacción. Repetir es seguro; se reportan creados/omitidos e inconsistencias.
- Rebuild recalcula cada saldo desde el ledger con lectura fuerte y control de versión. Incluye balances sin movimientos (proyección cero). Repetir conserva cantidades, aunque avanza versión/auditoría. Nunca cambia el ledger.
- Verify es de solo lectura. Comprueba suma por producto, relación 1:1 línea/lote/movimiento, cantidades, costos y fuentes huérfanas. Reporta IDs y retorna código 1 cuando hay problemas.
- Para una auditoría completa, ejecutar en una ventana sin recepciones. Si detecta cambios concurrentes, repetir; no interpreta un recorrido concurrente como una instantánea transaccional.
- Un saldo proyectado alterado puede repararse con rebuild. Fuentes ambiguas o lotes incompletos se reportan y requieren diagnóstico; no se inventan movimientos ni se borran históricos.

Prueba aislada contra DynamoDB Local (crea y elimina exclusivamente tablas lcm-test-* con UUID):

```powershell
$env:DYNAMODB_TEST_ENDPOINT='http://localhost:8000'
npm run test:dynamodb --workspace @lcm/api
```

Solo PURCHASE_RECEIPT está habilitado. Ajustes manuales, salidas, FIFO y consumo por lote quedan pendientes. El detalle de movimientos es de solo lectura y respeta inventory.costs.read.
