export interface PlaceCallInput {
  deliveryId: string;
  to: string;
  promptUrl: string;
  statusCallbackUrl: string;
  record?: boolean;
  /** Mock-only override; ignored by real providers. */
  outcome?: string;
}

export interface PlaceCallResult {
  providerCallId: string;
  providerStatus: string;
}

export interface TelephonyProvider {
  readonly name: 'mock' | 'twilio';
  placeCall(input: PlaceCallInput): Promise<PlaceCallResult>;
}
