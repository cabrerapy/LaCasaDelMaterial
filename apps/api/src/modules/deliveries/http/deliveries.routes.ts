import { DELIVERY_EVIDENCE_TYPES, DELIVERY_INCIDENT_TYPES, type CreateDeliveryRequest, type DeliveryEvidenceType, type UpdateDeliveryRequest } from '@lcm/contracts';
import { createReadStream } from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { DeliveriesService } from '../application/deliveries.service.js';
import { matchesEvidenceContent } from '../application/evidence-content.js';
const tripParams={type:'object',required:['tripId'],properties:{tripId:{type:'string',format:'uuid'}}}as const;
const idParams={type:'object',required:['id'],properties:{id:{type:'string',format:'uuid'}}}as const;
const line={type:'object',additionalProperties:false,required:['tripLoadLineId','deliveredQuantityBaseInternal','incidentType'],properties:{tripLoadLineId:{type:'string',format:'uuid'},deliveredQuantityBaseInternal:{type:'integer',minimum:0},incidentType:{type:'string',enum:[...DELIVERY_INCIDENT_TYPES]},incidentNotes:{type:'string',maxLength:1000}}}as const;
const body={type:'object',additionalProperties:false,properties:{receiverName:{type:'string',maxLength:150},receiverDocument:{type:'string',maxLength:60},receiverPhone:{type:'string',maxLength:60},generalNotes:{type:'string',maxLength:1500},lines:{type:'array',maxItems:25,items:line}}}as const;
export async function tripDeliveryRoutes(app:FastifyInstance,o:{authService:AuthService;service:DeliveriesService}){
 app.addContentTypeParser(['image/jpeg','image/png','image/webp','application/pdf'],{parseAs:'buffer',bodyLimit:5*1024*1024},(request,body,done)=>{
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (!matchesEvidenceContent(request.headers['content-type'] ?? '', content)) {
   done(Object.assign(new Error('El contenido no coincide con el tipo de archivo permitido'), { statusCode: 400 }));
   return;
  }
  done(null,content);
 });
 app.get<{Params:{tripId:string}}>('/:tripId/delivery',{preHandler:requirePermission(o.authService,'deliveries.read'),schema:{params:tripParams}},r=>{const a=authenticatedUser(r);return o.service.getByTrip(r.params.tripId,a.userId,a.role);});
 app.post<{Params:{tripId:string};Body:CreateDeliveryRequest}>('/:tripId/delivery',{preHandler:requirePermission(o.authService,'deliveries.create'),schema:{params:tripParams,body}},async(r,reply)=>{const a=authenticatedUser(r);return reply.status(201).send(await o.service.create(r.params.tripId,r.body,a.userId,a.role));});
 app.patch<{Params:{tripId:string};Body:UpdateDeliveryRequest}>('/:tripId/delivery',{preHandler:requirePermission(o.authService,'deliveries.create'),schema:{params:tripParams,body}},r=>{const a=authenticatedUser(r);return o.service.update(r.params.tripId,r.body,a.userId,a.role);});
 app.post<{Params:{tripId:string};Body:{odometerEndKm:number}}>('/:tripId/delivery/confirm',{preHandler:requirePermission(o.authService,'deliveries.confirm'),schema:{params:tripParams,body:{type:'object',additionalProperties:false,required:['odometerEndKm'],properties:{odometerEndKm:{type:'integer',minimum:0}}}}},r=>{const a=authenticatedUser(r);return o.service.confirm(r.params.tripId,r.body.odometerEndKm,a.userId,a.role);});
 app.get<{Params:{tripId:string}}>('/:tripId/delivery/evidence',{preHandler:requirePermission(o.authService,'delivery_evidence.read'),schema:{params:tripParams}},r=>{const a=authenticatedUser(r);return o.service.evidence(r.params.tripId,a.userId,a.role);});
 app.post<{Params:{tripId:string};Querystring:{type:DeliveryEvidenceType;fileName:string};Body:Buffer}>('/:tripId/delivery/evidence',{preHandler:requirePermission(o.authService,'delivery_evidence.create'),schema:{params:tripParams,querystring:{type:'object',additionalProperties:false,required:['type','fileName'],properties:{type:{type:'string',enum:[...DELIVERY_EVIDENCE_TYPES]},fileName:{type:'string',minLength:1,maxLength:255}}}}},async(r,reply)=>{const a=authenticatedUser(r);return reply.status(201).send(await o.service.addEvidence(r.params.tripId,r.query.type,r.query.fileName,r.headers['content-type']??'application/octet-stream',r.body,a.userId,a.role));});
}
export async function deliveriesRoutes(app:FastifyInstance,o:{authService:AuthService;service:DeliveriesService}){
 app.get<{Querystring:{pageSize?:number;nextToken?:string;saleId?:string;status?:string}}>('/',{preHandler:requirePermission(o.authService,'deliveries.read'),schema:{querystring:{type:'object',properties:{pageSize:{type:'integer',minimum:1,maximum:100,default:25},nextToken:{type:'string'},saleId:{type:'string',format:'uuid'},status:{type:'string'}}}}},r=>o.service.list(r.query.pageSize??25,r.query.nextToken,r.query.saleId,r.query.status));
 app.get<{Params:{id:string}}>('/:id',{preHandler:requirePermission(o.authService,'deliveries.read'),schema:{params:idParams}},r=>{const a=authenticatedUser(r);return o.service.get(r.params.id,a.userId,a.role);});
 app.post<{Params:{id:string};Body:{reason:string}}>('/:id/void',{preHandler:requirePermission(o.authService,'deliveries.void'),schema:{params:idParams,body:{type:'object',additionalProperties:false,required:['reason'],properties:{reason:{type:'string',minLength:1,maxLength:500}}}}},r=>o.service.void(r.params.id,r.body.reason,authenticatedUser(r).userId));
}
export async function deliveryEvidenceRoutes(app:FastifyInstance,o:{authService:AuthService;service:DeliveriesService}){app.get<{Params:{id:string}}>('/:id/file',{preHandler:requirePermission(o.authService,'delivery_evidence.read'),schema:{params:idParams}},async(r,reply)=>{const a=authenticatedUser(r),file=await o.service.evidenceFile(r.params.id,a.userId,a.role);reply.header('Content-Disposition',`inline; filename="${file.fileName.replace(/["\r\n]/g,'')}"`).type(file.mimeType);return reply.send(createReadStream(file.path));});}
