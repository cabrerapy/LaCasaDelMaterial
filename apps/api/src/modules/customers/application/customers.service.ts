import { randomUUID } from 'node:crypto';
import type { CreateCustomerRequest, CustomerResponse, CustomersPageResponse, CustomerStatus, UpdateCustomerRequest } from '@lcm/contracts';
import type { CustomerListOptions, CustomerRepository } from '../domain/customer.repository.js';
import { CustomerUniquenessError } from '../domain/customer.repository.js';
import { customerDisplayName, type Customer } from '../domain/customer.js';
export class CustomersService {
  constructor(private readonly repository: CustomerRepository) {}
  async list(options: CustomerListOptions): Promise<CustomersPageResponse> {
    const page = await this.repository.list({ ...options, ...(options.search ? { search: normalize(options.search), searchCompact: normalize(options.search).replace(/\s+/g, '') } : {}), ...(options.city ? { city: normalize(options.city) } : {}) });
    return { items: page.items.map(response), ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  async get(id: string) { return response(await this.require(id)); }
  async create(input: CreateCustomerRequest, actor: string): Promise<CustomerResponse> {
    const now = new Date().toISOString(); const fields = cleanFields(input); validateType(input.type, fields);
    const customer: Customer = { id: randomUUID(), type: input.type, ...fields,
      normalizedDisplayName: normalize(customerDisplayName({ type: input.type, ...fields })),
      status: 'ACTIVE', createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor };
    try { await this.repository.create(customer); } catch (error) { rethrow(error); } return response(customer);
  }
  async update(id: string, input: UpdateCustomerRequest, actor: string): Promise<CustomerResponse> {
    const current = await this.require(id); const fields = cleanFields({ ...current, ...input, type: current.type });
    validateType(current.type, fields);
    const updated: Customer = { id: current.id, type: current.type, ...fields,
      normalizedDisplayName: normalize(customerDisplayName({ type: current.type, ...fields })),
      status: current.status, createdAt: current.createdAt, createdBy: current.createdBy,
      updatedAt: new Date().toISOString(), updatedBy: actor };
    try { await this.repository.update(updated, current); } catch (error) { rethrow(error); } return response(updated);
  }
  async updateStatus(id: string, status: CustomerStatus, actor: string): Promise<CustomerResponse> {
    const current = await this.require(id); const updated = { ...current, status, updatedAt: new Date().toISOString(), updatedBy: actor };
    await this.repository.update(updated, current); return response(updated);
  }
  private async require(id: string) { const found = await this.repository.findById(id); if (!found) throw appError('Cliente no encontrado', 404); return found; }
}
function cleanFields(input: CreateCustomerRequest): Omit<Customer, 'id'|'type'|'normalizedDisplayName'|'status'|'createdAt'|'updatedAt'|'createdBy'|'updatedBy'> {
  const firstName = optional(input.firstName), lastName = optional(input.lastName), businessName = optional(input.businessName);
  const documentType = input.documentType; const documentNumber = optional(input.documentNumber);
  if ((documentType && !documentNumber) || (!documentType && documentNumber)) throw appError('Tipo y número de documento deben informarse juntos', 400);
  const taxId = optional(input.taxId)?.toUpperCase().replace(/\s+/g, '');
  const phone = optional(input.phone); const city = optional(input.city); const email = optional(input.email)?.toLocaleLowerCase('es');
  const address = optional(input.address);
  return { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}), ...(businessName ? { businessName } : {}),
    ...(documentType ? { documentType } : {}), ...(documentNumber ? { documentNumber, normalizedDocument: documentNumber.toUpperCase().replace(/\s+/g, '') } : {}),
    ...(taxId ? { taxId } : {}), ...(phone ? { phone, normalizedPhone: normalize(phone) } : {}), ...(email ? { email } : {}),
    ...(address ? { address } : {}), ...(city ? { city, normalizedCity: normalize(city) } : {}),
    ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}) };
}
function validateType(type: Customer['type'], fields: Partial<Customer>): void {
  if (type === 'PERSON' && !fields.firstName) throw appError('El nombre es obligatorio para una persona', 400);
  if (type === 'COMPANY' && !fields.businessName) throw appError('La razón social es obligatoria para una empresa', 400);
}
function optional(value?: string) { const clean = value?.trim().replace(/\s+/g, ' '); return clean || undefined; }
function normalize(value: string) { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function response(customer: Customer): CustomerResponse {
  return { id: customer.id, type: customer.type, displayName: customerDisplayName(customer),
    ...(customer.firstName ? { firstName: customer.firstName } : {}), ...(customer.lastName ? { lastName: customer.lastName } : {}),
    ...(customer.businessName ? { businessName: customer.businessName } : {}), ...(customer.documentType ? { documentType: customer.documentType } : {}),
    ...(customer.documentNumber ? { documentNumber: customer.documentNumber } : {}), ...(customer.taxId ? { taxId: customer.taxId } : {}),
    ...(customer.phone ? { phone: customer.phone } : {}), ...(customer.email ? { email: customer.email } : {}),
    ...(customer.address ? { address: customer.address } : {}), ...(customer.city ? { city: customer.city } : {}),
    ...(customer.notes ? { notes: customer.notes } : {}), status: customer.status, createdAt: customer.createdAt, updatedAt: customer.updatedAt };
}
function rethrow(error: unknown): never {
  if (error instanceof CustomerUniquenessError) throw appError(error.field === 'document' ? 'El documento ya está registrado' : 'El RUC ya está registrado', 409);
  throw error;
}
function appError(message: string, statusCode: number) { return Object.assign(new Error(message), { statusCode }); }
