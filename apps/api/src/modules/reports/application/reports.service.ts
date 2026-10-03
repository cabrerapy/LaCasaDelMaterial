import {
  hasPermission, REPORT_TYPES, type Permission, type ReportCell, type ReportDefinition,
  type ReportFilterValue, type ReportMetric, type ReportQuery, type ReportResponse,
  type ReportRow, type ReportsHubResponse, type ReportType, type UserRole
} from '@lcm/contracts';
import type { CashMovement, CashSession } from '../../cash/domain/cash.js';
import type { CashRepository } from '../../cash/domain/cash.repository.js';
import type { CategoryRepository } from '../../categories/domain/category.repository.js';
import type { DeliveryRepository } from '../../deliveries/domain/delivery.repository.js';
import type { FuelRepository } from '../../fuel/domain/fuel.repository.js';
import { formatLiters } from '../../fuel/domain/fuel.js';
import type { InventoryRepository } from '../../inventory/domain/inventory.js';
import { stockStatus } from '../../inventory/application/stock.service.js';
import type { ProductRepository } from '../../products/domain/product.repository.js';
import type { PurchaseRepository } from '../../purchases/domain/purchase.repository.js';
import type { Sale } from '../../sales/domain/sale.js';
import type { SaleRepository } from '../../sales/domain/sale.repository.js';
import type { TripRepository } from '../../trips/domain/trip.repository.js';

type Actor = { readonly userId: string; readonly role: UserRole };
type Dataset = { readonly rows: readonly ReportRow[]; readonly summary: readonly ReportMetric[] };

const DEFINITIONS: readonly ReportDefinition[] = [
  definition('sales', 'Ventas', 'Ventas realizadas, clientes, importes y estados.', 'FINANCE', 'reports.sales.read', true),
  definition('payments', 'Cobros', 'Pagos registrados por medio de cobro.', 'FINANCE', 'reports.payments.read', true),
  definition('transfers', 'Transferencias', 'Cobros transferidos y desglose por referencia receptora.', 'FINANCE', 'reports.transfers.read', true),
  definition('gross-margin', 'Margen bruto', 'Ingreso neto, costo FIFO y margen bruto.', 'FINANCE', 'reports.margin.read', true),
  definition('cash', 'Caja', 'Sesiones y movimientos de efectivo físico.', 'FINANCE', 'reports.cash.read', true),
  definition('purchases', 'Compras', 'Compras, proveedores, importes y recepción.', 'INVENTORY', 'reports.purchases.read', true),
  definition('inventory', 'Inventario actual', 'Stock actual expresado en cantidades comerciales.', 'INVENTORY', 'reports.inventory.read', false),
  definition('inventory-movements', 'Movimientos de inventario', 'Entradas y salidas inmutables del inventario.', 'INVENTORY', 'reports.inventory_movements.read', true),
  definition('low-stock', 'Stock bajo', 'Productos agotados o bajo el mínimo.', 'INVENTORY', 'reports.inventory.read', false),
  definition('trips', 'Viajes', 'Actividad logística por camión, chofer y estado.', 'LOGISTICS', 'reports.trips.read', true),
  definition('deliveries', 'Entregas', 'Resultados de entrega y diferencias registradas.', 'LOGISTICS', 'reports.deliveries.read', true),
  definition('fuel', 'Combustible', 'Combustible cargado por vehículo y viaje.', 'LOGISTICS', 'reports.fuel.read', true)
];

export class ReportsService {
  constructor(
    private readonly sales: SaleRepository,
    private readonly cash: CashRepository,
    private readonly purchases: PurchaseRepository,
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly inventory: InventoryRepository,
    private readonly trips: TripRepository,
    private readonly deliveries: DeliveryRepository,
    private readonly fuel: FuelRepository,
    private readonly exportMaxRows = 50_000
  ) {}

  hub(actor: Actor): ReportsHubResponse {
    return { reports: DEFINITIONS.filter((report) => hasPermission(actor.role, report.permission as Permission)) };
  }

  async report(type: ReportType, query: ReportQuery, actor: Actor): Promise<ReportResponse> {
    const report = this.requireDefinition(type, actor, false);
    const normalized = normalizeQuery(query, report.temporal);
    const dataset = await this.dataset(type, normalized, actor);
    const pageSize = normalized.pageSize ?? 50;
    const start = decodeCursor(normalized.cursor, dataset.rows);
    const items = dataset.rows.slice(start, start + pageSize);
    const last = items.at(-1);
    return {
      reportType: type,
      title: report.title,
      description: report.description,
      period: report.temporal
        ? { dateFrom: normalized.dateFrom!, dateTo: normalized.dateTo!, timezone: 'America/Asuncion' }
        : { timezone: 'America/Asuncion' },
      filters: activeFilters(normalized),
      summary: dataset.summary,
      items,
      pagination: {
        pageSize,
        ...(start + items.length < dataset.rows.length && last ? { nextCursor: encodeCursor(last.id) } : {})
      }
    };
  }

