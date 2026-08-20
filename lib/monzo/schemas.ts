import { z } from 'zod';

/** Response from exchanging an OAuth code (or refreshing) for tokens. */
export const monzoTokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
});
export type MonzoTokenResponse = z.infer<typeof monzoTokenResponseSchema>;

/**
 * The webhook envelope's outer shape only. `data` is deliberately
 * `z.unknown()` — the whole point of the capture phase is that its contents
 * (`counterparty` in particular) are undocumented. Validating a shape we
 * haven't observed yet would just be validating a guess.
 */
export const monzoWebhookEnvelopeSchema = z.object({
  type: z.string(),
  data: z.unknown(),
});
export type MonzoWebhookEnvelope = z.infer<typeof monzoWebhookEnvelopeSchema>;
