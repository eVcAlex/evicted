import { describe, expect, it } from 'vitest';
import { monzoTokenResponseSchema, monzoWebhookEnvelopeSchema } from './schemas';

describe('monzoTokenResponseSchema', () => {
  it('parses a real-shaped token exchange response', () => {
    const parsed = monzoTokenResponseSchema.safeParse({
      access_token: 'access_abc',
      refresh_token: 'refresh_abc',
      expires_in: 21600,
      client_id: 'oauth2client_abc',
      token_type: 'Bearer',
      user_id: 'user_abc',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a response missing refresh_token', () => {
    const parsed = monzoTokenResponseSchema.safeParse({
      access_token: 'access_abc',
      expires_in: 21600,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('monzoWebhookEnvelopeSchema', () => {
  it('accepts any data shape under the known envelope', () => {
    const parsed = monzoWebhookEnvelopeSchema.safeParse({
      type: 'transaction.created',
      data: { anything: 'at all', nested: { counterparty: { name: 'A Friend' } } },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload with no type', () => {
    const parsed = monzoWebhookEnvelopeSchema.safeParse({ data: {} });
    expect(parsed.success).toBe(false);
  });
});
