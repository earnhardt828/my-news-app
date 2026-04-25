"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ThemeToggle from "../components/theme-toggle";
import { supabase } from "../../lib/supabase";

type UserState = {
  id: string | null;
  email: string | null;
} | null;

const BLOCKED_USERS_STORAGE_KEY = "mirur-blocked-users-placeholder";

function getInitialBlockedUsers() {
  if (typeof window === "undefined") {
    return [] as string[];
  }

  const storedBlockedUsers = window.localStorage.getItem(
    BLOCKED_USERS_STORAGE_KEY
  );

  if (!storedBlockedUsers) {
    return [] as string[];
  }

  try {
    return JSON.parse(storedBlockedUsers) as string[];
  } catch (error) {
    console.error("Could not parse blocked users placeholder state:", error);
    return [] as string[];
  }
}

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [username, setUsername] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [blockedUsers, setBlockedUsers] = useState<string[]>(getInitialBlockedUsers);
  const [blockedUserInput, setBlockedUserInput] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
        setIsLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

      setUsername(profile?.username ?? "");
      setIsLoading(false);
    }

    loadSettings();
  }, []);

  const persistBlockedUsers = (nextBlockedUsers: string[]) => {
    setBlockedUsers(nextBlockedUsers);
    window.localStorage.setItem(
      BLOCKED_USERS_STORAGE_KEY,
      JSON.stringify(nextBlockedUsers)
    );
  };

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
      "Username saved. Contact info is shown here as a placeholder until secure email-change support is added."
    );
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setMessage("Logged out.");
  };

  const handleAddBlockedUser = () => {
    const nextUser = blockedUserInput.trim();

    if (!nextUser) {
      setMessage("Enter a username to add to the blocked users placeholder list.");
      return;
    }

    if (blockedUsers.includes(nextUser)) {
      setMessage("That user is already in your blocked list.");
      return;
    }

    persistBlockedUsers([...blockedUsers, nextUser]);
    setBlockedUserInput("");
    setMessage(
      "Blocked users placeholder updated locally. Full blocking enforcement will need backend support."
    );
  };

  const handleUnblockUser = (blockedUser: string) => {
    persistBlockedUsers(
      blockedUsers.filter((currentBlockedUser) => currentBlockedUser !== blockedUser)
    );
    setMessage(
      "Blocked users placeholder updated locally. Full blocking enforcement will need backend support."
    );
  };

  const handleDeleteAccountRequest = () => {
    setIsDeleteModalOpen(false);
    setMessage(
      "Account deletion requires secure backend support or a server-side service role. This button is a safe placeholder for now."
    );
  };

  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Settings</p>
        <h2 className="page-title">Manage your Mirur experience.</h2>
        <p className="page-subtitle">
          Review account details, appearance, safety controls, and legal links
          in one place.
        </p>
      </div>

      {isLoading ? (
        <div className="loading-state">
          <strong>Loading settings</strong>
          <span>Fetching your account preferences and saved profile details.</span>
        </div>
      ) : (
        <div className="stack">
          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Account
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Username and contact details
              </h3>
            </div>

            <div className="input-row">
              <input
                className="input"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />

              <input
                className="input"
                type="email"
                placeholder="Contact email"
                value={contactInfo}
                onChange={(event) => setContactInfo(event.target.value)}
              />
            </div>

            <div className="comment-card">
              <strong>Contact info</strong>
              <div className="muted" style={{ marginTop: "6px" }}>
                {currentUser?.email
                  ? "Your current sign-in email is shown above. Secure email updates can be added later with a dedicated auth flow."
                  : "Log in to review and eventually update your contact info."}
              </div>
            </div>

            <div className="toolbar">
              <button
                className="button button-accent"
                onClick={handleSaveAccount}
                disabled={isSavingAccount}
              >
                {isSavingAccount ? "Saving..." : "Save Account"}
              </button>
              <button className="button button-secondary" onClick={handleLogOut}>
                Log Out
              </button>
            </div>
          </section>

          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Appearance
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Theme preference
              </h3>
            </div>

            <div className="settings-row">
              <div className="stack" style={{ gap: "4px" }}>
                <strong>Dark mode</strong>
                <span className="muted">
                  Saved locally and applied across the entire app.
                </span>
              </div>
              <ThemeToggle />
            </div>
          </section>

          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Safety
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Blocked users
              </h3>
            </div>

            <div className="input-row settings-inline-form">
              <input
                className="input"
                type="text"
                placeholder="Add a username to block"
                value={blockedUserInput}
                onChange={(event) => setBlockedUserInput(event.target.value)}
              />
              <button className="button button-secondary" onClick={handleAddBlockedUser}>
                Add
              </button>
            </div>

            {blockedUsers.length === 0 ? (
              <div className="empty-state">
                <strong>No blocked users yet</strong>
                <span>
                  This is a local placeholder UI for future blocking support.
                </span>
              </div>
            ) : (
              <div className="comment-list">
                {blockedUsers.map((blockedUser) => (
                  <div key={blockedUser} className="comment-card settings-row">
                    <div className="stack" style={{ gap: "4px" }}>
                      <strong>@{blockedUser}</strong>
                      <span className="muted">
                        Local placeholder only. Full blocking enforcement will
                        require backend support.
                      </span>
                    </div>
                    <button
                      className="comment-action"
                      onClick={() => handleUnblockUser(blockedUser)}
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="section-card stack">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Legal
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Policies and guidelines
              </h3>
            </div>

            <div className="comment-list">
              <Link href="/privacy" className="comment-card">
                <strong>Privacy Policy</strong>
                <div className="muted" style={{ marginTop: "6px" }}>
                  Review how account, comments, and profile data are handled.
                </div>
              </Link>

              <Link href="/terms" className="comment-card">
                <strong>Terms of Use</strong>
                <div className="muted" style={{ marginTop: "6px" }}>
                  See the basic rules for using the app and posting content.
                </div>
              </Link>

              <Link href="/community-guidelines" className="comment-card">
                <strong>Community Guidelines</strong>
                <div className="muted" style={{ marginTop: "6px" }}>
                  Learn what behavior is expected in comments and reports.
                </div>
              </Link>
            </div>
          </section>

          <section className="section-card stack danger-zone-card">
            <div>
              <p className="page-eyebrow" style={{ marginBottom: "8px" }}>
                Danger Zone
              </p>
              <h3 className="profile-name" style={{ fontSize: "1.25rem" }}>
                Account deletion
              </h3>
            </div>

            <div className="comment-card">
              <strong>Delete account</strong>
              <div className="muted" style={{ marginTop: "6px" }}>
                This requires secure backend support before it should permanently
                remove auth and profile records.
              </div>
            </div>

            <button
              className="button comment-action-danger settings-danger-button"
              onClick={() => setIsDeleteModalOpen(true)}
            >
              Delete Account
            </button>
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
                Delete account
              </h3>
              <p className="muted" style={{ margin: 0 }}>
                Are you sure you want to continue? Permanent account deletion is
                not enabled yet in the app client.
              </p>
            </div>

            <div className="modal-actions">
              <button
                className="button button-secondary"
                onClick={() => setIsDeleteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="button comment-action-danger settings-danger-button"
                onClick={handleDeleteAccountRequest}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
