import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDealerId } from "@/lib/get-dealer-id";

/**
 * Resolve the dealer_id for an admin SERVER COMPONENT (or any server-side
 * read during a request) from the authenticated operator's session, falling
 * back to the env default (single-tenant deploy) then the seeded demo tenant
 * via getDealerId().
 *
 * Use this instead of reading process.env.DEALER_ID directly in a page: a
 * hardcoded env read ignores the logged-in operator's tenant, so a multi-tenant
 * deployment would serve every operator the same dealer's data. This mirrors the
 * API-route pattern (requireAuth -> getDealerId) for the server-component layer.
 */
export async function getServerDealerId(): Promise<string> {
  const session = await getServerSession(authOptions);
  return getDealerId({ user: { dealer_id: session?.user?.dealer_id } });
}