  async exportCsv(type: ReportType, query: ReportQuery, actor: Actor): Promise<string> {
    this.requireDefinition(type, actor, true);
    const report = DEFINITIONS.find((item) => item.type === type)!;
    const { cursor: _cursor, ...withoutCursor } = query;
    const normalized = normalizeQuery(withoutCursor, report.temporal);
    const dataset = await this.dataset(type, normalized, actor);
    if (dataset.rows.length > this.exportMaxRows) {
      throw httpError(413, `El reporte contiene más de ${this.exportMaxRows.toLocaleString('es-PY')} registros. Reduzca el rango o aplique filtros.`);
    }
    const keys: ReportCell[] = dataset.rows[0]?.cells ? [...dataset.rows[0].cells] : [];
    const header = keys.map((cell) => sanitizeCsvCell(cell.label)).join(';');
    const body = dataset.rows.map((row) => keys.map((column) => {
      const cell = row.cells.find((candidate) => candidate.key === column.key);
      return sanitizeCsvCell(cell?.value ?? '');
    }).join(';'));
    return `\uFEFF${[header, ...body].join('\r\n')}`;
  }

  private requireDefinition(type: string, actor: Actor, exporting: boolean): ReportDefinition {
    if (!REPORT_TYPES.includes(type as ReportType)) throw httpError(404, 'Reporte no encontrado');
    const report = DEFINITIONS.find((item) => item.type === type)!;
    if (!hasPermission(actor.role, report.permission as Permission)) throw httpError(403, 'Acceso no autorizado');
    if (exporting && !hasPermission(actor.role, 'reports.export')) throw httpError(403, 'No tiene permiso para exportar reportes');
    return report;
  }

  private async dataset(type: ReportType, query: ReportQuery, actor: Actor): Promise<Dataset> {
    switch (type) {
      case 'sales': return this.salesReport(query, actor);
      case 'payments': return this.paymentsReport(query, actor, false);
      case 'transfers': return this.paymentsReport(query, actor, true);
      case 'gross-margin': return this.marginReport(query);
      case 'cash': return this.cashReport(query, actor);
      case 'purchases': return this.purchasesReport(query, actor);
      case 'inventory': return this.inventoryReport(query, false);
      case 'inventory-movements': return this.movementsReport(query, actor);
      case 'low-stock': return this.inventoryReport(query, true);
      case 'trips': return this.tripsReport(query);
      case 'deliveries': return this.deliveriesReport(query);
      case 'fuel': return this.fuelReport(query, actor);
    }
  }

  private async salesFor(query: ReportQuery): Promise<readonly Sale[]> {
    const values = await pages((nextToken) => this.sales.list({
      limit: 100,
      ...(query.dateFrom ? { dateFrom: query.dateFrom.slice(0, 10) } : {}),
      ...(query.dateTo ? { dateTo: query.dateTo.slice(0, 10) } : {}),
      ...(query.status ? { status: query.status as Sale['status'] } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.paymentMethod ? { paymentMethod: query.paymentMethod as Sale['paymentMethod'] } : {}),
      ...(query.search ? { search: query.search } : {}),
      ...(nextToken ? { nextToken } : {})
    }));
    return values.filter((sale) => inPeriod(sale.confirmedAt ?? sale.createdAt, query)
      && (!query.deliveryMethod || sale.deliveryType === query.deliveryMethod)
      && (!query.saleId || sale.id === query.saleId));
  }

  private async salesReport(query: ReportQuery, actor: Actor): Promise<Dataset> {
    let sales = await this.salesFor(query);
    if (!query.status) sales = sales.filter((sale) => sale.status === 'CONFIRMED');
    if (actor.role === 'CASHIER') sales = sales.filter((sale) => sale.createdBy === actor.userId);
    const gross = sum(sales, (sale) => sale.subtotalGuarani + sale.freightGuarani);
    const discounts = sum(sales, (sale) => sale.discountGuarani);
    const net = sum(sales, (sale) => sale.totalGuarani);
    return {
      summary: [metric('count', 'Cantidad de ventas', sales.length), money('gross', 'Venta bruta', gross), money('discounts', 'Descuentos', discounts), money('net', 'Venta neta', net), money('average', 'Ticket promedio', sales.length ? Math.round(net / sales.length) : 0)],
      rows: sales.map((sale) => row(sale.id, `/sales/${sale.id}`, [
        text('number', 'Venta', sale.saleNumber, true), date('date', 'Fecha y hora', sale.confirmedAt ?? sale.createdAt, true),
        text('customer', 'Cliente', sale.customerSnapshot?.displayName ?? 'Consumidor final', true), text('cashier', 'Registrado por', sale.createdBy),
        status('status', 'Estado', sale.status, true), text('delivery', 'Entrega', sale.deliveryType),
        money('subtotal', 'Subtotal', sale.subtotalGuarani), money('discount', 'Descuento', sale.discountGuarani), money('total', 'Total', sale.totalGuarani, true),
        text('payment', 'Medio de pago', sale.paymentMethod)
      ]))
    };
  }

