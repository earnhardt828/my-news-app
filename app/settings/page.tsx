"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import LoadingScreen from "../components/loading-screen";
import ThemeToggle from "../components/theme-toggle";
import { ensureProfileRow } from "../../lib/profile-store";
import { supabase } from "../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

type BlockedUserRecord = {
  id: number;
  blocked_user_id: string;
  created_at: string;
  username: string | null;
  avatar_url: string | null;
};

type DbBlockedUser = {
  id: number;
  blocked_user_id: string;
  created_at: string;
};

type DbProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
};

export default function SettingsPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRecord[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeBlockedUserId, setActiveBlockedUserId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });

      if (!user?.id) {
        setBlockedUsers([]);
        setIsLoading(false);
        return;
      }

      const [profileResult, blockedUsersResult] = await Promise.all([
        ensureProfileRow({
          id: user.id,
          email: user.email ?? null,
        }),
        supabase
          .from("blocked_users")
          .select("id, blocked_user_id, created_at")
          .eq("blocker_id", user.id)
          .order("created_at", { ascending: false }),
      ]);

      if (profileResult.error) {
        console.error("Error loading settings profile:", profileResult.error);
        setMessage(profileResult.error.message ?? "Could not load your profile.");
      }

      const blockedRecords = (blockedUsersResult.data ?? []) as DbBlockedUser[];

      if (blockedRecords.length === 0) {
        setBlockedUsers([]);
        setIsLoading(false);
        return;
      }

      const blockedUserIds = blockedRecords.map((blockedUser) => blockedUser.blocked_user_id);
      const { data: blockedProfilesData } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", blockedUserIds);

      const blockedProfiles = (blockedProfilesData ?? []) as DbProfile[];
      const profileLookup = new Map(
        blockedProfiles.map((profile) => [
          profile.id,
          {
            username: profile.username,
            avatar_url: profile.avatar_url,
          },
        ])
      );

      setBlockedUsers(
        blockedRecords.map((blockedUser) => ({
          ...blockedUser,
          username: profileLookup.get(blockedUser.blocked_user_id)?.username ?? null,
          avatar_url: profileLookup.get(blockedUser.blocked_user_id)?.avatar_url ?? null,
        }))
      );
      setIsLoading(false);
    }

    void loadSettings();
  }, []);

  const handleLogOut = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      setMessage(error.message ?? "Could not log out.");
      return;
    }

    setCurrentUser(null);
    setBlockedUsers([]);
    setDeleteStatus(null);
    setMessage("Logged out.");
    router.push("/profile#signed-out");
    router.refresh();
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    if (!currentUser?.id) {
      setMessage("Log in to manage blocked users.");
      return;
    }

    setActiveBlockedUserId(blockedUserId);

    const { error } = await supabase
      .from("blocked_users")
      .delete()
      .eq("blocker_id", currentUser.id)
      .eq("blocked_user_id", blockedUserId);

    setActiveBlockedUserId(null);

    if (error) {
      console.error("Error unblocking user:", error);
      setMessage("Could not unblock that user.");
      return;
    }

    setBlockedUsers((prev) =>
      prev.filter((blockedUser) => blockedUser.blocked_user_id !== blockedUserId)
    );
    setMessage("Blocked user removed.");
  };

  const handleDeleteAccount = async () => {
    if (!currentUser?.id) {
      setDeleteStatus({
        type: "error",
        text: "Log in to delete your account.",
      });
      return;
    }

    if (deleteConfirmationText.trim().toLowerCase() !== "delete") {
      setDeleteStatus({
        type: "error",
        text: "Type delete to confirm.",
      });
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      setDeleteStatus({
        type: "error",
        text: "Log in again before deleting your account.",
      });
      return;
    }

    setIsDeletingAccount(true);
    setDeleteStatus(null);

    const response = await fetch("/api/account/delete", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;

    if (!response.ok) {
      setIsDeletingAccount(false);
      setDeleteStatus({
        type: "error",
        text:
          payload?.error ??
          (response.status === 503
            ? "Account deletion is not configured yet."
            : "Could not delete your account right now."),
      });
      return;
    }

    await supabase.auth.signOut();
    setIsDeletingAccount(false);
    setIsDeleteModalOpen(false);
    setDeleteConfirmationText("");
    setDeleteStatus({
      type: "success",
      text: payload?.message ?? "Your account has been deleted.",
    });
    router.push("/profile#account-deleted");
    router.refresh();
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="stack settings-list-shell">
          <section className="settings-list-section">
            <p className="settings-section-title">Account</p>
            <div className="settings-list-card">
              <Link href="/settings/username" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Change username</strong>
                  <span>Update how your profile name appears across Reflekt.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <Link href="/settings/contact" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Update contact info</strong>
                  <span>Save a contact email without changing your sign-in address.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <button className="settings-list-row settings-list-row-button" onClick={handleLogOut}>
                <div className="settings-list-copy">
                  <strong>Log out</strong>
                  <span>Sign out of your Reflekt account on this device.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                className="settings-list-row settings-list-row-button settings-list-row-danger"
                onClick={() => {
                  setDeleteStatus(null);
                  setDeleteConfirmationText("");
                  setIsDeleteModalOpen(true);
                }}
              >
                <div className="settings-list-copy">
                  <strong>Delete account</strong>
                  <span>Permanently remove your Reflekt account and related data.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </button>
            </div>
          </section>

          <section className="settings-list-section">
            <p className="settings-section-title">Appearance</p>
            <div className="settings-list-card">
              <div className="settings-list-row settings-list-row-toggle">
                <div className="settings-list-copy">
                  <strong>Dark mode</strong>
                  <span>Saved locally and applied across the entire app.</span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </section>

          <section className="settings-list-section">
            <p className="settings-section-title">Safety</p>
            <div className="settings-list-card">
              <div className="settings-list-row settings-list-row-static">
                <div className="settings-list-copy">
                  <strong>Blocked users</strong>
                  <span>
                    {blockedUsers.length === 0
                      ? "No blocked users yet. Use Block on comments to manage this list."
                      : `${blockedUsers.length} blocked account${
                          blockedUsers.length === 1 ? "" : "s"
                        }`}
                  </span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </div>

              {blockedUsers.length > 0 ? (
                <div className="settings-sublist">
                  {blockedUsers.map((blockedUser) => (
                    <div key={blockedUser.id} className="settings-subrow">
                      <div className="settings-list-copy">
                        <strong>
                          {blockedUser.username
                            ? `@${blockedUser.username}`
                            : blockedUser.blocked_user_id}
                        </strong>
                        <span>
                          Blocked on{" "}
                          {new Date(blockedUser.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <button
                        className="comment-action"
                        onClick={() => handleUnblockUser(blockedUser.blocked_user_id)}
                        disabled={activeBlockedUserId === blockedUser.blocked_user_id}
                      >
                        {activeBlockedUserId === blockedUser.blocked_user_id
                          ? "Unblocking..."
                          : "Unblock"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="settings-list-row settings-list-row-static">
                <div className="settings-list-copy">
                  <strong>Report abuse or safety issue</strong>
                  <span>Reach out at support@reflekt.app for urgent safety concerns.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </div>
            </div>
          </section>

          <section className="settings-list-section">
            <p className="settings-section-title">Legal</p>
            <div className="settings-list-card">
              <Link href="/privacy" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Privacy Policy</strong>
                  <span>Review how account, comments, and profile data are handled.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <Link href="/terms" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Terms of Use</strong>
                  <span>Read the rules for using Reflekt across web and mobile.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <Link href="/community-guidelines" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Community Guidelines</strong>
                  <span>See what keeps conversations healthy and safe.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </div>
          </section>

          {message ? <div className="chip chip-accent">{message}</div> : null}

          {isDeleteModalOpen ? (
            <div className="modal-overlay" role="presentation">
              <div className="modal-card">
                <h3 style={{ marginTop: 0 }}>Delete account</h3>
                <p className="muted">
                  This permanently deletes your Reflekt account and related profile data.
                  Type <strong>delete</strong> to confirm.
                </p>
                <div className="input-row">
                  <input
                    className="input"
                    type="text"
                    value={deleteConfirmationText}
                    onChange={(event) => setDeleteConfirmationText(event.target.value)}
                    placeholder="Type delete"
                    disabled={isDeletingAccount}
                  />
                </div>
                {deleteStatus ? (
                  <div
                    className={`status-message ${
                      deleteStatus.type === "success" ? "status-success" : "status-error"
                    }`}
                  >
                    {deleteStatus.text}
                  </div>
                ) : null}
                <div className="toolbar">
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      if (!isDeletingAccount) {
                        setIsDeleteModalOpen(false);
                        setDeleteStatus(null);
                        setDeleteConfirmationText("");
                      }
                    }}
                    disabled={isDeletingAccount}
                  >
                    Cancel
                  </button>
                  <button
                    className="button settings-danger-button"
                    style={{
                      background: "#c13a50",
                      color: "#ffffff",
                      borderColor: "#c13a50",
                    }}
                    onClick={handleDeleteAccount}
                    disabled={
                      isDeletingAccount || deleteConfirmationText.trim().toLowerCase() !== "delete"
                    }
                  >
                    {isDeletingAccount ? "Deleting..." : "Delete account"}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
