import type { ReceivingRepository } from '../../receiving/domain/receiving.repository.js';
import type { InventoryRepository } from '../domain/inventory.js';
import { safeSum } from '../domain/inventory.js';
import { InventoryService } from './inventory.service.js';
import type { SaleRepository } from '../../sales/domain/sale.repository.js';
import type { Sale } from '../../sales/domain/sale.js';

export class InventoryMaintenance {
  private readonly service: InventoryService;
  constructor(private readonly inventory: InventoryRepository, private readonly receiving: ReceivingRepository, private readonly products?: ProductRepository, private readonly sales?: Pick<SaleRepository, 'list'>) {
    this.service = new InventoryService(inventory);
  }
  async backfill(): Promise<{ created: number; skipped: number; issues: readonly string[] }> {
    const source = await this.receiving.auditSnapshot(); let created = 0; let skipped = 0;
    for (const receipt of source.receipts.filter((item) => item.status === 'CONFIRMED')) {
      for (const line of source.lines.filter((item) => item.receiptId === receipt.id)) {
        const lots = source.lots.filter((lot) => lot.receiptLineId === line.id && lot.receiptId === receipt.id);
        if (lots.length !== 1) continue; // verify reports missing/ambiguous sources; never guess a posting.
        const lot = lots[0]!;
        if (lot.productId !== line.productId || lot.purchaseId !== receipt.purchaseId
          || lot.receivedQuantityBaseInternal !== line.receivedQuantityBaseInternal || lot.directPurchaseCostGuarani !== line.directPurchaseCostGuarani) continue;
        if (await this.service.backfillLot(lot)) created += 1; else skipped += 1;
      }
    }
    return { created, skipped, issues: await this.verify() };
  }
  async rebuild(): Promise<{ rebuilt: number; issues: readonly string[] }> {
    const products = new Set([...(await this.inventory.allMovements()).map((item) => item.productId),
      ...(await this.inventory.allBalances()).map((item) => item.productId)]);
    for (const id of products) await this.service.rebuildBalance(id);
    return { rebuilt: products.size, issues: await this.verify() };
  }
  async verify(): Promise<readonly string[]> {
    const before = await this.inventory.allBalances();
    const movements = await this.inventory.allMovements(); const source = await this.receiving.auditSnapshot();
    const balances = await this.inventory.allBalances(); const issues: string[] = [];
    const totals = new Map<string, number>(); const keys = new Set<string>();
    const saleSources: Sale[] = [];
    if (this.sales) {
      let nextToken: string | undefined;
      do {
        const page = await this.sales.list({ limit: 100, ...(nextToken ? { nextToken } : {}) });
        saleSources.push(...page.items); nextToken = page.nextToken;
      } while (nextToken);
    }
    for (const movement of movements) {
      totals.set(movement.productId, safeSum(totals.get(movement.productId) ?? 0, movement.quantityDeltaInternal));
      const key = `${movement.sourceType}/${movement.sourceId}/${movement.sourceLineId}`;
      if (keys.has(key)) issues.push(`Fuente duplicada ${key}; movimiento ${movement.id}`); keys.add(key);
      if (movement.type === 'SALE' || movement.type === 'SALE_VOID') {
        const sale = saleSources.find((item) => item.id === movement.sourceId);
        const quantity = sale?.items.filter((item) => item.trackStock && item.productId === movement.productId)
          .reduce((total, item) => safeSum(total, item.quantityBaseInternal), 0) ?? 0;
        if (!sale || (movement.type === 'SALE' ? !['CONFIRMED', 'VOIDED'].includes(sale.status) : sale.status !== 'VOIDED')
          || movement.sourceType !== movement.type || movement.saleId !== sale.id || movement.sourceLineId !== movement.productId
          || quantity <= 0 || movement.quantityDeltaInternal !== (movement.type === 'SALE' ? -quantity : quantity)) {
          issues.push(`Movimiento ${movement.id}: origen de venta inconsistente${this.sales ? '' : '; repositorio de ventas requerido'}`);
        }
        continue;
      }
      const lot = source.lots.find((item) => item.id === movement.lotId);
      const receipt = source.receipts.find((item) => item.id === movement.sourceId);
      if (!lot || receipt?.status !== 'CONFIRMED' || lot.receiptLineId !== movement.sourceLineId
        || lot.receiptId !== movement.sourceId || lot.productId !== movement.productId
        || lot.purchaseId !== movement.purchaseId || lot.receivedQuantityBaseInternal !== movement.quantityDeltaInternal
        || lot.directPurchaseCostGuarani !== movement.costGuarani) issues.push(`Movimiento ${movement.id}: origen/lote ${movement.lotId} inconsistente`);
    }
    for (const sale of saleSources.filter((item) => item.status === 'CONFIRMED' || item.status === 'VOIDED')) {
      for (const productId of new Set(sale.items.filter((item) => item.trackStock).map((item) => item.productId))) {
        for (const type of sale.status === 'VOIDED' ? ['SALE', 'SALE_VOID'] as const : ['SALE'] as const) {
          const postings = movements.filter((item) => item.sourceType === type && item.sourceId === sale.id && item.sourceLineId === productId);
          if (postings.length !== 1) issues.push(`Venta ${sale.id}, producto ${productId}: ${type} movimientos=${postings.length}`);
        }
      }
    }
    for (const receipt of source.receipts.filter((item) => item.status === 'CONFIRMED')) {
      const lines = source.lines.filter((item) => item.receiptId === receipt.id);
      if (!lines.length) issues.push(`Recepción ${receipt.id} confirmada sin líneas`);
      for (const line of lines) {
        const lots = source.lots.filter((item) => item.receiptLineId === line.id && item.receiptId === receipt.id);
        const postings = movements.filter((item) => item.sourceId === receipt.id && item.sourceLineId === line.id);
        if (lots.length !== 1 || postings.length !== 1) issues.push(`Recepción ${receipt.id}, línea ${line.id}: lotes=${lots.length}, movimientos=${postings.length}`);
        const lot = lots[0];
        if (lot && (lot.productId !== line.productId || lot.purchaseItemId !== line.purchaseItemId || lot.purchaseId !== line.purchaseId
          || lot.receivedQuantityBaseInternal !== line.receivedQuantityBaseInternal || lot.directPurchaseCostGuarani !== line.directPurchaseCostGuarani)) issues.push(`Línea ${line.id} y lote ${lot.id}: cantidad/costo/origen difieren`);
      }
    }
    for (const lot of source.lots) {
      if (!source.lines.some((line) => line.id === lot.receiptLineId && line.receiptId === lot.receiptId)
        || !source.receipts.some((receipt) => receipt.id === lot.receiptId && receipt.status === 'CONFIRMED')) issues.push(`Lote huérfano ${lot.id}`);
    }
    const ids = new Set([...totals.keys(), ...balances.map((item) => item.productId), ...before.map((item) => item.productId)]);
    for (const balance of balances) {
      if (balance.onHandInternal < 0) issues.push(`Saldo negativo para producto ${balance.productId}: ${balance.onHandInternal}`);
      if (this.products && !await this.products.findById(balance.productId)) issues.push(`Balance huérfano: producto ${balance.productId} inexistente`);
    }
    for (const id of ids) {
      const balance = balances.find((item) => item.productId === id); const old = before.find((item) => item.productId === id);
      if (balance?.version !== old?.version) { issues.push(`Producto ${id}: cambió durante la verificación; repetir en reposo`); continue; }
      if ((balance?.onHandInternal ?? 0) !== (totals.get(id) ?? 0) || (!balance && totals.has(id))) issues.push(`Producto ${id}: balance=${balance?.onHandInternal ?? 'ausente'}, ledger=${totals.get(id) ?? 0}`);
    }
    return issues;
  }
}
import type { ProductRepository } from '../../products/domain/product.repository.js';
