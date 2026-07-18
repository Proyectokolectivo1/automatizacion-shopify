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

export interface WhatsAppTemplateDispatch {
  readonly accessToken: string;
  readonly apiVersion: string;
  readonly businessKeyHash: string;
  readonly languageCode: string;
  readonly parameters: readonly {
    readonly name: string;
    readonly renderedValue: string;
    readonly type: 'CURRENCY' | 'DATE' | 'TEXT' | 'URL';
  }[];
  readonly phoneNumberId: string;
  readonly recipientPhoneE164: string;
  readonly templateName: string;
}

export interface WhatsAppTemplateDispatchResult {
  readonly accepted: boolean;
  readonly fixtureVersion: 'v1';
  readonly mode: 'simulation';
  readonly providerMessageId: string;
}

export interface WhatsAppProvider {
  dispatchTemplate(dispatch: WhatsAppTemplateDispatch): Promise<WhatsAppTemplateDispatchResult>;
  testConnection(probe: WhatsAppConnectionProbe): Promise<WhatsAppConnectionProbeResult>;
}
