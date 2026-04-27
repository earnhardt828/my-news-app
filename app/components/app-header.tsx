"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

  if (pathname !== "/") {
    return (
      <div className="app-header-title-wrap">
        <h1 className="brand-title">{getPageTitle(pathname)}</h1>
      </div>
    );
  }

  return (
    <div className="app-header-logo-wrap">
      <Link href="/" className="brand-logo-link" aria-label="Reflekt home">
        <Image
          src="/reflekt-logo.png"
          alt="Reflekt"
          width={280}
          height={56}
          className="brand-logo"
          priority
        />
      </Link>
    </div>
  );
}
