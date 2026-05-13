"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { ensureProfileRow, saveProfilePatch } from "../../../lib/profile-store";
import { isUsernameAllowed } from "../../../lib/moderation";
import { supabase } from "../../../lib/supabase";

type UserState = {
  id: string;
  email: string | null;
};

export default function SettingsUsernamePage() {
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState("");
  const [usernameLastChangedAt, setUsernameLastChangedAt] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadPage() {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        setCurrentUser(null);
        setUsername("");
        setSavedUsername("");
        setUsernameLastChangedAt(null);
        setIsLoading(false);
        return;
      }

      setCurrentUser({
        id: user.id,
        email: user.email ?? null,
      });

      const { data, error } = await ensureProfileRow({
        id: user.id,
        email: user.email ?? null,
      });

      if (error || !data) {
        setMessage({
          type: "error",
          text: error?.message ?? "Could not load your username settings.",
        });
        setIsLoading(false);
        return;
      }

      setUsername(data.username ?? "");
      setSavedUsername(data.username ?? "");
      setUsernameLastChangedAt(data.username_last_changed_at ?? null);
      setIsLoading(false);
    }

    void loadPage();
  }, []);

  const handleSave = async () => {
    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Log in first to update your username.",
      });
      return;
    }

    const trimmedUsername = username.trim();

    if (!trimmedUsername) {
      setMessage({
        type: "error",
        text: "Enter a username before saving.",
      });
      return;
    }

    if (!isUsernameAllowed(trimmedUsername)) {
      setMessage({
        type: "error",
        text: "That username is not available. Please choose another.",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const { data: matchingProfiles, error: availabilityError } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", trimmedUsername);

    if (availabilityError) {
      setIsSaving(false);
      setMessage({
        type: "error",
        text: availabilityError.message ?? "Could not check username availability.",
      });
      return;
    }

    const isTaken = (matchingProfiles ?? []).some((profile) => profile.id !== currentUser.id);

    if (isTaken) {
      setIsSaving(false);
      setMessage({
        type: "error",
        text: "Username already taken.",
      });
      return;
    }

    const isRealUsernameChange =
      trimmedUsername.toLowerCase() !== savedUsername.trim().toLowerCase();

    if (isRealUsernameChange && usernameLastChangedAt) {
      const lastChangedAt = new Date(usernameLastChangedAt).getTime();

      if (!Number.isNaN(lastChangedAt)) {
        const twentyFourHoursMs = 24 * 60 * 60 * 1000;

        if (Date.now() - lastChangedAt < twentyFourHoursMs) {
          setIsSaving(false);
          setMessage({
            type: "error",
            text: "You can only change your username once per day.",
          });
          return;
        }
      }
    }

    const nextUsernameChangedAt = isRealUsernameChange
      ? new Date().toISOString()
      : usernameLastChangedAt;

    const { error } = await saveProfilePatch(
      {
        id: currentUser.id,
        email: currentUser.email,
      },
      {
        id: currentUser.id,
        email: currentUser.email,
        username: trimmedUsername,
        username_last_changed_at: nextUsernameChangedAt ?? null,
      }
    );

    setIsSaving(false);

    if (error) {
      setMessage({
        type: "error",
        text: error.message ?? "Could not save your username.",
      });
      return;
    }

    setSavedUsername(trimmedUsername);
    setUsername(trimmedUsername);
    setUsernameLastChangedAt(nextUsernameChangedAt ?? null);
    setMessage({
      type: "success",
      text: "Username updated.",
    });
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="stack settings-detail-shell">
          <section className="section-card stack settings-compact-form">
            {!currentUser?.id ? (
              <div className="status-message status-error">
                Log in to update your username.
              </div>
            ) : (
              <>
                <div className="input-row settings-compact-input-row">
                  <input
                    className="input settings-compact-input"
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void handleSave();
                      }
                    }}
                    disabled={isSaving}
                  />
                </div>
                <div className="toolbar settings-compact-actions">
                  <button
                    className="button button-accent settings-compact-button"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save"}
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
