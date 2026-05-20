"use client";

import { type CSSProperties, useEffect, useState } from "react";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../../../lib/categories";
import { ensureProfileRow, saveProfilePatch } from "../../../lib/profile-store";
import { supabase } from "../../../lib/supabase";

const CATEGORY_GRADIENTS = [
  "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(135deg, #cfd9df 0%, #e2ebf0 100%)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #43cea2 0%, #185a9d 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
] as const;

function getCategoryArtStyle(category: string, index: number) {
  const slug = category.toLowerCase().replace(/\s+/g, "-");

  return {
    backgroundImage: CATEGORY_GRADIENTS[index % CATEGORY_GRADIENTS.length],
    backgroundSize: "cover",
    backgroundPosition: "center",
    // Easy future swap: replace this gradient with `url(/category-images/${slug}.jpg)`.
    "--category-image-slug": slug,
  } as CSSProperties;
}

export default function ProfileCategoriesPage() {
  const [categories, setCategories] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    async function loadCategories() {
      setIsLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (!user?.id) {
        setUserId(null);
        setUserEmail(null);
        setCategories([]);
        setIsLoading(false);
        setMessage("Log in to manage favorite categories.");
        return;
      }

      setUserId(user.id);
      setUserEmail(user.email ?? null);

      const { data: profile, error } = await ensureProfileRow({
        id: user.id,
        email: user.email ?? null,
      });

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Error loading profile categories:", error);
        setMessage(error.message ?? "Could not load categories.");
        setCategories([]);
        setIsLoading(false);
        return;
      }

      setCategories(profile?.categories ?? []);
      setIsLoading(false);
      setMessage("");
    }

    void loadCategories();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCategoryToggle = async (category: string) => {
    if (!userId || isSaving) {
      return;
    }

    const nextCategories = categories.includes(category)
      ? categories.filter((current) => current !== category)
      : [...categories, category];

    const previousCategories = categories;
    setCategories(nextCategories);
    setIsSaving(true);
    setMessage("");

    const { error } = await saveProfilePatch(
      {
        id: userId,
        email: userEmail,
      },
      {
        id: userId,
        email: userEmail,
        categories: nextCategories,
      }
    );

    setIsSaving(false);

    if (error) {
      console.error("Error saving favorite categories:", error);
      setCategories(previousCategories);
      setMessage(error.message ?? "Could not save categories.");
      return;
    }

    setMessage("Favorite categories updated.");
  };

  return (
    <section className="page-shell">
      {isLoading ? (
        <section className="section-card stack">
          <strong className="profile-section-title">Loading categories...</strong>
        </section>
      ) : (
        <section className="section-card stack categories-visual-shell">
          <div className="stack" style={{ gap: "6px" }}>
            <strong className="profile-section-title">Choose your categories</strong>
            <span className="muted">
              Tap to add or remove interests from your personalized feed.
            </span>
          </div>

          <div className="categories-visual-grid">
            {CATEGORY_OPTIONS.map((category, index) => {
              const isSelected = categories.includes(category);

              return (
                <button
                  key={category}
                  className={`category-visual-card ${
                    isSelected ? "category-visual-card-active" : ""
                  }`}
                  onClick={() => void handleCategoryToggle(category)}
                  disabled={isSaving || !userId}
                >
                  <span className="category-visual-circle-wrap">
                    <span
                      className={`category-visual-circle ${
                        isSelected ? "category-visual-circle-active" : ""
                      }`}
                      style={getCategoryArtStyle(category, index)}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="category-visual-name">{getCategoryLabel(category)}</span>
                </button>
              );
            })}
          </div>

          {message ? (
            <div className="chip chip-accent">{message}</div>
          ) : null}
        </section>
      )}
    </section>
  );
}
