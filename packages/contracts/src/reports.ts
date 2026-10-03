export const REPORT_TYPES = [
  'sales', 'payments', 'transfers', 'gross-margin', 'cash', 'purchases',
  'inventory', 'inventory-movements', 'low-stock', 'trips', 'deliveries', 'fuel'
] as const;

export type ReportType = typeof REPORT_TYPES[number];
export type ReportValueKind = 'TEXT' | 'MONEY' | 'DATE_TIME' | 'QUANTITY' | 'STATUS' | 'NUMBER';

export interface ReportPeriod {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly timezone: 'America/Asuncion';
}

export interface ReportMetric {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  readonly kind: ReportValueKind;
}

export interface ReportCell extends ReportMetric {
  readonly mobilePriority?: boolean;
}

export interface ReportRow {
  readonly id: string;
  readonly detailUrl?: string;
  readonly cells: readonly ReportCell[];
}

export interface ReportFilterValue {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface ReportResponse {
  readonly reportType: ReportType;
  readonly title: string;
  readonly description: string;
  readonly period: ReportPeriod;
  readonly filters: readonly ReportFilterValue[];
  readonly summary: readonly ReportMetric[];
  readonly items: readonly ReportRow[];
  readonly pagination: {
    readonly pageSize: 25 | 50 | 100;
    readonly nextCursor?: string;
  };
}

export interface ReportQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly pageSize?: 25 | 50 | 100;
  readonly cursor?: string;
  readonly status?: string;
  readonly search?: string;
  readonly customerId?: string;
  readonly userId?: string;
  readonly supplierId?: string;
  readonly productId?: string;
  readonly categoryId?: string;
  readonly paymentMethod?: string;
  readonly transferAccountId?: string;
  readonly cashSessionId?: string;
  readonly movementType?: string;
  readonly sourceType?: string;
  readonly referenceNumber?: string;
  readonly stockStatus?: string;
  readonly productStatus?: string;
  readonly truckId?: string;
  readonly driverId?: string;
  readonly tripId?: string;
  readonly saleId?: string;
  readonly outcome?: string;
  readonly deliveryMethod?: string;
}

export interface ReportDefinition {
  readonly type: ReportType;
  readonly title: string;
  readonly description: string;
  readonly category: 'FINANCE' | 'INVENTORY' | 'LOGISTICS';
  readonly permission: string;
  readonly temporal: boolean;
}

export interface ReportsHubResponse {
  readonly reports: readonly ReportDefinition[];
}
