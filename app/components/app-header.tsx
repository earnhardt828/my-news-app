"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (pathname !== "/") {
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
      <div className="app-header-article-close-wrap">
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
      </div>
    );
  }

  if (pathname !== "/") {
    return (
      <div className="app-header-title-wrap">
        <h1 className="brand-title">{getPageTitle(pathname)}</h1>
      </div>
    );
  }

  return (
    <div className="app-header-logo-wrap">
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
  );
}
