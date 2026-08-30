import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { withAdminAuth } from './guards';

const mockAuth = vi.mocked(auth);
const savedAllowlist = process.env.ADMIN_ALLOWLIST;

afterEach(() => {
  vi.resetAllMocks();
  if (savedAllowlist === undefined) delete process.env.ADMIN_ALLOWLIST;
  else process.env.ADMIN_ALLOWLIST = savedAllowlist;
});

function request() {
  return new Request('https://example.com/api/admin/toggle', { method: 'POST' });
}

describe('withAdminAuth', () => {
  it('runs the handler for a signed-in allowlisted admin', async () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    mockAuth.mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { email: 'admin@example.com' },
    } as never);
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));
    const req = request();

    const response = await withAdminAuth(handler)(req);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(req);
    expect(response.status).toBe(200);
  });

  it('returns 401 { error: "unauthorised" } when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null } as never);
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withAdminAuth(handler)(request());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorised' });
  });

  it('returns 401 when signed in as a non-allowlisted user', async () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    mockAuth.mockResolvedValue({
      userId: 'user_2',
      sessionClaims: { email: 'intruder@example.com' },
    } as never);
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withAdminAuth(handler)(request());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });

  it('returns 401 when signed in with a claim-less session (no email)', async () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    mockAuth.mockResolvedValue({ userId: 'user_3', sessionClaims: {} } as never);
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withAdminAuth(handler)(request());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });
});
