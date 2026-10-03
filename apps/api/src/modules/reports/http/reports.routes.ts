import { REPORT_TYPES, type ReportQuery, type ReportType } from '@lcm/contracts';
import type { FastifyPluginAsync } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { ReportsService } from '../application/reports.service.js';

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dateFrom: { type: 'string' }, dateTo: { type: 'string' },
    pageSize: { type: 'integer', enum: [25, 50, 100], default: 50 }, cursor: { type: 'string' },
    status: { type: 'string', maxLength: 40 }, search: { type: 'string', maxLength: 150 },
    customerId: { type: 'string' }, userId: { type: 'string' }, supplierId: { type: 'string' },
    productId: { type: 'string' }, categoryId: { type: 'string' }, paymentMethod: { type: 'string' },
    transferAccountId: { type: 'string' }, cashSessionId: { type: 'string' }, movementType: { type: 'string' },
    sourceType: { type: 'string' }, referenceNumber: { type: 'string', maxLength: 150 }, stockStatus: { type: 'string' },
    productStatus: { type: 'string' }, truckId: { type: 'string' }, driverId: { type: 'string' },
    tripId: { type: 'string' }, saleId: { type: 'string' }, outcome: { type: 'string' }, deliveryMethod: { type: 'string' }
  }
} as const;

export const reportsRoutes: FastifyPluginAsync<{ authService: AuthService; service: ReportsService }> = async (app, options) => {
  app.get('/', { preHandler: requirePermission(options.authService, 'reports.read') }, (request) => options.service.hub(authenticatedUser(request)));

  app.get<{ Params: { type: ReportType }; Querystring: ReportQuery }>('/:type', {
    preHandler: requirePermission(options.authService, 'reports.read'),
    schema: { params: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: [...REPORT_TYPES] } } }, querystring: querySchema }
  }, (request) => options.service.report(request.params.type, request.query, authenticatedUser(request)));

  app.get<{ Params: { type: ReportType }; Querystring: ReportQuery }>('/:type/export', {
    preHandler: requirePermission(options.authService, 'reports.read'),
    schema: { params: { type: 'object', required: ['type'], properties: { type: { type: 'string', enum: [...REPORT_TYPES] } } }, querystring: querySchema }
  }, async (request, reply) => {
    const csv = await options.service.exportCsv(request.params.type, request.query, authenticatedUser(request));
    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="reporte-${request.params.type}.csv"`)
      .send(csv);
  });
};
