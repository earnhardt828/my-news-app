"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSourceNameFromSlug } from "../../lib/source-logos";
import { supabase } from "../../lib/supabase";

function getPageTitle(pathname: string) {
  if (pathname === "/videos") {
    return "Videos";
  }

  if (pathname === "/search") {
    return "Search";
  }

  if (pathname === "/profile") {
    return "Profile";
  }

  if (pathname === "/profile/categories") {
    return "Favorite categories";
  }

  if (pathname === "/profile/bookmarks") {
    return "Bookmarked Articles";
  }

  if (pathname === "/profile/comments") {
    return "My Comments";
  }

  if (pathname === "/settings") {
    return "Settings";
  }

  if (pathname === "/settings/username") {
    return "Change username";
  }

  if (pathname === "/settings/contact") {
    return "Contact info";
  }

  if (pathname === "/notifications") {
    return "Notifications";
  }

  if (pathname === "/source-rankings") {
    return "Source Rankings";
  }

  if (pathname === "/my-feed") {
    return "My Feed";
  }

  if (pathname === "/privacy") {
    return "Privacy";
  }

  if (pathname === "/terms") {
    return "Terms";
  }

  if (pathname === "/community-guidelines") {
    return "Guidelines";
  }

  if (pathname.startsWith("/article/")) {
    return "Article";
  }

  if (pathname.startsWith("/user/")) {
    return "Profile";
  }

  return "Reflekt";
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(false);
  const [articleHeaderSource, setArticleHeaderSource] = useState("Article");
  const [articleHeaderUrl, setArticleHeaderUrl] = useState<string | null>(null);
  const [isVideoSearchOpen, setIsVideoSearchOpen] = useState(false);
  const [sourceHeaderTitle, setSourceHeaderTitle] = useState<string | null>(null);
  const sourcePathSegments = pathname.split("/");
  const defaultSourceTitle = pathname.startsWith("/source/")
    ? getSourceNameFromSlug(sourcePathSegments[sourcePathSegments.length - 1] ?? "")
    : "Source";

  useEffect(() => {
    if (!pathname.startsWith("/article/")) {
      return;
    }

    const handleArticleSource = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setArticleHeaderSource(customEvent.detail || "Article");
    };

    const handleArticleUrl = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      setArticleHeaderUrl(customEvent.detail ?? null);
    };

    window.addEventListener("reflekt:article-source", handleArticleSource as EventListener);
    window.addEventListener("reflekt:article-url", handleArticleUrl as EventListener);

    return () => {
      window.removeEventListener(
        "reflekt:article-source",
        handleArticleSource as EventListener
      );
      window.removeEventListener(
        "reflekt:article-url",
        handleArticleUrl as EventListener
      );
    };
  }, [pathname]);

  useEffect(() => {
    if (!pathname.startsWith("/source/")) {
      return;
    }

    const handleSourceTitle = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setSourceHeaderTitle(customEvent.detail || defaultSourceTitle || "Source");
    };

    window.addEventListener("reflekt:source-title", handleSourceTitle as EventListener);

    return () => {
      window.removeEventListener("reflekt:source-title", handleSourceTitle as EventListener);
      setSourceHeaderTitle(null);
    };
  }, [defaultSourceTitle, pathname]);

  useEffect(() => {
    if (pathname !== "/videos") {
      return;
    }

    const handleVideoSearchState = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      setIsVideoSearchOpen(Boolean(customEvent.detail));
    };

    window.addEventListener(
      "reflekt:video-search-state",
      handleVideoSearchState as EventListener
    );

    return () => {
      window.removeEventListener(
        "reflekt:video-search-state",
        handleVideoSearchState as EventListener
      );
    };
  }, [pathname]);

  useEffect(() => {
    if (pathname !== "/profile") {
      return;
    }

    let isMounted = true;

    async function loadUnreadState() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id || !isMounted) {
        if (isMounted) {
          setHasUnreadNotifications(false);
        }
        return;
      }

      const { data, error } = await supabase
        .from("notifications")
        .select("id")
        .eq("recipient_user_id", user.id)
        .is("read_at", null)
        .limit(1);

      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Error loading unread notifications:", error);
        setHasUnreadNotifications(false);
        return;
      }

      setHasUnreadNotifications((data ?? []).length > 0);
    }

    void loadUnreadState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadUnreadState();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [pathname]);

  if (pathname.startsWith("/article/")) {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close article"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          {articleHeaderSource}
        </div>
        <div className="app-header-article-actions">
          <button
            type="button"
            className="article-close-button app-header-article-filter"
            aria-label="Choose comment sort"
            onClick={() => {
              window.dispatchEvent(new CustomEvent("reflekt:article-comment-sort-toggle"));
            }}
          >
            <span className="icon-action-glyph" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 7h16" />
                <path d="M7 12h10" />
                <path d="M10 17h4" />
              </svg>
            </span>
          </button>
          {articleHeaderUrl ? (
            <a
              href={articleHeaderUrl}
              target="_blank"
              rel="noreferrer"
              className="article-close-button app-header-article-link"
              aria-label="Open original article"
            >
              <span className="icon-action-glyph" aria-hidden="true">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M7 17 17 7" />
                  <path d="M9 7h8v8" />
                </svg>
              </span>
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (pathname.startsWith("/source/")) {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close source page"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/search");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          {sourceHeaderTitle || defaultSourceTitle}
        </div>
        <span className="app-header-article-spacer" aria-hidden="true" />
      </div>
    );
  }

  if (pathname === "/profile/categories") {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close categories"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/profile");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          Favorite categories
        </div>
        <span className="app-header-article-spacer" aria-hidden="true" />
      </div>
    );
  }

  if (pathname === "/profile/bookmarks") {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close bookmarks"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/profile");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          Bookmarked Articles
        </div>
        <span className="app-header-article-spacer" aria-hidden="true" />
      </div>
    );
  }

  if (pathname === "/profile/comments") {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close comments"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/profile");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          My Comments
        </div>
        <span className="app-header-article-spacer" aria-hidden="true" />
      </div>
    );
  }

  if (pathname === "/source-rankings") {
    return (
      <div className="app-header-article-bar">
        <button
          type="button"
          className="article-close-button app-header-article-close"
          aria-label="Close source rankings"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
              return;
            }

            router.push("/");
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="app-header-article-source" aria-live="polite">
          Source Rankings
        </div>
        <span className="app-header-article-spacer" aria-hidden="true" />
      </div>
    );
  }

  if (pathname !== "/") {
    if (pathname === "/videos") {
      return (
        <div className="app-header-title-wrap app-header-title-wrap-center">
          <span className="app-header-side-spacer" aria-hidden="true" />
          <h1 className="brand-title">Videos</h1>
          <button
            type="button"
            className="header-icon-button app-header-search-button"
            aria-label={isVideoSearchOpen ? "Close video search" : "Open video search"}
            onClick={() => {
              window.dispatchEvent(new CustomEvent("reflekt:toggle-video-search"));
            }}
          >
            <span className="header-icon-glyph header-icon-glyph-large" aria-hidden="true">
              {isVideoSearchOpen ? "✕" : "⌕"}
            </span>
          </button>
        </div>
      );
    }

    if (pathname === "/search") {
      return (
        <div className="app-header-title-wrap app-header-title-wrap-center">
          <span className="app-header-side-spacer" aria-hidden="true" />
          <h1 className="brand-title">Search</h1>
          <span className="app-header-side-spacer" aria-hidden="true" />
        </div>
      );
    }

    if (pathname === "/profile") {
      return (
        <div className="app-header-title-wrap app-header-title-wrap-center">
          <span className="app-header-side-spacer" aria-hidden="true" />
          <h1 className="brand-title">Profile</h1>
          <Link
            href="/notifications"
            className="header-icon-button"
            aria-label="Open notifications"
          >
            <span className="header-icon-glyph" aria-hidden="true">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                <path d="M10 17a2 2 0 0 0 4 0" />
              </svg>
            </span>
            {hasUnreadNotifications ? <span className="header-notification-dot" /> : null}
          </Link>
        </div>
      );
    }

    return (
      <div className="app-header-title-wrap">
        <h1 className="brand-title">{getPageTitle(pathname)}</h1>
      </div>
    );
  }

  return (
    <div className="app-header-logo-wrap">
      <Link
        href="/source-rankings"
        className="header-icon-button"
        aria-label="Open source rankings"
      >
        <span className="header-icon-glyph" aria-hidden="true">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <path d="M7 4h10v4a5 5 0 0 1-10 0Z" />
            <path d="M7 6H5a2 2 0 0 0 2 3" />
            <path d="M17 6h2a2 2 0 0 1-2 3" />
          </svg>
        </span>
      </Link>

      <Link href="/" className="brand-mark-link brand-mark-link-center" aria-label="Trending home">
        <Image
          src="/trending-r-logo.png"
          alt="Reflekt"
          width={56}
          height={56}
          className="brand-mark-logo"
          priority
        />
      </Link>

      <div className="header-actions-cluster">
        <button
          type="button"
          className="category-launch-button"
          aria-label="Customize categories"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("reflekt:open-categories"));
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
