/**
 * Reminder / receipt message templates per language.
 * To add a language: add its code to SUPPORTED_LANGUAGES and a block to TEMPLATES.
 */
import { dateLabel, monthLabel } from '../common/dates';
import { normalizePhone } from '../common/validators';

export const SUPPORTED_LANGUAGES = ['en', 'hi'] as const;
export type Lang = (typeof SUPPORTED_LANGUAGES)[number];

export type MessageKind = 'BEFORE_DUE' | 'AFTER_DUE' | 'RECEIPT' | 'GENERIC_DUE';

export interface MessageVars {
  parentName?: string | null;
  studentName: string;
  centerName: string;
  amount: number;
  month: string; // YYYY-MM
  dueDate?: string | null; // YYYY-MM-DD
  upiId?: string | null;
  paidOn?: string; // RECEIPT
  balance?: number; // RECEIPT
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

type Template = (v: MessageVars & { greet: string; mon: string; due: string; upi: string }) => string;

const TEMPLATES: Record<Lang, Record<MessageKind, Template> & { greet: (n?: string | null) => string; upi: (id: string) => string; locale: string }> = {
  en: {
    locale: 'en-IN',
    greet: (n) => (n ? `Dear ${n},` : 'Dear Parent,'),
    upi: (id) => ` You can pay by UPI to ${id}.`,
    BEFORE_DUE: (v) =>
      `${v.greet} this is a gentle reminder from ${v.centerName} that the tuition fee of ${rupees(v.amount)} for ${v.studentName} (${v.mon}) is due on ${v.due}.${v.upi} Thank you!`,
    AFTER_DUE: (v) =>
      `${v.greet} the tuition fee of ${rupees(v.amount)} for ${v.studentName} was due on ${v.due} and is still pending. Kindly pay at the earliest.${v.upi} Please ignore if already paid. – ${v.centerName}`,
    GENERIC_DUE: (v) =>
      `${v.greet} a tuition fee of ${rupees(v.amount)} is pending for ${v.studentName}.${v.upi} Please ignore if already paid. – ${v.centerName}`,
    RECEIPT: (v) =>
      `${v.greet} we have received ${rupees(v.amount)} for ${v.studentName} on ${v.paidOn ? dateLabel(v.paidOn) : ''}. ${
        v.balance && v.balance > 0 ? `Remaining balance: ${rupees(v.balance)}.` : 'All dues are cleared.'
      } Thank you! – ${v.centerName}`,
  },
  hi: {
    locale: 'hi-IN',
    greet: (n) => (n ? `प्रिय ${n},` : 'प्रिय अभिभावक,'),
    upi: (id) => ` आप UPI द्वारा ${id} पर भुगतान कर सकते हैं।`,
    BEFORE_DUE: (v) =>
      `${v.greet} ${v.centerName} की ओर से याद दिलाना है कि ${v.studentName} की ${v.mon} की ट्यूशन फीस ${rupees(v.amount)} ${v.due} तक देय है।${v.upi} धन्यवाद!`,
    AFTER_DUE: (v) =>
      `${v.greet} ${v.studentName} की ट्यूशन फीस ${rupees(v.amount)} ${v.due} को देय थी और अभी बाकी है। कृपया जल्द से जल्द भुगतान करें।${v.upi} यदि भुगतान हो चुका है तो कृपया इसे अनदेखा करें। – ${v.centerName}`,
    GENERIC_DUE: (v) =>
      `${v.greet} ${v.studentName} की ट्यूशन फीस ${rupees(v.amount)} बाकी है।${v.upi} यदि भुगतान हो चुका है तो कृपया इसे अनदेखा करें। – ${v.centerName}`,
    RECEIPT: (v) =>
      `${v.greet} ${v.studentName} के लिए ${rupees(v.amount)} प्राप्त हुए। ${
        v.balance && v.balance > 0 ? `शेष राशि: ${rupees(v.balance)}।` : 'सभी बकाया चुका दिए गए हैं।'
      } धन्यवाद! – ${v.centerName}`,
  },
};

export function renderMessage(kind: MessageKind, lang: string, v: MessageVars): string {
  const t = TEMPLATES[(SUPPORTED_LANGUAGES as readonly string[]).includes(lang) ? (lang as Lang) : 'en'];
  return t[kind]({
    ...v,
    greet: t.greet(v.parentName),
    mon: monthLabel(v.month, t.locale),
    due: v.dueDate ? dateLabel(v.dueDate, t.locale) : '',
    upi: v.upiId ? t.upi(v.upiId) : '',
  });
}

/** Click-to-send WhatsApp link — works with no API setup at all. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}
