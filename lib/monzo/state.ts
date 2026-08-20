import { timingSafeEqual } from 'node:crypto';

/** Confirms the callback is answering the request we started, not a forged one. */
export function verifyState(
  cookieState: string | undefined,
  returnedState: string | null,
): boolean {
  if (!cookieState || !returnedState) return false;
  const a = Buffer.from(cookieState);
  const b = Buffer.from(returnedState);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
