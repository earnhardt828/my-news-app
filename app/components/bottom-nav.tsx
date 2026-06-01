"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function normalizeAppPath(pathname: string) {
  if (!pathname || pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

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
    label: "News",
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
    href: "/podcasts/",
    label: "Podcasts",
    icon: (
      <svg {...iconProps}>
        <path d="M6 5.2a2.2 2.2 0 0 1 2.2-2.2h7.6A2.2 2.2 0 0 1 18 5.2v13.6A2.2 2.2 0 0 1 15.8 21H8.2A2.2 2.2 0 0 1 6 18.8Z" />
        <path d="M9.2 8.2h5.6" />
        <path d="M9.2 11.2h5.6" />
        <path d="M9.2 14.2h3.2" />
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
];

export default function BottomNav() {
  const pathname = normalizeAppPath(usePathname());

  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {navItems.map((item) => {
        const normalizedHref = normalizeAppPath(item.href);
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
