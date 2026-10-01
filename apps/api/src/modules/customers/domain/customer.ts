import type { CustomerDocumentType, CustomerStatus, CustomerType } from '@lcm/contracts';
export interface Customer {
  readonly id: string; readonly type: CustomerType;
  readonly firstName?: string; readonly lastName?: string; readonly businessName?: string;
  readonly normalizedDisplayName: string; readonly documentType?: CustomerDocumentType; readonly documentNumber?: string;
  readonly normalizedDocument?: string; readonly taxId?: string; readonly phone?: string; readonly normalizedPhone?: string;
  readonly email?: string; readonly address?: string; readonly city?: string; readonly normalizedCity?: string; readonly notes?: string;
  readonly status: CustomerStatus; readonly createdAt: string; readonly updatedAt: string;
  readonly createdBy: string; readonly updatedBy: string;
}
export function customerDisplayName(customer: Pick<Customer, 'type' | 'firstName' | 'lastName' | 'businessName'>): string {
  return customer.type === 'COMPANY' ? customer.businessName ?? '' : [customer.firstName, customer.lastName].filter(Boolean).join(' ');
}
