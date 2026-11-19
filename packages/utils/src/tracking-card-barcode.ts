import { BUSINESS_NUMBER_PREFIX } from '@company/constants';
import { normalizeDateOnly } from './date-time.js';

const MAX_SEQUENCE = 18446744073709551615n;
const CARD_NUMBER_PATTERN = /^(\d{8})-([1-9]\d{0,19})-k-(\d{3,20})$/;
const BARCODE_PATTERN = /^(\d{6})([1-9]\d{0,19})k([1-9]\d{0,19})$/;

interface TrackingCardNumberParts {
  date: string;
  taskSequence: string;
  cardSequence: string;
}

function isCalendarDate(value: string): boolean {
  try {
    normalizeDateOnly(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

function isSequence(value: string): boolean {
  return /^[1-9]\d{0,19}$/.test(value) && BigInt(value) <= MAX_SEQUENCE;
}

function readCardNumber(cardNo: string): TrackingCardNumberParts | null {
  const prefix = BUSINESS_NUMBER_PREFIX.production_batch;
  const suffix = cardNo.slice(prefix.length);
  const match = CARD_NUMBER_PATTERN.exec(suffix);
  if (!cardNo.startsWith(prefix) || !match || match[0] !== suffix) return null;
  const [, date, taskSequence, paddedCardSequence] = match;
  const cardSequence = BigInt(paddedCardSequence).toString();
  if (
    !isCalendarDate(date) ||
    !isSequence(taskSequence) ||
    !isSequence(cardSequence) ||
    paddedCardSequence !== cardSequence.padStart(3, '0')
  )
    return null;
  return { date, taskSequence, cardSequence };
}

export function isCanonicalTrackingCardNo(value: string): boolean {
  return readCardNumber(value) !== null;
}

/** Encode the canonical card number; two-digit years always mean 2000–2099. */
export function encodeTrackingCardBarcode(cardNo: string): string {
  const parts = readCardNumber(cardNo);
  if (!parts || !parts.date.startsWith('20'))
    throw new RangeError('追踪卡编号格式无效或超出短码范围，日期须为 2000 至 2099 年');
  return `${parts.date.slice(2)}${parts.taskSequence}k${parts.cardSequence}`;
}

/** Return the canonical card number only for a complete, valid compact barcode. */
export function decodeTrackingCardBarcode(value: string): string | null {
  const match = BARCODE_PATTERN.exec(value);
  if (!match || match[0] !== value) return null;
  const [, shortDate, taskSequence, cardSequence] = match;
  const date = `20${shortDate}`;
  if (!isCalendarDate(date) || !isSequence(taskSequence) || !isSequence(cardSequence)) return null;
  return `${BUSINESS_NUMBER_PREFIX.production_batch}${date}-${taskSequence}-k-${cardSequence.padStart(3, '0')}`;
}

/** Keep manual card numbers and ordinary search text available to the owning use case. */
export function normalizeTrackingCardNo(value: string): string {
  const text = value.trim();
  return decodeTrackingCardBarcode(text) ?? text;
}
