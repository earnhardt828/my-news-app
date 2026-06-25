"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { getCategoryLabel } from "../../../../lib/categories";
import { apiFetch } from "../../../../lib/api-base";
import { cleanDisplayText } from "../../../../lib/display-text";
import {
  getPollOptionalMetadataSchemaSetupMessage,
  getPollReportsSetupMessage,
  isPollReportsSchemaMissingError,
  POLL_ALLOWED_CATEGORIES,
  getPollSchemaSetupMessage,
  isPollOptionalMetadataSchemaMissingError,
  isPollSchemaMissingError,
  normalizePollCategory,
  normalizePollStoryReference,
  validatePollDraft,
  type PollType,
} from "../../../../lib/polls";
import { savePollArticleImageReferences } from "../../../../lib/poll-images";
import { supabase } from "../../../../lib/supabase";

const MAX_OPTIONS = 4;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const POLL_RULES = [
  "Must be related to news, culture, sports, business, technology, movies, or local issues.",
  "No spam.",
  "No personal attacks.",
  "No random or off-topic polls.",
] as const;

type StoryOption = {
  id: string;
  title: string;
  source: string;
  image: string | null;
  category: string | null;
  url: string | null;
};

function getPollImageError(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return "Upload a JPG, PNG, or WebP image.";
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return "Poll images must be 5MB or smaller.";
  }

  return null;
}

