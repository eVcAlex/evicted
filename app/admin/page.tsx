import { Title } from '@mantine/core';
import { AdminPanel } from '../components/admin/AdminPanel';

export const dynamic = 'force-dynamic';

/**
 * Deliberately unlinked from every public page. Not a secret URL — every
 * write behind it is still PIN-gated — but there is no reason to advertise
 * "here is where the admin tooling lives" to the eight other people who use
 * the group-facing pages, so it is reached by bookmark, not by nav.
 */
export default function AdminPage() {
  return (
    <>
      <Title order={1} mb="lg">
        Admin
      </Title>
      <AdminPanel />
    </>
  );
}