  private async paymentData(query: ReportQuery, actor: Actor): Promise<readonly { movement: CashMovement; session: CashSession; sale: Sale | null }[]> {
    const result: { movement: CashMovement; session: CashSession; sale: Sale | null }[] = [];
    const movements = await pages((nextToken) => this.cash.listMovements({ limit: 100, ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}), ...(query.dateTo ? { dateTo: query.dateTo } : {}), ...(nextToken ? { nextToken } : {}) }));
    const sessionCache = new Map<string, CashSession>();
    for (const movement of movements) {
      if ((query.movementType && movement.type !== query.movementType) || (query.saleId && movement.sourceId !== query.saleId) || (query.paymentMethod && movement.paymentMethod !== query.paymentMethod)) continue;
      let session = sessionCache.get(movement.cashSessionId);
      if (!session) { session = await this.cash.findSession(movement.cashSessionId) ?? undefined; if (session) sessionCache.set(session.id, session); }
      if (!session || (query.cashSessionId && session.id !== query.cashSessionId) || (query.userId && session.openedBy !== query.userId) || (actor.role === 'CASHIER' && session.openedBy !== actor.userId)) continue;
      const sale = movement.sourceType === 'SALE' ? await this.sales.findById(movement.sourceId) : null;
      result.push({ movement, session, sale });
    }
    return result.sort((a, b) => b.movement.occurredAt.localeCompare(a.movement.occurredAt));
  }

  private async paymentsReport(query: ReportQuery, actor: Actor, transfersOnly: boolean): Promise<Dataset> {
    let data = await this.paymentData(query, actor);
    data = data.filter(({ movement, sale }) => movement.type === 'SALE_PAYMENT'
      && (!transfersOnly || movement.paymentMethod === 'TRANSFER')
      && (!query.status || query.status === 'POSTED')
      && (!query.customerId || sale?.customerId === query.customerId));
    if (query.transferAccountId) data = data.filter(({ sale }) => accountKey(sale?.paymentReference) === query.transferAccountId);
    const total = sum(data, ({ movement }) => movement.amountGuarani);
    const methods = new Map<string, number>();
    for (const { movement } of data) methods.set(movement.paymentMethod ?? 'OTHER', (methods.get(movement.paymentMethod ?? 'OTHER') ?? 0) + movement.amountGuarani);
    const summary: ReportMetric[] = [money('total', transfersOnly ? 'Total transferido' : 'Total cobrado', total), metric('count', 'Cantidad de pagos', data.length)];
    for (const [method, amount] of methods) summary.push(money(`method-${method}`, transfersOnly ? maskAccount(method) : methodLabel(method), amount));
    if (transfersOnly) {
      const accounts = new Map<string, number>();
      for (const { movement, sale } of data) {
        const label = maskAccount(sale?.paymentReference);
        accounts.set(label, (accounts.get(label) ?? 0) + movement.amountGuarani);
      }
      summary.splice(2, summary.length - 2, ...[...accounts].map(([label, amount]) => money(`account-${label}`, label, amount)));
    }
    return {
      summary,
      rows: data.map(({ movement, sale }) => row(movement.id, sale ? `/sales/${sale.id}` : undefined, [
        date('date', 'Fecha y hora', movement.occurredAt, true), text('sale', 'Venta', movement.referenceNumber, true),
        text('customer', 'Cliente', sale?.customerSnapshot?.displayName ?? 'Consumidor final', true),
        text('method', 'Medio de pago', methodLabel(movement.paymentMethod ?? 'OTHER')),
        ...(transfersOnly || movement.paymentMethod === 'TRANSFER' ? [text('account', 'Cuenta receptora', maskAccount(sale?.paymentReference), true)] : []),
        money('amount', 'Monto', movement.amountGuarani, true), text('user', 'Registrado por', movement.createdBy), status('status', 'Estado', 'REGISTRADO')
      ]))
    };
  }

  private async marginReport(query: ReportQuery): Promise<Dataset> {
    const sales = (await this.salesFor(query)).filter((sale) => sale.status === 'CONFIRMED');
    const categoryId = query.categoryId;
    const allowedProducts = categoryId
      ? new Set((await pages((nextToken) => this.products.list({ limit: 100, categoryId, ...(nextToken ? { nextToken } : {}) }))).map((product) => product.id))
      : null;
    const rows: ReportRow[] = [];
    for (const sale of sales) for (const item of sale.items) {
      if ((query.productId && item.productId !== query.productId) || (allowedProducts && !allowedProducts.has(item.productId))) continue;
      const complete = sale.costingStatus === 'COSTED' || sale.costingStatus === 'NOT_APPLICABLE';
      rows.push(row(item.id, `/sales/${sale.id}`, [
        text('sale', 'Venta', sale.saleNumber, true), date('date', 'Fecha', sale.confirmedAt ?? sale.createdAt, true),
        text('product', 'Producto', item.productSnapshot.name, true), quantity('quantity', 'Cantidad', item.quantity, item.productSnapshot.baseUnit),
        ...(complete ? [money('revenue', 'Venta neta atribuible', item.netRevenueGuarani ?? item.lineSubtotalGuarani), money('cost', 'Costo FIFO', item.directCogsGuarani ?? 0), money('margin', 'Margen bruto', item.grossProfitGuarani ?? 0), metric('percent', 'Margen %', `${((item.grossMarginBps ?? 0) / 100).toLocaleString('es-PY')} %`)] : [status('costing', 'Costeo', 'COSTEO PENDIENTE', true)])
      ]));
    }
    const complete = sales.filter((sale) => sale.costingStatus === 'COSTED' || sale.costingStatus === 'NOT_APPLICABLE');
    const pending = sales.length - complete.length;
    const revenue = sum(complete, (sale) => sale.netMerchandiseRevenueGuarani ?? sale.totalGuarani);
    const cost = sum(complete, (sale) => sale.directCogsGuarani ?? 0);
    return { rows, summary: [metric('complete', 'Ventas con costeo completo', complete.length), metric('pending', 'Ventas con costeo pendiente', pending), money('revenue', 'Venta neta costada', revenue), money('cost', 'Costo FIFO', cost), money('margin', 'Margen bruto', revenue - cost), metric('percent', 'Margen bruto %', revenue ? `${(((revenue - cost) * 100) / revenue).toLocaleString('es-PY', { maximumFractionDigits: 2 })} %` : '0 %')] };
  }

  private async cashReport(query: ReportQuery, actor: Actor): Promise<Dataset> {
    const data = await this.paymentData(query, actor);
    const cashOnly = data.filter(({ movement }) => movement.paymentMethod === 'CASH' || movement.type === 'MANUAL_IN' || movement.type === 'MANUAL_OUT');
    const sessions = new Map(data.map(({ session }) => [session.id, session]));
    const income = sum(cashOnly.filter(({ movement }) => movement.cashDeltaGuarani > 0), ({ movement }) => movement.cashDeltaGuarani);
    const out = -sum(cashOnly.filter(({ movement }) => movement.cashDeltaGuarani < 0), ({ movement }) => movement.cashDeltaGuarani);
    return {
      summary: [metric('sessions', 'Sesiones de caja', sessions.size), money('income', 'Ingresos de efectivo', income), money('out', 'Egresos', out), money('net', 'Movimiento neto de efectivo', income - out)],
      rows: cashOnly.map(({ movement, session }) => row(movement.id, undefined, [date('date', 'Fecha y hora', movement.occurredAt, true), text('session', 'Sesión', session.sessionNumber, true), text('cashier', 'Cajero', session.openedBy), text('type', 'Movimiento', movement.type, true), money('amount', 'Monto', movement.amountGuarani, true), money('cashDelta', 'Efectivo físico', movement.cashDeltaGuarani), text('reference', 'Referencia', movement.referenceNumber)]))
    };
  }

  private async purchasesReport(query: ReportQuery, actor: Actor): Promise<Dataset> {
    let values = await pages((nextToken) => this.purchases.list({ limit: 100, ...(query.dateFrom ? { dateFrom: query.dateFrom.slice(0, 10) } : {}), ...(query.dateTo ? { dateTo: query.dateTo.slice(0, 10) } : {}), ...(query.supplierId ? { supplierId: query.supplierId } : {}), ...(query.status ? { status: query.status as never } : {}), ...(query.search ? { search: query.search } : {}), ...(nextToken ? { nextToken } : {}) }));
    values = values.filter((purchase) => inPeriod(purchase.purchaseDate, query));
    const effective = values.filter((purchase) => purchase.status !== 'DRAFT' && purchase.status !== 'CANCELLED');
    const costs = hasPermission(actor.role, 'purchases.costs.read');
    return {
      summary: [metric('count', 'Cantidad de compras', effective.length), ...(costs ? [money('amount', 'Monto comprado', sum(effective, (purchase) => purchase.totalGuarani))] : []), metric('confirmed', 'Confirmadas', effective.filter((purchase) => purchase.status === 'CONFIRMED').length), metric('partial', 'Parcialmente recibidas', effective.filter((purchase) => purchase.status === 'PARTIALLY_RECEIVED').length), metric('received', 'Recibidas', effective.filter((purchase) => purchase.status === 'RECEIVED').length), metric('pending', 'Pendientes', effective.filter((purchase) => purchase.status === 'CONFIRMED' || purchase.status === 'PARTIALLY_RECEIVED').length)],
      rows: values.map((purchase) => row(purchase.id, `/purchases/${purchase.id}`, [text('number', 'Compra', purchase.purchaseNumber, true), date('date', 'Fecha', purchase.purchaseDate, true), text('supplier', 'Proveedor', purchase.supplierSnapshot.tradeName ?? purchase.supplierSnapshot.businessName, true), text('invoice', 'Factura proveedor', purchase.supplierInvoiceNumber ?? '—'), status('status', 'Estado', purchase.status, true), ...(costs ? [money('subtotal', 'Subtotal', purchase.subtotalGuarani), money('discount', 'Descuento', purchase.discountGuarani), money('additional', 'Costos adicionales', purchase.additionalCostsGuarani), money('total', 'Total', purchase.totalGuarani, true)] : []), status('receipt', 'Recepción', purchase.status === 'RECEIVED' ? 'RECIBIDA' : purchase.status === 'PARTIALLY_RECEIVED' ? 'PARCIAL' : 'PENDIENTE')]))
    };
  }

  private async inventoryReport(query: ReportQuery, lowOnly: boolean): Promise<Dataset> {
    const products = await pages((nextToken) => this.products.list({ limit: 100, ...(query.search ? { search: query.search } : {}), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.productStatus && query.productStatus !== 'ALL' ? { status: query.productStatus as never } : {}), ...(nextToken ? { nextToken } : {}) }));
    const balances = new Map((await this.inventory.getBalances(products.map((product) => product.id))).map((balance) => [balance.productId, balance.onHandInternal]));
    const categories = new Map((await this.categories.findByIds([...new Set(products.map((product) => product.categoryId))])).map((category) => [category.id, category.name]));
    let values = products.map((product) => ({ product, onHand: balances.get(product.id) ?? 0, state: stockStatus(product, balances.get(product.id) ?? 0) }));
    if (lowOnly) values = values.filter(({ state }) => state === 'OUT_OF_STOCK' || state === 'LOW_STOCK').sort((a, b) => rank(a.state) - rank(b.state) || a.product.name.localeCompare(b.product.name));
    if (query.stockStatus) values = values.filter(({ state }) => state === query.stockStatus);
    const unit = (value: number, scale: number, label: string) => `${formatQuantity(value, scale)} ${unitLabel(label)}`;
    return {
      summary: [metric('count', lowOnly ? 'Productos críticos' : 'Productos con stock controlado', values.filter(({ product }) => product.trackStock).length), metric('out', 'Agotados', values.filter(({ state }) => state === 'OUT_OF_STOCK').length), metric('low', 'Stock bajo', values.filter(({ state }) => state === 'LOW_STOCK').length), metric('ok', 'Stock correcto', values.filter(({ state }) => state === 'OK').length)],
      rows: values.map(({ product, onHand, state }) => row(product.id, `/inventory/${product.id}`, [text('code', 'Código', product.code, true), text('product', 'Producto', product.name, true), text('category', 'Categoría', categories.get(product.categoryId) ?? 'Sin categoría'), text('unit', 'Unidad', unitLabel(product.baseUnit)), text('stock', 'Stock actual', unit(onHand, product.quantityScale, product.baseUnit), true), text('minimum', 'Stock mínimo', unit(product.minStockInternal, product.quantityScale, product.baseUnit)), ...(lowOnly ? [text('shortage', 'Faltante para mínimo', unit(Math.max(0, product.minStockInternal - onHand), product.quantityScale, product.baseUnit), true)] : []), status('status', 'Estado', state, true)]))
    };
  }

  private async movementsReport(query: ReportQuery, actor: Actor): Promise<Dataset> {
    let values = await pages((nextToken) => this.inventory.list({ pageSize: 100, ...(query.productId ? { productId: query.productId } : {}), ...(query.movementType ? { type: query.movementType as never } : {}), ...(query.sourceType ? { sourceType: query.sourceType as never } : {}), ...(query.dateFrom ? { dateFrom: query.dateFrom } : {}), ...(query.dateTo ? { dateTo: query.dateTo } : {}), ...(query.referenceNumber ? { search: query.referenceNumber } : {}), ...(nextToken ? { nextToken } : {}) }));
    values = values.filter((movement) => inPeriod(movement.occurredAt, query));
    const costs = hasPermission(actor.role, 'inventory.costs.read');
    const incoming = values.filter((movement) => movement.quantityDeltaInternal > 0).length;
    return { summary: [metric('count', 'Movimientos', values.length), metric('in', 'Entradas', incoming), metric('out', 'Salidas', values.length - incoming)], rows: values.map((movement) => row(movement.id, `/inventory/movements/${movement.id}`, [text('number', 'Movimiento', movement.movementNumber, true), date('date', 'Fecha y hora', movement.occurredAt, true), text('product', 'Producto', movement.productSnapshot.name, true), text('type', 'Tipo', movement.type), text('quantity', 'Entrada / salida', `${movement.quantityDeltaInternal > 0 ? '+' : ''}${formatQuantity(movement.quantityDeltaInternal, movement.productSnapshot.quantityScale)} ${unitLabel(movement.productSnapshot.baseUnit)}`, true), text('reference', 'Referencia', movement.referenceNumber), text('user', 'Usuario', movement.createdBy), ...(costs && movement.costGuarani !== undefined ? [money('cost', 'Costo', movement.costGuarani)] : [])])) };
  }

  private async tripsReport(query: ReportQuery): Promise<Dataset> {
    let values = await pages((nextToken) => this.trips.list({ limit: 100, ...(query.dateFrom ? { dateFrom: query.dateFrom.slice(0, 10) } : {}), ...(query.dateTo ? { dateTo: query.dateTo.slice(0, 10) } : {}), ...(query.status ? { status: query.status as never } : {}), ...(query.truckId ? { truckId: query.truckId } : {}), ...(query.driverId ? { driverId: query.driverId } : {}), ...(query.saleId ? { saleId: query.saleId } : {}), ...(nextToken ? { nextToken } : {}) }));
    values = values.filter((trip) => inPeriod(trip.startedAt ?? trip.scheduledDate, query));
    const count = (state: string) => values.filter((trip) => trip.status === state).length;
    return { summary: [metric('count', 'Total viajes', values.length), metric('draft', 'Borrador', count('DRAFT')), metric('ready', 'Listos', count('READY')), metric('transit', 'En tránsito', count('IN_TRANSIT')), metric('delivered', 'Entregados', count('DELIVERED')), metric('cancelled', 'Cancelados', count('CANCELLED')), metric('distance', 'Distancia total', `${sum(values, (trip) => trip.distanceKm ?? 0).toLocaleString('es-PY')} km`)], rows: values.map((trip) => row(trip.id, undefined, [text('number', 'Viaje', trip.tripNumber, true), date('date', 'Fecha', trip.startedAt ?? trip.scheduledDate, true), text('sale', 'Venta', trip.saleNumber ?? '—'), text('customer', 'Cliente', trip.customerSnapshot?.displayName ?? '—'), text('truck', 'Camión', trip.truckLabel, true), text('driver', 'Chofer', trip.driverName, true), text('destination', 'Destino', `${trip.destinationName} · ${trip.destinationAddress}`), status('status', 'Estado', trip.status, true), metric('odometerStart', 'Odómetro inicial', trip.odometerStartKm ?? '—'), metric('odometerEnd', 'Odómetro final', trip.odometerEndKm ?? '—'), metric('distance', 'Distancia', trip.distanceKm !== undefined ? `${trip.distanceKm} km` : '—')])) };
  }

  private async deliveriesReport(query: ReportQuery): Promise<Dataset> {
    let values = await pages((nextToken) => this.deliveries.list({ limit: 100, ...(query.saleId ? { saleId: query.saleId } : {}), ...(query.status ? { status: query.status } : {}), ...(nextToken ? { nextToken } : {}) }));
    values = values.filter((delivery) => inPeriod(delivery.deliveredAt ?? delivery.createdAt, query) && (!query.outcome || delivery.outcome === query.outcome) && (!query.customerId || delivery.customerId === query.customerId));
    const trips = new Map<string, Awaited<ReturnType<TripRepository['findById']>>>();
    for (const delivery of values) trips.set(delivery.tripId, await this.trips.findById(delivery.tripId));
    if (query.driverId) values = values.filter((delivery) => trips.get(delivery.tripId)?.driverId === query.driverId);
    const count = (outcome: string) => values.filter((delivery) => delivery.outcome === outcome && delivery.status !== 'VOIDED').length;
    return { summary: [metric('count', 'Total entregas', values.length), metric('full', 'Completas', count('FULL')), metric('partial', 'Parciales', count('PARTIAL')), metric('failed', 'Fallidas', count('FAILED')), metric('voided', 'Anuladas', values.filter((delivery) => delivery.status === 'VOIDED').length)], rows: values.map((delivery) => { const trip = trips.get(delivery.tripId); const differences = delivery.lines.filter((line) => line.undeliveredQuantityBaseInternal > 0).length; return row(delivery.id, `/trips/${delivery.tripId}/delivery`, [text('number', 'Entrega', delivery.deliveryNumber, true), date('date', 'Fecha y hora', delivery.deliveredAt ?? delivery.createdAt, true), text('trip', 'Viaje', trip?.tripNumber ?? delivery.tripId), text('sale', 'Venta', trip?.saleNumber ?? delivery.saleId), text('customer', 'Cliente', trip?.customerSnapshot?.displayName ?? '—', true), text('receiver', 'Receptor', delivery.receiverName ?? '—'), text('outcome', 'Resultado', delivery.status === 'VOIDED' ? 'Anulada' : outcomeLabel(delivery.outcome), true), metric('differences', 'Productos con diferencia', differences), status('status', 'Estado', delivery.status, true)]); }) };
  }

  private async fuelReport(query: ReportQuery, actor: Actor): Promise<Dataset> {
    let values = await pages((nextToken) => this.fuel.list({ limit: 100, ...(query.dateFrom ? { dateFrom: query.dateFrom.slice(0, 10) } : {}), ...(query.dateTo ? { dateTo: query.dateTo.slice(0, 10) } : {}), ...(query.truckId ? { truckId: query.truckId } : {}), ...(query.driverId ? { driverId: query.driverId } : {}), ...(query.tripId ? { tripId: query.tripId } : {}), ...(query.status ? { status: query.status as never } : {}), ...(nextToken ? { nextToken } : {}) }));
    values = values.filter((fuel) => inPeriod(fuel.occurredAt, query));
    const costs = hasPermission(actor.role, 'fuel.costs.read');
    const posted = values.filter((fuel) => fuel.status === 'POSTED');
    const totalLiters = sum(posted, (fuel) => fuel.litersMilli);
    const totalCost = sum(posted, (fuel) => fuel.totalCostGuarani);
    return { summary: [metric('count', 'Cantidad de cargas', posted.length), metric('liters', 'Litros registrados', `${formatLiters(totalLiters)} L`), ...(costs ? [money('cost', 'Costo total', totalCost), money('average', 'Costo promedio por litro', totalLiters ? Math.round(totalCost * 1000 / totalLiters) : 0)] : [])], rows: values.map((fuel) => row(fuel.id, undefined, [date('date', 'Fecha y hora', fuel.occurredAt, true), text('truck', 'Camión', fuel.truckLabel, true), text('driver', 'Chofer', fuel.driverName ?? '—'), text('trip', 'Viaje', fuel.tripNumber ?? '—'), text('liters', 'Litros cargados', `${formatLiters(fuel.litersMilli)} L`, true), metric('odometer', 'Odómetro', `${fuel.odometerKm.toLocaleString('es-PY')} km`), text('station', 'Estación / proveedor', fuel.stationName ?? '—'), text('reference', 'Referencia', fuel.receiptNumber ?? '—'), status('status', 'Estado', fuel.status, true), ...(costs ? [money('cost', 'Costo', fuel.totalCostGuarani)] : [])])) };
  }
}

