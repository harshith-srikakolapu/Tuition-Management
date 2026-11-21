import { Injectable, Logger } from '@nestjs/common';
import { ReminderType } from '@prisma/client';
import { normalizePhone } from '../common/validators';

export interface SendRequest {
  phone: string;
  type: ReminderType;
  language: string;
  /** Ordered template body parameters: parent, student, amount, due date, center */
  params: string[];
}

/**
 * WhatsApp Cloud API sender. Business-initiated messages must use pre-approved
 * templates; create them in Meta Business Manager with 5 body variables
 * ({{1}} parent, {{2}} student, {{3}} amount, {{4}} due date, {{5}} center) and set
 * WHATSAPP_TEMPLATE_BEFORE / WHATSAPP_TEMPLATE_AFTER to their names.
 *
 * If not configured, reminders are queued as MANUAL for one-tap wa.me sending.
 */
@Injectable()
export class WhatsAppProvider {
  private readonly log = new Logger(WhatsAppProvider.name);
  private readonly token = process.env.WHATSAPP_TOKEN;
  private readonly phoneId = process.env.WHATSAPP_PHONE_ID;
  private readonly apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v21.0';
  private readonly templates: Record<ReminderType, string | undefined> = {
    BEFORE_DUE: process.env.WHATSAPP_TEMPLATE_BEFORE,
    AFTER_DUE: process.env.WHATSAPP_TEMPLATE_AFTER,
  };

  get enabled(): boolean {
    return Boolean(this.token && this.phoneId && this.templates.BEFORE_DUE && this.templates.AFTER_DUE);
  }

  async send(req: SendRequest): Promise<void> {
    const res = await fetch(`https://graph.facebook.com/${this.apiVersion}/${this.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(req.phone),
        type: 'template',
        template: {
          name: this.templates[req.type],
          language: { code: req.language === 'hi' ? 'hi' : 'en' },
          components: [{ type: 'body', parameters: req.params.map((text) => ({ type: 'text', text })) }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text();
      this.log.warn(`WhatsApp send failed (${res.status}): ${body.slice(0, 300)}`);
      throw new Error(`WhatsApp API ${res.status}: ${body.slice(0, 200)}`);
    }
  }
}
