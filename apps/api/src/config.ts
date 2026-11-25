import dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import path from 'node:path';

const candidates = [
  process.env.ENV_FILE,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(__dirname, '../../../.env'),
].filter((candidate): candidate is string => Boolean(candidate));

for (const candidate of candidates) {
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate });
    break;
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export type TelephonyProviderName = 'mock' | 'twilio';

const provider = (process.env.TELEPHONY_PROVIDER ?? 'mock').toLowerCase();
if (provider !== 'mock' && provider !== 'twilio') {
  throw new Error('TELEPHONY_PROVIDER must be either "mock" or "twilio"');
}

export const config = {
  databaseUrl: required('DATABASE_URL', 'postgres://postgres:postgres@localhost:5432/ivr_delivery'),
  port: Number(process.env.PORT ?? 4000),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, ''),
  telephonyProvider: provider as TelephonyProviderName,
  mockOutcome: (process.env.MOCK_OUTCOME ?? 'received').toLowerCase(),
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
  companyName: process.env.COMPANY_NAME ?? 'Our Team',
  webhookValidation: (process.env.WEBHOOK_VALIDATION ?? 'true').toLowerCase() !== 'false',
  dashboardUser: process.env.DASHBOARD_USER ?? '',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? '',
  webOrigin: process.env.WEB_ORIGIN ?? '',
} as const;

if (process.env.NODE_ENV === 'production') {
  for (const [name, value] of Object.entries({
    DASHBOARD_USER: config.dashboardUser,
    DASHBOARD_PASSWORD: config.dashboardPassword,
    WEB_ORIGIN: config.webOrigin,
  })) {
    if (!value) throw new Error(`Missing required environment variable in production: ${name}`);
  }
}

if (config.telephonyProvider === 'twilio') {
  for (const [name, value] of Object.entries({
    TWILIO_ACCOUNT_SID: config.twilioAccountSid,
    TWILIO_AUTH_TOKEN: config.twilioAuthToken,
    TWILIO_FROM_NUMBER: config.twilioFromNumber,
  })) {
    if (!value) throw new Error(`Missing required environment variable for Twilio: ${name}`);
  }
}