function definition(type: ReportType, title: string, description: string, category: ReportDefinition['category'], permission: string, temporal: boolean): ReportDefinition { return { type, title, description, category, permission, temporal }; }
function normalizeQuery(query: ReportQuery, temporal: boolean): ReportQuery {
  const pageSize = query.pageSize ?? 50;
  if (![25, 50, 100].includes(pageSize)) throw httpError(400, 'pageSize debe ser 25, 50 o 100');
  if (!temporal) return { ...query, pageSize };
  if (!query.dateFrom || !query.dateTo || !validDate(query.dateFrom) || !validDate(query.dateTo) || Date.parse(query.dateFrom) > Date.parse(query.dateTo)) throw httpError(400, 'El período es inválido');
  return { ...query, pageSize };
}
function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value) && !Number.isNaN(Date.parse(value)); }
function inPeriod(value: string, query: ReportQuery): boolean { const time = Date.parse(value.length === 10 ? `${value}T12:00:00-03:00` : value); return (!query.dateFrom || time >= Date.parse(query.dateFrom)) && (!query.dateTo || time <= Date.parse(query.dateTo)); }
async function pages<T>(load: (token?: string) => Promise<{ readonly items: readonly T[]; readonly nextToken?: string }>): Promise<T[]> { const result: T[] = []; let token: string | undefined; let guard = 0; do { const page = await load(token); result.push(...page.items); token = page.nextToken; if (++guard > 10_000) throw httpError(500, 'Límite seguro de paginación excedido'); } while (token); return result; }
function row(id: string, detailUrl: string | undefined, cells: readonly ReportCell[]): ReportRow { return { id, ...(detailUrl ? { detailUrl } : {}), cells }; }
function metric(key: string, label: string, value: string | number, mobilePriority = false): ReportMetric & { mobilePriority?: boolean } { return { key, label, value, kind: typeof value === 'number' ? 'NUMBER' : 'TEXT', ...(mobilePriority ? { mobilePriority } : {}) }; }
function text(key: string, label: string, value: string, mobilePriority = false): ReportCell { return { key, label, value, kind: 'TEXT', ...(mobilePriority ? { mobilePriority } : {}) }; }
function money(key: string, label: string, value: number, mobilePriority = false): ReportCell { return { key, label, value, kind: 'MONEY', ...(mobilePriority ? { mobilePriority } : {}) }; }
function date(key: string, label: string, value: string, mobilePriority = false): ReportCell { return { key, label, value, kind: 'DATE_TIME', ...(mobilePriority ? { mobilePriority } : {}) }; }
function status(key: string, label: string, value: string, mobilePriority = false): ReportCell { return { key, label, value, kind: 'STATUS', ...(mobilePriority ? { mobilePriority } : {}) }; }
function quantity(key: string, label: string, value: string, unit: string): ReportCell { return { key, label, value: `${value} ${unitLabel(unit)}`, kind: 'QUANTITY' }; }
function sum<T>(values: readonly T[], select: (value: T) => number): number { return values.reduce((total, value) => total + select(value), 0); }
function activeFilters(query: ReportQuery): ReportFilterValue[] { const hidden = new Set(['pageSize', 'cursor']); return Object.entries(query).filter(([key, value]) => !hidden.has(key) && value !== undefined && value !== '').map(([key, value]) => ({ key, label: filterLabel(key), value: String(value) })); }
function filterLabel(key: string): string { return ({ dateFrom: 'Desde', dateTo: 'Hasta', status: 'Estado', search: 'Búsqueda', customerId: 'Cliente', userId: 'Usuario', supplierId: 'Proveedor', productId: 'Producto', categoryId: 'Categoría', paymentMethod: 'Medio de pago', transferAccountId: 'Cuenta receptora', cashSessionId: 'Sesión', movementType: 'Movimiento', sourceType: 'Origen', referenceNumber: 'Referencia', stockStatus: 'Estado stock', productStatus: 'Estado producto', truckId: 'Camión', driverId: 'Chofer', tripId: 'Viaje', saleId: 'Venta', outcome: 'Resultado', deliveryMethod: 'Entrega' } as Record<string, string>)[key] ?? key; }
function encodeCursor(id: string): string { return Buffer.from(JSON.stringify({ after: id })).toString('base64url'); }
function decodeCursor(cursor: string | undefined, rows: readonly ReportRow[]): number { if (!cursor) return 0; try { const value = JSON.parse(Buffer.from(cursor, 'base64url').toString()) as { after?: unknown }; if (typeof value.after !== 'string') throw new Error(); const index = rows.findIndex((row) => row.id === value.after); if (index < 0) throw new Error(); return index + 1; } catch { throw httpError(400, 'Cursor inválido'); } }
export function sanitizeCsvCell(value: string | number): string { let safe = String(value).replace(/\r?\n/g, ' '); if (/^[=+\-@]/.test(safe)) safe = `'${safe}`; return `"${safe.replace(/"/g, '""')}"`; }
function maskAccount(value?: string): string { if (!value?.trim()) return 'Transferencia sin cuenta identificada'; const clean = value.trim(); return clean.length <= 4 ? `•••• ${clean}` : `${clean.slice(0, Math.min(18, clean.length - 4))} •••• ${clean.slice(-4)}`; }
function accountKey(value?: string): string { return Buffer.from(value?.trim().toLocaleLowerCase() || 'unidentified').toString('base64url'); }
function methodLabel(method: string): string { return ({ CASH: 'Efectivo', TRANSFER: 'Transferencia', CARD: 'Tarjeta', CREDIT: 'Crédito', OTHER: 'Otro' } as Record<string, string>)[method] ?? method; }
function outcomeLabel(value?: string): string { return ({ FULL: 'Entrega completa', PARTIAL: 'Entrega parcial', FAILED: 'Entrega fallida' } as Record<string, string>)[value ?? ''] ?? 'Pendiente'; }
function formatQuantity(value: number, scale: number): string { return (value / scale).toLocaleString('es-PY', { maximumFractionDigits: 3 }); }
function unitLabel(value: string): string { return ({ UNIT: 'unidades', BAG: 'bolsas', M3: 'm³', KG: 'kg', LITER: 'litros' } as Record<string, string>)[value] ?? value; }
function rank(value: string): number { return value === 'OUT_OF_STOCK' ? 0 : value === 'LOW_STOCK' ? 1 : 2; }
function httpError(statusCode: number, message: string): Error & { statusCode: number } { return Object.assign(new Error(message), { statusCode }); }
