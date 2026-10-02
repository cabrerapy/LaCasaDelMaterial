import type { SaveTripLoadRequest } from '@lcm/contracts';
import type { FastifyInstance } from 'fastify';
import type { AuthService } from '../../auth/application/auth.service.js';
import { authenticatedUser, requirePermission } from '../../auth/http/authorization.js';
import type { TripLoadsService } from '../application/trip-loads.service.js';
const params={type:'object',required:['tripId'],properties:{tripId:{type:'string',format:'uuid'}}}as const;
const body={type:'object',additionalProperties:false,required:['lines'],properties:{lines:{type:'array',minItems:1,maxItems:10,items:{type:'object',additionalProperties:false,required:['saleItemId','quantityBaseInternal'],properties:{saleItemId:{type:'string',format:'uuid'},quantityBaseInternal:{type:'integer',minimum:1}}}}}}as const;
export async function tripLoadsRoutes(app:FastifyInstance,o:{authService:AuthService;service:TripLoadsService}){
 app.get<{Params:{tripId:string}}>('/:tripId/load',{preHandler:requirePermission(o.authService,'trip_loads.read'),schema:{params}},r=>{const a=authenticatedUser(r);return o.service.get(r.params.tripId,a.userId,a.role);});
 app.get<{Params:{tripId:string}}>('/:tripId/load/balances',{preHandler:requirePermission(o.authService,'trip_loads.read'),schema:{params}},r=>{const a=authenticatedUser(r);return o.service.balances(r.params.tripId,a.userId,a.role);});
 app.post<{Params:{tripId:string};Body:SaveTripLoadRequest}>('/:tripId/load',{preHandler:requirePermission(o.authService,'trip_loads.create'),schema:{params,body}},async(r,reply)=>reply.status(201).send(await o.service.save(r.params.tripId,r.body,authenticatedUser(r).userId)));
 app.patch<{Params:{tripId:string};Body:SaveTripLoadRequest}>('/:tripId/load',{preHandler:requirePermission(o.authService,'trip_loads.update'),schema:{params,body}},r=>o.service.save(r.params.tripId,r.body,authenticatedUser(r).userId));
 app.post<{Params:{tripId:string}}>('/:tripId/load/confirm',{preHandler:requirePermission(o.authService,'trip_loads.confirm'),schema:{params}},r=>o.service.confirm(r.params.tripId,authenticatedUser(r).userId));
 app.post<{Params:{tripId:string}}>('/:tripId/load/cancel',{preHandler:requirePermission(o.authService,'trip_loads.cancel'),schema:{params}},r=>o.service.cancel(r.params.tripId,authenticatedUser(r).userId));
}