export default function CreatePollPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const relatedArticleId = searchParams?.get("articleId") ?? "";
  const relatedArticleTitle = searchParams?.get("articleTitle") ?? "";
  const relatedSource = searchParams?.get("source") ?? "";
  const relatedArticleImage = searchParams?.get("articleImage") ?? "";
  const initialCategory = searchParams?.get("category") ?? "";
  const initialStoryReference = searchParams?.get("articleUrl") ?? relatedArticleTitle;
  const initialPollType: PollType = initialStoryReference || relatedArticleTitle ? "news" : "community";
  const [question, setQuestion] = useState("");
  const [pollType, setPollType] = useState<PollType>(initialPollType);
  const [category, setCategory] = useState(normalizePollCategory(initialCategory) ?? "");
  const [options, setOptions] = useState(["", ""]);
  const [storyReference, setStoryReference] = useState(initialStoryReference);
  const [storyOptions, setStoryOptions] = useState<StoryOption[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState("");
  const [isLoadingStoryOptions, setIsLoadingStoryOptions] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pollImageFile, setPollImageFile] = useState<File | null>(null);
  const [pollImagePreviewUrl, setPollImagePreviewUrl] = useState<string | null>(null);
  const pollImageInputRef = useRef<HTMLInputElement | null>(null);

  const relatedArticleLabel = useMemo(
    () => cleanDisplayText(relatedArticleTitle),
    [relatedArticleTitle]
  );

  useEffect(() => {
    let isMounted = true;

    async function loadStoryOptions() {
      setIsLoadingStoryOptions(true);

      try {
        const response = await apiFetch("/api/aggregated-news?pageSize=24");
        const payload = (await response.json().catch(() => ({}))) as {
          articles?: Array<{
            id?: string | number | null;
            title?: string | null;
            source?: string | null;
            image?: string | null;
            category?: string | null;
            url?: string | null;
          }>;
        };

        if (!isMounted) {
          return;
        }

        const nextOptions = (payload.articles ?? [])
          .map((article, index) => ({
            id:
              String(article.id ?? "").trim() ||
              String(article.url ?? "").trim() ||
              `story-${index}`,
            title: cleanDisplayText(article.title ?? "").trim(),
            source: cleanDisplayText(article.source ?? "").trim(),
            image: typeof article.image === "string" && article.image.trim() ? article.image.trim() : null,
            category: typeof article.category === "string" && article.category.trim() ? article.category.trim() : null,
            url: typeof article.url === "string" && article.url.trim() ? article.url.trim() : null,
          }))
          .filter((article) => article.title);

        setStoryOptions(nextOptions);
      } catch (error) {
        console.warn("Could not load current articles for poll creation:", error);
        if (isMounted) {
          setStoryOptions([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingStoryOptions(false);
        }
      }
    }

    void loadStoryOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (pollImagePreviewUrl) {
        URL.revokeObjectURL(pollImagePreviewUrl);
      }
    };
  }, [pollImagePreviewUrl]);

  const selectedStory = useMemo(
    () => storyOptions.find((story) => story.id === selectedStoryId) ?? null,
    [selectedStoryId, storyOptions]
  );

  const handleOptionChange = (index: number, value: string) => {
    setOptions((prev) =>
      prev.map((option, optionIndex) => (optionIndex === index ? value : option))
    );
  };

  const handleAddOption = () => {
    setOptions((prev) => (prev.length >= MAX_OPTIONS ? prev : [...prev, ""]));
  };

  const handlePollImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setPollImageFile(null);
      if (pollImagePreviewUrl) {
        URL.revokeObjectURL(pollImagePreviewUrl);
      }
      setPollImagePreviewUrl(null);
      return;
    }

    const imageError = getPollImageError(file);
    if (imageError) {
      setStatus({ type: "error", text: imageError });
      event.target.value = "";
      setPollImageFile(null);
      if (pollImagePreviewUrl) {
        URL.revokeObjectURL(pollImagePreviewUrl);
      }
      setPollImagePreviewUrl(null);
      return;
    }

    if (pollImagePreviewUrl) {
      URL.revokeObjectURL(pollImagePreviewUrl);
    }

    const previewUrl = URL.createObjectURL(file);
    setPollImageFile(file);
    setPollImagePreviewUrl(previewUrl);
    setStatus(null);
  };

  const handleSubmit = async () => {
    setStatus(null);

    const normalizedStoryReference = normalizePollStoryReference(storyReference);
    const linkedArticleTitle =
      selectedStory?.title || relatedArticleTitle || normalizedStoryReference || null;

    const validationError = validatePollDraft({
      question,
      options,
      category,
      pollType,
      relatedArticleTitle: linkedArticleTitle,
      storyReference: normalizedStoryReference,
    });

    if (validationError) {
      setStatus({
        type: "error",
        text: validationError,
      });
      return;
    }

    if (pollImageFile) {
      const imageError = getPollImageError(pollImageFile);
      if (imageError) {
        setStatus({ type: "error", text: imageError });
        return;
      }
    }

    setIsSaving(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user?.id) {
      console.log("CREATE_POLL_AUTH_USER", user?.id);
      setIsSaving(false);
      setStatus({
        type: "error",
        text: "Log in to create a poll.",
      });
      router.push("/profile/?message=create-poll-login");
      return;
    }

    const cleanedOptions = options
      .map((option) => cleanDisplayText(option).replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, MAX_OPTIONS);

    let uploadedImageUrl: string | null = null;

    if (pollImageFile) {
      const safeFilename = pollImageFile.name.replace(/[^a-zA-Z0-9.-]/g, "-");
      const fileStamp = `${Date.now()}-${pollImageFile.size}`;
      const filePath = `${user.id}/poll-${fileStamp}-${safeFilename}`;

      const { error: uploadError } = await supabase.storage
        .from("poll-images")
        .upload(filePath, pollImageFile, { upsert: false });

      if (uploadError) {
        console.error("Error uploading poll image:", uploadError);
        setIsSaving(false);
        setStatus({
          type: "error",
          text: "Could not upload your poll image. Please try a different file.",
        });
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("poll-images").getPublicUrl(filePath);

      uploadedImageUrl = publicUrl;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .maybeSingle();

    const basePollInsertPayload = {
      user_id: user.id,
      username: profileData?.username ?? null,
      question: cleanDisplayText(question).replace(/\s+/g, " ").trim(),
      category: normalizePollCategory(category) ?? category,
      related_article_id: selectedStory?.id || relatedArticleId || normalizedStoryReference || null,
      related_article_title: linkedArticleTitle,
      related_source: selectedStory?.source || relatedSource || null,
      status: "active",
    };
    const pollInsertPayload = {
      ...basePollInsertPayload,
      poll_type: pollType,
      image_url: uploadedImageUrl,
    };

    console.log("CREATE_POLL_AUTH_USER", user?.id);
    console.log("CREATE_POLL_INSERT_PAYLOAD", pollInsertPayload);

    let pollInsertResult = await supabase
      .from("polls")
      .insert(pollInsertPayload)
      .select("id")
      .single();

    if (pollInsertResult.error) {
      console.error("CREATE_POLL_INSERT_ERROR", pollInsertResult.error);
    }

    if (
      pollInsertResult.error &&
      isPollOptionalMetadataSchemaMissingError(pollInsertResult.error.message)
    ) {
      console.warn(getPollOptionalMetadataSchemaSetupMessage());
      console.log("CREATE_POLL_INSERT_PAYLOAD_FALLBACK_BASE", basePollInsertPayload);
      pollInsertResult = await supabase
        .from("polls")
        .insert(basePollInsertPayload)
        .select("id")
        .single();

      if (pollInsertResult.error) {
        console.error("CREATE_POLL_INSERT_ERROR_FALLBACK_BASE", pollInsertResult.error);
      }
    }

    const { data: pollData, error: pollError } = pollInsertResult;

    if (pollError || !pollData?.id) {
      setIsSaving(false);
      setStatus({
        type: "error",
        text: isPollSchemaMissingError(pollError?.message)
          ? getPollSchemaSetupMessage()
          : isPollReportsSchemaMissingError(pollError?.message)
            ? getPollReportsSetupMessage()
            : isPollOptionalMetadataSchemaMissingError(pollError?.message)
              ? getPollOptionalMetadataSchemaSetupMessage()
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
      relatedArticleId: selectedStory?.id || relatedArticleId,
      relatedArticleTitle: linkedArticleTitle,
      imageUrl: selectedStory?.image || relatedArticleImage,
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
              <span className="muted">The linked article image can still be referenced for this poll.</span>
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

        <div className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Poll Type</span>
          <div className="poll-type-toggle" role="radiogroup" aria-label="Poll type">
            <button
              type="button"
              className={`poll-type-toggle-button ${pollType === "news" ? "poll-type-toggle-button-active" : ""}`}
              onClick={() => setPollType("news")}
              role="radio"
              aria-checked={pollType === "news"}
            >
              <span>News Poll</span>
              <small>Article required</small>
            </button>
            <button
              type="button"
              className={`poll-type-toggle-button ${pollType === "community" ? "poll-type-toggle-button-active" : ""}`}
              onClick={() => setPollType("community")}
              role="radio"
              aria-checked={pollType === "community"}
            >
              <span>Community Poll</span>
              <small>Article optional</small>
            </button>
          </div>
        </div>

        <label className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Category</span>
          <select
            className="input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            required
          >
            <option value="">Choose a category</option>
            {POLL_ALLOWED_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {getCategoryLabel(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">
            {pollType === "news"
              ? "What news story is this about?"
              : "What news story is this about? Optional"}
          </span>
          <input
            className="input"
            type="text"
            value={storyReference}
            onChange={(event) => setStoryReference(event.target.value)}
            placeholder="Paste the article URL or describe the exact story"
            required={pollType === "news"}
          />
        </label>

        <label className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Or select from current articles</span>
          <select
            className="input"
            value={selectedStoryId}
            onChange={(event) => {
              const nextId = event.target.value;
              setSelectedStoryId(nextId);
              const nextStory = storyOptions.find((story) => story.id === nextId);
              if (nextStory) {
                setStoryReference(nextStory.url || nextStory.title);
                if (!category) {
                  const normalizedCategory = normalizePollCategory(nextStory.category ?? "");
                  if (normalizedCategory) {
                    setCategory(normalizedCategory);
                  }
                }
              }
            }}
          >
            <option value="">
              {isLoadingStoryOptions ? "Loading current articles..." : "Choose a current article"}
            </option>
            {storyOptions.map((story) => (
              <option key={story.id} value={story.id}>
                {story.title} {story.source ? `- ${story.source}` : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="stack" style={{ gap: "8px" }}>
          <span className="profile-section-title-sm">Optional image upload</span>
          <input
            ref={pollImageInputRef}
            className="profile-hidden-input-row"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handlePollImageChange}
          />
          <button
            type="button"
            className={`poll-upload-card ${pollImagePreviewUrl ? "poll-upload-card-has-preview" : ""}`}
            onClick={() => pollImageInputRef.current?.click()}
            aria-label={pollImagePreviewUrl ? "Change poll image" : "Add image"}
          >
            {pollImagePreviewUrl ? (
              <img
                src={pollImagePreviewUrl}
                alt="Poll upload preview"
                className="poll-upload-card-image"
              />
            ) : (
              <span className="poll-upload-card-empty">
                <span className="poll-upload-card-plus" aria-hidden="true">
                  +
                </span>
                <span>Add image</span>
              </span>
            )}
          </button>
          <span className="muted">Upload one JPG, PNG, or WebP image up to 5MB.</span>
        </div>

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

        <div className="poll-form-rules stack">
          <strong className="profile-section-title-sm">Poll rules</strong>
          <ul className="muted" style={{ margin: 0, paddingLeft: "18px" }}>
            {POLL_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>

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
