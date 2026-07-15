export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export interface WhatsAppConnectionProbe {
  readonly accessToken: string;
  readonly apiVersion: string;
  readonly businessAccountId: string;
  readonly phoneNumberId: string;
}

export interface WhatsAppConnectionProbeResult {
  readonly fixtureVersion: string;
  readonly healthy: boolean;
  readonly mode: 'simulation';
  readonly providerBusinessName: string;
  readonly providerPhoneLabel: string;
}

export interface WhatsAppProvider {
  testConnection(probe: WhatsAppConnectionProbe): Promise<WhatsAppConnectionProbeResult>;
}
