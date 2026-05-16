"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { ensureProfileRow, saveProfilePatch } from "../../../lib/profile-store";
import { supabase } from "../../../lib/supabase";

type UserState = {
  id: string;
  email: string | null;
};

export default function SettingsContactPage() {
  const [currentUser, setCurrentUser] = useState<UserState | null>(null);
  const [contactEmail, setContactEmail] = useState("");
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
        setContactEmail("");
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
          text: error?.message ?? "Could not load your contact info.",
        });
        setIsLoading(false);
        return;
      }

      setContactEmail(data.contact_email ?? "");
      setIsLoading(false);
    }

    void loadPage();
  }, []);

  const handleSave = async () => {
    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Log in first to update your contact info.",
      });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const trimmedContactEmail = contactEmail.trim();

    if (trimmedContactEmail) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!emailPattern.test(trimmedContactEmail)) {
        setIsSaving(false);
        setMessage({
          type: "error",
          text: "Enter a valid email address.",
        });
        return;
      }

      const [matchingContactEmailResult, matchingAccountEmailResult] = await Promise.all([
        supabase
          .from("profiles")
          .select("id")
          .ilike("contact_email", trimmedContactEmail)
          .limit(1),
        supabase
          .from("profiles")
          .select("id")
          .ilike("email", trimmedContactEmail)
          .limit(1),
      ]);

      const duplicateProfileId =
        matchingContactEmailResult.data?.[0]?.id ?? matchingAccountEmailResult.data?.[0]?.id ?? null;
      const duplicateError = matchingContactEmailResult.error ?? matchingAccountEmailResult.error;

      if (duplicateError) {
        setIsSaving(false);
        setMessage({
          type: "error",
          text: duplicateError.message ?? "Could not validate that email.",
        });
        return;
      }

      if (duplicateProfileId && duplicateProfileId !== currentUser.id) {
        setIsSaving(false);
        setMessage({
          type: "error",
          text: "That email is already in use.",
        });
        return;
      }
    }

    const { error } = await saveProfilePatch(
      {
        id: currentUser.id,
        email: currentUser.email,
      },
      {
        id: currentUser.id,
        email: currentUser.email,
        contact_email: trimmedContactEmail || null,
      }
    );

    setIsSaving(false);

    if (error) {
      setMessage({
        type: "error",
        text: error.message ?? "Could not save your contact info.",
      });
      return;
    }

    setContactEmail(trimmedContactEmail);
    setMessage({
      type: "success",
      text: "Contact info updated.",
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
                Log in to update your contact info.
              </div>
            ) : (
              <>
                <p className="settings-detail-note">
                  Current account email: {currentUser.email ?? "No email on file"}
                </p>
                <div className="input-row settings-compact-input-row">
                  <input
                    className="input settings-compact-input"
                    type="email"
                    placeholder="Contact email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
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
