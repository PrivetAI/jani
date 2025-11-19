import { z } from 'zod'

const CheckoutPayloadSchema = z.object({
  userId: z.string(),
  type: z.enum(['subscription', 'package', 'item']),
  amountStars: z.number().int().positive(),
  metadata: z.record(z.any()).optional(),
})

export type CheckoutPayload = z.infer<typeof CheckoutPayloadSchema>

export const createMockInvoice = (payload: CheckoutPayload) => {
  CheckoutPayloadSchema.parse(payload)
  const invoiceId = `mock_${Date.now()}`
  return {
    invoiceId,
    status: 'pending',
    payUrl: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=checkout_${invoiceId}`,
    preview: payload,
  }
}
