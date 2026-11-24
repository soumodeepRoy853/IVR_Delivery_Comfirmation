import { Router, type NextFunction, type Request, type Response } from 'express';
import { config } from '../config';
import { asyncHandler, HttpError } from '../http';
import { applyGather, applyStatus } from '../services/calls';
import { getDelivery, getDeliveryByCallSid } from '../services/deliveries';
import { isValidTwilioSignature } from '../telephony/twilio';
import { buildVoiceTwiml, emptyTwiml } from '../ivr/twiml';

export const twilioWebhooksRouter = Router();

function verifySignature(req: Request, res: Response, next: NextFunction): void {
  // Only the offline mock provider is allowed to skip signature validation.
  if (config.telephonyProvider !== 'twilio' || !config.webhookValidation) {
    next();
    return;
  }

  const fullUrl = `${config.publicBaseUrl}${req.originalUrl}`;
  if (!isValidTwilioSignature(fullUrl, req.header('x-twilio-signature') ?? undefined, req.body ?? {})) {
    next(new HttpError('Invalid Twilio signature', 403));
    return;
  }
  next();
}

twilioWebhooksRouter.use(verifySignature);

twilioWebhooksRouter.post(
  '/voice',
  asyncHandler(async (req, res) => {
    const callSid = String(req.body?.CallSid ?? '');
    const delivery = (callSid ? await getDeliveryByCallSid(callSid) : null)
      ?? (typeof req.query.deliveryId === 'string' ? await getDelivery(req.query.deliveryId) : null);

    if (!delivery) {
      res.type('application/xml').send(emptyTwiml());
      return;
    }

    res.type('application/xml').send(
      buildVoiceTwiml({
        name: delivery.customer_name,
        company: config.companyName,
        product: delivery.product,
        date: delivery.delivery_date,
        attempt: Number(req.query.attempt ?? 1),
        baseUrl: config.publicBaseUrl,
      }),
    );
  }),
);

twilioWebhooksRouter.post(
  '/gather',
  asyncHandler(async (req, res) => {
    const callSid = String(req.body?.CallSid ?? '');
    const attempt = Number(req.query.attempt ?? 1);
    const twiml = callSid
      ? await applyGather(callSid, { digits: req.body?.Digits, speech: req.body?.SpeechResult }, attempt)
      : emptyTwiml();
    res.type('application/xml').send(twiml);
  }),
);

twilioWebhooksRouter.post(
  '/status',
  asyncHandler(async (req, res) => {
    const callSid = String(req.body?.CallSid ?? '');
    if (callSid) await applyStatus(callSid, req.body ?? {});
    res.type('text/plain').send('OK');
  }),
);
