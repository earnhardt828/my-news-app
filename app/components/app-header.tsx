"use client";

import { usePathname } from "next/navigation";

function getHeaderTitle(pathname: string) {
  if (pathname === "/") {
    return "Mirur";
  }

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

  if (pathname === "/privacy") {
    return "Privacy";
  }

  if (pathname === "/terms") {
    return "Terms";
  }

  if (pathname === "/community-guidelines") {
    return "Guidelines";
  }

  if (pathname === "/my-feed") {
    return "My Feed";
  }

  if (pathname.startsWith("/article/")) {
    return "Article";
  }

  if (pathname.startsWith("/user/")) {
    return "Profile";
  }

  return "Mirur";
}

export default function AppHeader() {
  const pathname = usePathname();

  return <h1 className="brand-title">{getHeaderTitle(pathname)}</h1>;
}
