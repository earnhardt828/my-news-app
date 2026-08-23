"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { ensureProfileRow } from "../../../lib/profile-store";
import { supabase } from "../../../lib/supabase";

type AccountUserState = {
  id: string;
  accountEmail: string | null;
  pendingEmail: string | null;
  username: string | null;
};

function getPendingAuthEmail(user: unknown) {
  const candidate = user as {
    new_email?: string | null;
    email_change?: string | null;
    user_metadata?: {
      pending_email?: string | null;
      email_change?: string | null;
    } | null;
  } | null;

  return (
    candidate?.new_email?.trim() ||
    candidate?.email_change?.trim() ||
    candidate?.user_metadata?.pending_email?.trim() ||
    candidate?.user_metadata?.email_change?.trim() ||
    null
  );
}

export default function SettingsAccountPage() {
  const [currentUser, setCurrentUser] = useState<AccountUserState | null>(null);
  const [accountEmail, setAccountEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingEmail, setIsSavingEmail] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function refreshAccountUser() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      setCurrentUser(null);
      setAccountEmail("");
      return null;
    }

    const { data: profile } = await ensureProfileRow({
      id: user.id,
      email: user.email ?? null,
    });
    const pendingEmail = getPendingAuthEmail(user);

    setCurrentUser({
      id: user.id,
      accountEmail: user.email ?? null,
      pendingEmail,
      username: profile?.username ?? null,
    });
    setAccountEmail(pendingEmail ?? user.email ?? "");

    return user;
  }

  useEffect(() => {
    async function loadPage() {
      setIsLoading(true);
      await refreshAccountUser();
      setIsLoading(false);
    }

    void loadPage();
  }, []);

  const handleEmailSave = async () => {
    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Log in first to update your account email.",
      });
      return;
    }

    const trimmedEmail = accountEmail.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(trimmedEmail)) {
      setMessage({
        type: "error",
        text: "Enter a valid account email.",
      });
      return;
    }

    setIsSavingEmail(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      email: trimmedEmail,
    });

    if (error) {
      setIsSavingEmail(false);
      setMessage({
        type: "error",
        text: error.message ?? "Could not update your account email.",
      });
      return;
    }

    await supabase.auth.refreshSession().catch(() => null);
    const refreshedUser = await refreshAccountUser();
    const pendingEmail = getPendingAuthEmail(refreshedUser) ?? trimmedEmail;

    setCurrentUser((previous) =>
      previous
        ? {
            ...previous,
            pendingEmail:
              pendingEmail && pendingEmail !== previous.accountEmail ? pendingEmail : previous.pendingEmail,
          }
        : previous
    );
    setAccountEmail(pendingEmail);
    setIsSavingEmail(false);
    setMessage({
      type: "success",
      text: "Check your email to confirm your account.",
    });
  };

  const handlePasswordSave = async () => {
    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Log in first to change your password.",
      });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({
        type: "error",
        text: "Use at least 6 characters for your new password.",
      });
      return;
    }

    setIsSavingPassword(true);
    setMessage(null);

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      setIsSavingPassword(false);
      setMessage({
        type: "error",
        text: error.message ?? "Could not change your password.",
      });
      return;
    }

    await refreshAccountUser();
    setNewPassword("");
    setIsSavingPassword(false);
    setMessage({
      type: "success",
      text: "Password updated.",
    });
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="stack settings-detail-shell">
          <section className="stack settings-compact-form settings-compact-form-plain">
            {!currentUser?.id ? (
              <div className="status-message status-error">
                Log in to update your account email and password.
              </div>
            ) : (
              <>
                <p className="settings-detail-note">
                  Account email: {currentUser.accountEmail ?? "No account email on file"}
                  {currentUser.pendingEmail ? (
                    <>
                      <br />
                      Pending confirmation: {currentUser.pendingEmail}
                    </>
                  ) : null}
                  <br />
                  Profile username: {currentUser.username ?? "Not set"}
                </p>

                <div className="stack settings-contact-fields">
                  <input
                    className="input settings-compact-input"
                    type="email"
                    placeholder="Account email"
                    value={accountEmail}
                    onChange={(event) => setAccountEmail(event.target.value)}
                    disabled={isSavingEmail}
                  />
                  <button
                    className="button button-accent settings-compact-button"
                    onClick={handleEmailSave}
                    disabled={isSavingEmail}
                    type="button"
                  >
                    {isSavingEmail ? "Saving..." : "Update account email"}
                  </button>
                </div>

                <div className="stack settings-contact-fields">
                  <input
                    className="input settings-compact-input"
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={isSavingPassword}
                  />
                  <button
                    className="button button-secondary settings-compact-button"
                    onClick={handlePasswordSave}
                    disabled={isSavingPassword}
                    type="button"
                  >
                    {isSavingPassword ? "Saving..." : "Change password"}
                  </button>
                </div>
              </>
            )}

            {message ? (
              <div
                className={`status-message ${
                  message.type === "success" ? "status-success" : "status-error"
                }`}
              >
                {message.text}
              </div>
            ) : null}
          </section>
        </div>
      )}
    </section>
  );
}
