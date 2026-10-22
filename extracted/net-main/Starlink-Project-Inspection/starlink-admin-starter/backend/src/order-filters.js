import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
});

export const orderFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  customerId: z.string().uuid().optional(),
  linkId: z.string().uuid().optional(),
  orderRef: z.string().trim().max(100).optional(),
  bundleId: z.string().trim().max(100).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'cancelled', 'refunded']).optional(),
  notificationStatus: z.enum(['not queued', 'queued', 'processing', 'sent', 'failed']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional()
}).refine((filters) => !filters.from || !filters.to || filters.from <= filters.to, {
  message: 'Start date must be before or equal to end date.'
});

export function escapeLikePattern(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

export function orderRange(page, pageSize) {
  const start = (page - 1) * pageSize;
  return { from: start, to: start + pageSize - 1 };
}