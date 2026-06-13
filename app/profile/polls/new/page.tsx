"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../../../../lib/categories";
import { cleanDisplayText } from "../../../../lib/display-text";
import {
  getPollSchemaSetupMessage,
  isPollSchemaMissingError,
  validatePollDraft,
} from "../../../../lib/polls";
import { savePollArticleImageReferences } from "../../../../lib/poll-images";
import { supabase } from "../../../../lib/supabase";

const MAX_OPTIONS = 4;

export default function CreatePollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const relatedArticleId = searchParams?.get("articleId") ?? "";
  const relatedArticleTitle = searchParams?.get("articleTitle") ?? "";
  const relatedSource = searchParams?.get("source") ?? "";
  const relatedArticleImage = searchParams?.get("articleImage") ?? "";
  const initialCategory = searchParams?.get("category") ?? "";
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [options, setOptions] = useState(["", ""]);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const relatedArticleLabel = useMemo(
    () => cleanDisplayText(relatedArticleTitle),
    [relatedArticleTitle]
  );

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) =>
      prev.map((option, optionIndex) => (optionIndex === index ? value : option))
    );
  };

  const handleAddOption = () => {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, ""]));
  };

  const handleSubmit = async () => {
    setStatus(null);

    const validationError = validatePollDraft({
      question,
      options,
      category,
      relatedArticleTitle,
    });

    if (validationError) {
      setStatus({
        type: "error",
        text: validationError,
      });
      return;
    }

    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      setIsSaving(false);
      setStatus({
        type: "error",
        text: "Log in to create a poll.",
      });
      return;
    }

    const cleanedOptions = options
      .map((option) => cleanDisplayText(option).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .insert({
        user_id: user.id,
        username: profileData?.username ?? null,
        question: cleanDisplayText(question).replace(/\s+/g, " ").trim(),
        category,
        related_article_id: relatedArticleId,
        related_article_title: relatedArticleTitle,
        related_source: relatedSource,
      })
      .select("id")
      .single();

    if (pollError || !pollData?.id) {
      setIsSaving(false);
      setStatus({
        type: "error",
        text: isPollSchemaMissingError(pollError?.message)
          ? getPollSchemaSetupMessage()
          : pollError?.message ?? "Could not create your poll.",
      });
      return;
    }

    const { error: optionsError } = await supabase.from("poll_options").insert(
      cleanedOptions.map((optionText) => ({
        poll_id: pollData.id,
        option_text: optionText,
      }))
    );

    setIsSaving(false);

    if (optionsError) {
      setStatus({
        type: "error",
        text: isPollSchemaMissingError(optionsError.message)
          ? getPollSchemaSetupMessage()
          : optionsError.message ?? "Could not save your poll options.",
      });
      return;
    }

    savePollArticleImageReferences({
      pollId: pollData.id,
      relatedArticleId,
      relatedArticleTitle,
      imageUrl: relatedArticleImage,
    });

    router.push("/profile");
  };

  return (
    <section className="page-shell">
      <section className="section-card stack">
        <span className="muted">
          Polls should be related to news, current events, or public issues.
        </span>

        {relatedArticleLabel ? (
          <div className="poll-related-article">
            <strong>Related article</strong>
            <span>{relatedArticleLabel}</span>
            {relatedSource ? <span className="muted">{relatedSource}</span> : null}
            {relatedArticleImage ? (
              <span className="muted">The linked article image will be used for this poll.</span>
            ) : null}
          </div>
        ) : null}

        <label className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Question</span>
          <textarea
            className="input profile-bio-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            maxLength={180}
            placeholder="What public issue or current event should people weigh in on?"
          />
        </label>

        <label className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Category</span>
          <select
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">Choose a category</option>
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {getCategoryLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <div className="stack" style={{ gap: "10px" }}>
          <span className="profile-section-title-sm">Answer options</span>
          {options.map((option, index) => (
            <input
              key={`poll-option-${index}`}
              className="input"
              type="text"
              value={option}
              onChange={(event) => handleOptionChange(index, event.target.value)}
              placeholder={`Option ${index + 1}`}
              maxLength={80}
            />
          ))}
          {options.length < MAX_OPTIONS ? (
            <button type="button" className="button button-secondary" onClick={handleAddOption}>
              Add option
            </button>
          ) : null}
        </div>

        {status ? (
          <div
            className={`status-message ${
              status.type === "success" ? "status-success" : "status-error"
            }`}
          >
            {status.text}
          </div>
        ) : null}

        <div className="toolbar">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => router.back()}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-accent"
            onClick={() => void handleSubmit()}
            disabled={isSaving}
          >
            {isSaving ? "Creating..." : "Create poll"}
          </button>
        </div>
      </section>
    </section>
  );
}
