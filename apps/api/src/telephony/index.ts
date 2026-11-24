import { config } from '../config';
import { mockProvider } from './mock';
import { twilioProvider } from './twilio';
import type { TelephonyProvider } from './types';

export const telephonyProvider: TelephonyProvider =
  config.telephonyProvider === 'twilio' ? twilioProvider : mockProvider;

export type { PlaceCallInput, PlaceCallResult, TelephonyProvider } from './types';
