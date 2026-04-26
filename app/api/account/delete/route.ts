import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getBearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  return authHeader.slice("Bearer ".length).trim();
}

export async function DELETE(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Account deletion is not configured yet." },
      { status: 503 }
    );
  }

  const accessToken = getBearerToken(request);

  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const {
    data: { user },
    error: authError,
  } = await publicClient.auth.getUser(accessToken);

  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const { data: userComments, error: commentsLookupError } = await adminClient
      .from("comments")
      .select("id")
      .eq("user_id", user.id);

    if (commentsLookupError) {
      throw commentsLookupError;
    }

    const commentIds = (userComments ?? []).map((comment) => comment.id);

    if (commentIds.length > 0) {
      const [deleteCommentReports, deleteCommentReactions] = await Promise.all([
        adminClient.from("reports").delete().in("comment_id", commentIds),
        adminClient.from("comment_reactions").delete().in("comment_id", commentIds),
      ]);

      if (deleteCommentReports.error) {
        throw deleteCommentReports.error;
      }

      if (deleteCommentReactions.error) {
        throw deleteCommentReactions.error;
      }
    }

    const deleteOperations = await Promise.all([
      adminClient.from("reports").delete().eq("user_id", user.id),
      adminClient.from("comment_reactions").delete().eq("user_id", user.id),
      adminClient.from("likes").delete().eq("user_id", user.id),
      adminClient.from("saved_articles").delete().eq("user_id", user.id),
      adminClient.from("blocked_users").delete().eq("blocker_id", user.id),
      adminClient.from("blocked_users").delete().eq("blocked_user_id", user.id),
      adminClient.from("comments").delete().eq("user_id", user.id),
      adminClient.from("profiles").delete().eq("id", user.id),
      adminClient.from("account_deletion_requests").delete().eq("user_id", user.id),
    ]);

    for (const result of deleteOperations) {
      if (result.error) {
        throw result.error;
      }
    }

    const { data: avatarFiles } = await adminClient.storage.from("avatars").list(user.id);

    if (avatarFiles?.length) {
      const avatarPaths = avatarFiles.map((file) => `${user.id}/${file.name}`);
      const { error: avatarDeleteError } = await adminClient.storage
        .from("avatars")
        .remove(avatarPaths);

      if (avatarDeleteError) {
        throw avatarDeleteError;
      }
    }

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(user.id);

    if (deleteUserError) {
      throw deleteUserError;
    }

    return NextResponse.json({ message: "Your account has been deleted." });
  } catch (error) {
    console.error("Account deletion failed:", error);
    return NextResponse.json(
      { error: "Could not delete your account right now." },
      { status: 500 }
    );
  }
}
