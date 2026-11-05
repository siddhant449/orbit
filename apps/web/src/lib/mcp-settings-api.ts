import { AccountError, getBinding, listClients, revokeClient, setBinding } from "@brandloop/db";
import { z } from "zod";
import { getAccount } from "@/lib/account";

const fail = (status: number, error: string) => Response.json({ error }, { status });
const Body = z.object({ profileId: z.string().min(1).max(100) });

export type McpSettingsDto = {
  profileId: string | null;
  profiles: { id: string; name: string }[];
  clients: { id: string; clientName: string; lastUsedAt: string }[];
};

/** The settings for the signed-in user: the profile assistants act as (their owned profiles only) and the connected assistants. */
export async function loadMcpSettings(): Promise<McpSettingsDto> {
  const account = await getAccount();
  const userId = account.user.id;
  const [binding, clients] = await Promise.all([getBinding(userId), listClients(userId)]);
  return {
    profileId: binding?.profileId ?? null,
    profiles: account.profiles.filter((p) => p.ownerUserId === userId).map((p) => ({ id: p.id, name: p.name })),
    clients: clients.map((c) => ({ id: c.id, clientName: c.clientName, lastUsedAt: c.lastUsedAt.toISOString() })),
  };
}

export async function getMcpSettingsHandler(): Promise<Response> {
  return Response.json(await loadMcpSettings());
}

export async function putMcpSettingsHandler(request: Request): Promise<Response> {
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(400, "Choose a profile.");
  const account = await getAccount();
  try {
    await setBinding(account.user.id, body.data.profileId);
  } catch (err) {
    if (err instanceof AccountError) return fail(404, "That profile wasn't found.");
    throw err;
  }
  return Response.json(await loadMcpSettings());
}

export async function deleteMcpClientHandler(id: string): Promise<Response> {
  const account = await getAccount();
  try {
    await revokeClient(account.user.id, id);
  } catch (err) {
    if (err instanceof AccountError) return fail(404, "That assistant wasn't found.");
    throw err;
  }
  return Response.json(await loadMcpSettings());
}
