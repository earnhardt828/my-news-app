"use client";

import { useEffect, useState } from "react";
import LoadingScreen from "../../components/loading-screen";
import { CATEGORY_OPTIONS, getCategoryLabel } from "../../../lib/categories";
import { ensureProfileRow, saveProfilePatch } from "../../../lib/profile-store";
import { supabase } from "../../../lib/supabase";

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
        <LoadingScreen label="Loading categories" />
      ) : (
        <section className="section-card stack">
          <div className="stack" style={{ gap: "6px" }}>
            <strong className="profile-section-title">Choose your categories</strong>
            <span className="muted">
              Tap to add or remove interests from your personalized feed.
            </span>
          </div>

          <div className="category-grid">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                key={category}
                className={`category-pill ${
                  categories.includes(category) ? "category-pill-active" : ""
                }`}
                onClick={() => void handleCategoryToggle(category)}
                disabled={isSaving || !userId}
              >
                {getCategoryLabel(category)}
              </button>
            ))}
          </div>

          {message ? (
            <div className="chip chip-accent">{message}</div>
          ) : null}
        </section>
      )}
    </section>
  );
}
