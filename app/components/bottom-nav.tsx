"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const iconProps = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const navItems: NavItem[] = [
  {
    href: "/",
    label: "Trending",
    icon: (
      <svg {...iconProps}>
        <path d="M4 16.5 10 10l4 4 6-8" />
        <path d="M18 6h2v2" />
        <path d="M4 20h16" />
      </svg>
    ),
  },
  {
    href: "/videos/",
    label: "Videos",
    icon: (
      <svg {...iconProps}>
        <rect x="3.5" y="5" width="13" height="14" rx="3" />
        <path d="m16.5 10 4-2.5v9L16.5 14" />
      </svg>
    ),
  },
  {
    href: "/search/",
    label: "Search",
    icon: (
      <svg {...iconProps}>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    ),
  },
  {
    href: "/profile/",
    label: "Profile",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="8" r="3.25" />
        <path d="M5.5 19a6.5 6.5 0 0 1 13 0" />
      </svg>
    ),
  },
  {
    href: "/settings/",
    label: "Settings",
    icon: (
      <svg {...iconProps}>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 2.75v2.1" />
        <path d="m15.74 4.26-1.05 1.82" />
        <path d="m19.74 8.26-1.82 1.05" />
        <path d="M21.25 12h-2.1" />
        <path d="m19.74 15.74-1.82-1.05" />
        <path d="m15.74 19.74-1.05-1.82" />
        <path d="M12 21.25v-2.1" />
        <path d="m8.26 19.74 1.05-1.82" />
        <path d="m4.26 15.74 1.82-1.05" />
        <path d="M2.75 12h2.1" />
        <path d="m4.26 8.26 1.82 1.05" />
        <path d="m8.26 4.26 1.05 1.82" />
      </svg>
    ),
  },
];

function normalizePathname(pathname: string) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

export default function BottomNav() {
  const pathname = normalizePathname(usePathname());

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {navItems.map((item) => {
        const normalizedHref = normalizePathname(item.href);
        const isActive = pathname === normalizedHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link ${isActive ? "nav-link-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
