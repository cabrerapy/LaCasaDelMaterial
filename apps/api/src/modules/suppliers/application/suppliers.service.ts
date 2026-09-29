import { randomUUID } from 'node:crypto';
import type {
  CreateSupplierRequest,
  SupplierResponse,
  SuppliersPageResponse,
  SupplierStatus,
  UpdateSupplierRequest
} from '@lcm/contracts';
import type { SupplierListOptions, SupplierRepository } from '../domain/supplier.repository.js';
import { SupplierTaxIdUniquenessError } from '../domain/supplier.repository.js';
import type { Supplier } from '../domain/supplier.js';
import { SupplierApplicationError } from './supplier-application-error.js';

export class SuppliersService {
  constructor(private readonly suppliers: SupplierRepository) {}
  async list(options: SupplierListOptions): Promise<SuppliersPageResponse> {
    const page = await this.suppliers.list({
      ...options, ...(options.search ? { search: normalizeSearch(options.search) } : {})
    });
    return { items: page.items.map(toResponse), ...(page.nextToken ? { nextToken: page.nextToken } : {}) };
  }
  async getById(id: string): Promise<SupplierResponse> { return toResponse(await this.requireSupplier(id)); }
  async create(input: CreateSupplierRequest, actorId: string): Promise<SupplierResponse> {
    const businessName = cleanRequired(input.businessName);
    const now = new Date().toISOString();
    const supplier: Supplier = {
      id: randomUUID(), businessName, normalizedBusinessName: normalizeSearch(businessName),
      ...optionalFields(input), status: 'ACTIVE', createdAt: now, updatedAt: now,
      createdBy: actorId, updatedBy: actorId
    };
    try { await this.suppliers.create(supplier); }
    catch (error: unknown) { this.rethrowUniqueness(error); }
    return toResponse(supplier);
  }
  async update(id: string, input: UpdateSupplierRequest, actorId: string): Promise<SupplierResponse> {
    const current = await this.requireSupplier(id);
    const businessName = input.businessName !== undefined ? cleanRequired(input.businessName) : current.businessName;
    const cleared = withoutOptionalFields(current);
    const mergedInput: OptionalSupplierInput = {
      tradeName: input.tradeName === undefined ? current.tradeName : input.tradeName,
      taxId: input.taxId === undefined ? current.taxId : input.taxId,
      phone: input.phone === undefined ? current.phone : input.phone,
      email: input.email === undefined ? current.email : input.email,
      address: input.address === undefined ? current.address : input.address,
      city: input.city === undefined ? current.city : input.city,
      notes: input.notes === undefined ? current.notes : input.notes
    };
    const updated: Supplier = {
      ...cleared, businessName, normalizedBusinessName: normalizeSearch(businessName),
      ...optionalFields(mergedInput), updatedAt: new Date().toISOString(), updatedBy: actorId
    };
    try { await this.suppliers.update(updated, current.taxId); }
    catch (error: unknown) { this.rethrowUniqueness(error); }
    return toResponse(updated);
  }
  async updateStatus(id: string, status: SupplierStatus, actorId: string): Promise<SupplierResponse> {
    const current = await this.requireSupplier(id);
    const updated: Supplier = {
      ...current, status, updatedAt: new Date().toISOString(), updatedBy: actorId
    };
    await this.suppliers.update(updated, current.taxId);
    return toResponse(updated);
  }
  private async requireSupplier(id: string): Promise<Supplier> {
    const supplier = await this.suppliers.findById(id);
    if (!supplier) throw new SupplierApplicationError('Proveedor no encontrado', 404);
    return supplier;
  }
  private rethrowUniqueness(error: unknown): never {
    if (error instanceof SupplierTaxIdUniquenessError) {
      throw new SupplierApplicationError('El RUC ya está registrado', 409);
    }
    throw error;
  }
}

export function normalizeTaxId(value: string): string {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!/^[A-Z0-9]+(?:-[A-Z0-9]+)?$/.test(normalized)) {
    throw new SupplierApplicationError('El RUC tiene un formato inválido', 400);
  }
  return normalized;
}
function normalizeSearch(value: string): string { return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es'); }
function cleanRequired(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) throw new SupplierApplicationError('La razón social es obligatoria', 400);
  return clean;
}
function optional(value: string | undefined): string | undefined {
  const clean = value?.trim().replace(/\s+/g, ' '); return clean || undefined;
}
interface OptionalSupplierInput {
  readonly tradeName?: string | undefined;
  readonly taxId?: string | undefined;
  readonly phone?: string | undefined;
  readonly email?: string | undefined;
  readonly address?: string | undefined;
  readonly city?: string | undefined;
  readonly notes?: string | undefined;
}
function optionalFields(input: OptionalSupplierInput): Partial<Supplier> {
  const tradeName = optional(input.tradeName);
  const taxId = optional(input.taxId) ? normalizeTaxId(input.taxId ?? '') : undefined;
  const phone = optional(input.phone); const email = optional(input.email)?.toLocaleLowerCase('es');
  const address = optional(input.address); const city = optional(input.city); const notes = input.notes?.trim() || undefined;
  return {
    ...(tradeName ? { tradeName, normalizedTradeName: normalizeSearch(tradeName) } : {}),
    ...(taxId ? { taxId } : {}), ...(phone ? { phone } : {}), ...(email ? { email } : {}),
    ...(address ? { address } : {}), ...(city ? { city } : {}), ...(notes ? { notes } : {})
  };
}
function withoutOptionalFields(
  supplier: Supplier
): Omit<Supplier, 'tradeName' | 'normalizedTradeName' | 'taxId' | 'phone' | 'email' | 'address' | 'city' | 'notes'> {
  const {
    tradeName: _tradeName, normalizedTradeName: _normalizedTradeName, taxId: _taxId,
    phone: _phone, email: _email, address: _address, city: _city, notes: _notes, ...rest
  } = supplier;
  void _tradeName; void _normalizedTradeName; void _taxId; void _phone;
  void _email; void _address; void _city; void _notes; return rest;
}
function toResponse(supplier: Supplier): SupplierResponse {
  return {
    id: supplier.id, businessName: supplier.businessName,
    ...(supplier.tradeName ? { tradeName: supplier.tradeName } : {}),
    ...(supplier.taxId ? { taxId: supplier.taxId } : {}),
    ...(supplier.phone ? { phone: supplier.phone } : {}), ...(supplier.email ? { email: supplier.email } : {}),
    ...(supplier.address ? { address: supplier.address } : {}), ...(supplier.city ? { city: supplier.city } : {}),
    ...(supplier.notes ? { notes: supplier.notes } : {}), status: supplier.status,
    createdAt: supplier.createdAt, updatedAt: supplier.updatedAt
  };
}
