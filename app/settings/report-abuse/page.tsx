"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { supabase } from "../../../lib/supabase";

const ISSUE_TYPES = [
  "Harassment or threats",
  "Hate speech",
  "Impersonation",
  "Spam or scams",
  "Graphic or violent content",
  "Child safety concern",
  "Other safety issue",
];

type UserState = {
  id: string | null;
  email: string | null;
} | null;

export default function SettingsReportAbusePage() {
  const [currentUser, setCurrentUser] = useState<UserState>(null);
  const [issueType, setIssueType] = useState(ISSUE_TYPES[0]);
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadPage() {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setCurrentUser({
        id: user?.id ?? null,
        email: user?.email ?? null,
      });
      setIsLoading(false);
    }

    void loadPage();
  }, []);

  const handleSubmit = async () => {
    if (!currentUser?.id) {
      setMessage({
        type: "error",
        text: "Log in to submit a safety report.",
      });
      return;
    }

    const trimmedDescription = description.trim();

    if (!trimmedDescription) {
      setMessage({
        type: "error",
        text: "Please add a short description before submitting.",
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    const { error } = await supabase.from("safety_reports").insert({
      user_id: currentUser.id,
      issue_type: issueType,
      description: trimmedDescription,
    });

    setIsSubmitting(false);

    if (error) {
      console.error("Error submitting safety report:", error);
      setMessage({
        type: "error",
        text: error.message ?? "Could not submit your report right now.",
      });
      return;
    }

    setDescription("");
    setIssueType(ISSUE_TYPES[0]);
    setMessage({
      type: "success",
      text: "Report submitted. Thank you for helping keep Graffiti safe.",
    });
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <LoadingScreen />
      ) : (
        <div className="stack settings-detail-shell">
          <section className="section-card stack">
            <div className="stack" style={{ gap: "8px" }}>
              <h2 className="settings-detail-title">Tell us what happened</h2>
              <p className="muted settings-detail-copy">
                Share the issue type and a few details so the team can review it.
              </p>
            </div>

            {!currentUser?.id ? (
              <div className="status-message status-error">Log in to report a safety issue.</div>
            ) : (
              <>
                <label className="settings-field">
                  <span className="settings-field-label">Issue type</span>
                  <select
                    className="input"
                    value={issueType}
                    onChange={(event) => setIssueType(event.target.value)}
                    disabled={isSubmitting}
                  >
                    {ISSUE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="settings-field">
                  <span className="settings-field-label">Description</span>
                  <textarea
                    className="textarea"
                    placeholder="Describe what happened and why it concerns you."
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    disabled={isSubmitting}
                  />
                </label>

                <div className="toolbar">
                  <button
                    className="button button-accent"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Submitting..." : "Submit"}
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
