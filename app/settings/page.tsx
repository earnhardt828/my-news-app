"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "../components/theme-toggle";
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

type AccountDeletionRequest = {
  id: number;
  status: string;
  created_at: string;
};

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [username, setUsername] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRecord[]>([]);
  const [deletionRequest, setDeletionRequest] =
    useState<AccountDeletionRequest | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [activeBlockedUserId, setActiveBlockedUserId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmittingDeletionRequest, setIsSubmittingDeletionRequest] =
    useState(false);

  useEffect(() => {
    async function loadSettings() {
      setIsLoading(true);

      const { data } = await supabase.auth.getUser();
      const user = data.user;

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });
      setContactInfo(user?.email ?? "");

      if (!user?.id) {
        setUsername("");
        setBlockedUsers([]);
        setDeletionRequest(null);
        setIsLoading(false);
        return;
      }

      const [profileResult, blockedUsersResult, deletionRequestResult] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("username")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("blocked_users")
            .select("id, blocked_user_id, created_at")
            .eq("blocker_id", user.id)
            .order("created_at", { ascending: false }),
          supabase
            .from("account_deletion_requests")
            .select("id, status, created_at")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

      setUsername(profileResult.data?.username ?? "");
      setDeletionRequest(
        (deletionRequestResult.data as AccountDeletionRequest | null) ?? null
      );

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

    loadSettings();
  }, []);

  const handleSaveAccount = async () => {
    if (!currentUser?.id) {
      setMessage("Log in first to update account settings.");
      return;
    }

    if (!username.trim()) {
      setMessage("Enter a username before saving.");
      return;
    }

    setIsSavingAccount(true);

    const { error } = await supabase.from("profiles").upsert({
      id: currentUser.id,
      email: currentUser.email,
      username: username.trim(),
    });

    setIsSavingAccount(false);

    if (error) {
      setMessage(error.message ?? "Could not save your username.");
      return;
    }

    setMessage(
      "Username saved. Contact info remains a safe placeholder until secure email-change support is added."
    );
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setBlockedUsers([]);
    setDeletionRequest(null);
    setMessage("Logged out.");
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

  const handleDeleteAccountRequest = async () => {
    if (!currentUser?.id) {
      setMessage("Log in to request account deletion.");
      setIsDeleteModalOpen(false);
      return;
    }

    if (deletionRequest) {
      setMessage("You already have an account deletion request on file.");
      setIsDeleteModalOpen(false);
      return;
    }

    setIsSubmittingDeletionRequest(true);

    const { data, error } = await supabase
      .from("account_deletion_requests")
      .insert({
        user_id: currentUser.id,
      })
      .select("id, status, created_at")
      .single();

    setIsSubmittingDeletionRequest(false);
    setIsDeleteModalOpen(false);

    if (error) {
      console.error("Error creating account deletion request:", error);
      setMessage("Could not submit your deletion request. Please try again.");
      return;
    }

    setDeletionRequest(data as AccountDeletionRequest);
    setMessage(
      "Account deletion request submitted. A backend review flow can process it safely."
    );
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <div className="loading-state">
          <strong>Loading settings</strong>
          <span>Fetching your account preferences and safety settings.</span>
        </div>
      ) : (
        <div className="stack settings-list-shell">
          <section className="settings-list-section">
            <p className="settings-section-title">Account</p>
            <div className="settings-list-card">
              <div className="settings-list-row settings-list-row-static">
                <div className="settings-list-copy">
                  <strong>Change username</strong>
                  <span>Update how your profile name appears across Mirur.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </div>
              <div className="settings-inline-fields">
                <input
                  className="input"
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="settings-list-row settings-list-row-static">
                <div className="settings-list-copy">
                  <strong>Update contact info</strong>
                  <span>
                    {currentUser?.email
                      ? "Your current sign-in email is shown below."
                      : "Log in to review your contact info."}
                  </span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </div>
              <div className="settings-inline-fields">
                <input
                  className="input"
                  type="email"
                  placeholder="Contact email"
                  value={contactInfo}
                  onChange={(event) => setContactInfo(event.target.value)}
                />
                <div className="muted settings-inline-note">
                  Secure email updates can be added later with a dedicated auth flow.
                </div>
              </div>

              <div className="settings-inline-actions">
                <button
                  className="button button-accent"
                  onClick={handleSaveAccount}
                  disabled={isSavingAccount}
                >
                  {isSavingAccount ? "Saving..." : "Save Account"}
                </button>
              </div>

              <button className="settings-list-row settings-list-row-button" onClick={handleLogOut}>
                <div className="settings-list-copy">
                  <strong>Log out</strong>
                  <span>Sign out of your Mirur account on this device.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </button>

              <button
                className="settings-list-row settings-list-row-button settings-list-row-danger"
                onClick={() => setIsDeleteModalOpen(true)}
                disabled={Boolean(deletionRequest)}
              >
                <div className="settings-list-copy">
                  <strong>Delete account</strong>
                  <span>
                    {deletionRequest
                      ? `Request submitted ${new Date(
                          deletionRequest.created_at
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}`
                      : "Submit a safe deletion request for backend review."}
                  </span>
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
                  <span>Reach out at support@mirur.app for urgent safety concerns.</span>
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
                  <span>See the basic rules for using the app and posting content.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>

              <Link href="/community-guidelines" className="settings-list-row">
                <div className="settings-list-copy">
                  <strong>Community Guidelines</strong>
                  <span>Learn what behavior is expected in comments and reports.</span>
                </div>
                <span className="settings-chevron" aria-hidden="true">
                  ›
                </span>
              </Link>
            </div>
          </section>

          {message ? <div className="chip chip-accent">{message}</div> : null}
        </div>
      )}

      {isDeleteModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-delete-title"
        >
          <div className="modal-card">
            <div className="stack" style={{ gap: "6px" }}>
              <h3 id="settings-delete-title" className="modal-title">
                Request account deletion
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to submit an account deletion request? This
                will create a review record in Supabase for follow-up.
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isSubmittingDeletionRequest}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger settings-danger-button"
                onClick={handleDeleteAccountRequest}
                disabled={isSubmittingDeletionRequest}
              >
                {isSubmittingDeletionRequest ? "Submitting..." : "Submit Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
