import type { SupabaseClient } from "@supabase/supabase-js";

export type BlockedUserRow = {
  id: number;
  blocker_id: string;
  blocked_id: string;
  blocked_username: string | null;
  created_at: string;
};

export async function listBlockedUsers(
  supabaseClient: SupabaseClient,
  blockerId: string
): Promise<{
  data: BlockedUserRow[] | null;
  error: { message?: string; code?: string } | null;
}> {
  const { data, error } = await supabaseClient
    .from("blocked_users")
    .select("id, blocker_id, blocked_id, blocked_username, created_at")
    .eq("blocker_id", blockerId)
    .order("created_at", { ascending: false });

  return {
    data: ((data ?? []) as BlockedUserRow[]) ?? null,
    error,
  };
}

export async function listMutuallyHiddenUserIds(
  supabaseClient: SupabaseClient,
  currentUserId: string
): Promise<{
  data: string[] | null;
  error: { message?: string; code?: string } | null;
}> {
  const { data, error } = await supabaseClient
    .from("blocked_users")
    .select("id, blocker_id, blocked_id, blocked_username, created_at")
    .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`)
    .order("created_at", { ascending: false });

  const rows = ((data ?? []) as BlockedUserRow[]) ?? [];

  const hiddenUserIds = new Set<string>();

  rows.forEach((row) => {
    if (row.blocker_id === currentUserId && row.blocked_id) {
      hiddenUserIds.add(row.blocked_id);
    }

    if (row.blocked_id === currentUserId && row.blocker_id) {
      hiddenUserIds.add(row.blocker_id);
    }
  });

  return {
    data: Array.from(hiddenUserIds),
    error,
  };
}

export async function createBlockedUser(
  supabaseClient: SupabaseClient,
  blockerId: string,
  blockedUserId: string,
  blockedUsername?: string | null
): Promise<{
  error: { message?: string; code?: string } | null;
  alreadyExists: boolean;
}> {
  const { data: existingRow, error: existingError } = await supabaseClient
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedUserId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError, alreadyExists: false };
  }

  if (existingRow?.id) {
    return { error: null, alreadyExists: true };
  }

  const { error } = await supabaseClient.from("blocked_users").insert({
    blocker_id: blockerId,
    blocked_id: blockedUserId,
    blocked_username: blockedUsername ?? null,
  });

  return { error, alreadyExists: false };
}

export async function removeBlockedUser(
  supabaseClient: SupabaseClient,
  blockerId: string,
  blockedUserId: string
): Promise<{ error: { message?: string; code?: string } | null }> {
  const { error } = await supabaseClient
    .from("blocked_users")
    .delete()
    .eq("blocker_id", blockerId)
    .eq("blocked_id", blockedUserId);

  return { error };
}
