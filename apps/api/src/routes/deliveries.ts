import { Router } from 'express';
import { asyncHandler, HttpError } from '../http';
import { getDelivery, listDeliveries, startCall } from '../services/deliveries';
import { DELIVERY_STATUSES, type DeliveryStatus } from '../types';

export const deliveriesRouter = Router();

deliveriesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const raw = req.query.status;
    let status: DeliveryStatus | undefined;

    if (raw !== undefined) {
      if (typeof raw !== 'string' || !DELIVERY_STATUSES.includes(raw as DeliveryStatus)) {
        throw new HttpError(`Invalid status filter. Allowed values: ${DELIVERY_STATUSES.join(', ')}`);
      }
      status = raw as DeliveryStatus;
    }

    res.json({ deliveries: await listDeliveries(status) });
  }),
);

deliveriesRouter.post(
  '/bulk-call',
  asyncHandler(async (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
      throw new HttpError('Provide a non-empty "ids" array');
    }
    if (ids.length > 20) throw new HttpError('Maximum 20 deliveries per bulk call');

    const results = await Promise.allSettled(
      ids.map((id: string) => startCall(id, req.body?.outcome)),
    );

    res.json({
      started: results.filter((result) => result.status === 'fulfilled').length,
      failed: results
        .map((result, index) => ({ id: ids[index], reason: result.status === 'rejected' ? String(result.reason) : null }))
        .filter((result) => result.reason !== null),
    });
  }),
);

deliveriesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const delivery = await getDelivery(req.params.id);
    if (!delivery) throw new HttpError('Delivery not found', 404);
    res.json({ delivery });
  }),
);

deliveriesRouter.post(
  '/:id/call',
  asyncHandler(async (req, res) => {
    const result = await startCall(req.params.id, req.body?.outcome);
    res.status(202).json({
      delivery: result.delivery,
      providerCallId: result.providerCallId,
      message: 'Call initiated',
    });
  }),
);
