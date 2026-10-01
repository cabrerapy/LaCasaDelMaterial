export const CUSTOMER_TYPES = ['PERSON', 'COMPANY'] as const;
export type CustomerType = typeof CUSTOMER_TYPES[number];
export const CUSTOMER_DOCUMENT_TYPES = ['CI', 'RUC', 'PASSPORT', 'OTHER'] as const;
export type CustomerDocumentType = typeof CUSTOMER_DOCUMENT_TYPES[number];
export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CustomerStatus = typeof CUSTOMER_STATUSES[number];
export interface CustomerResponse {
  readonly id: string; readonly type: CustomerType; readonly displayName: string;
  readonly firstName?: string; readonly lastName?: string; readonly businessName?: string;
  readonly documentType?: CustomerDocumentType; readonly documentNumber?: string; readonly taxId?: string;
  readonly phone?: string; readonly email?: string; readonly address?: string; readonly city?: string; readonly notes?: string;
  readonly status: CustomerStatus; readonly createdAt: string; readonly updatedAt: string;
}
export interface CustomersPageResponse { readonly items: readonly CustomerResponse[]; readonly nextToken?: string; }
export interface CreateCustomerRequest {
  readonly type: CustomerType; readonly firstName?: string; readonly lastName?: string; readonly businessName?: string;
  readonly documentType?: CustomerDocumentType; readonly documentNumber?: string; readonly taxId?: string;
  readonly phone?: string; readonly email?: string; readonly address?: string; readonly city?: string; readonly notes?: string;
}
export type UpdateCustomerRequest = Omit<Partial<CreateCustomerRequest>, 'type'>;
export interface UpdateCustomerStatusRequest { readonly status: CustomerStatus; }
