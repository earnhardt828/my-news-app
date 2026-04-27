"use client";

import Image from "next/image";
import Link from "next/link";

export default function AppHeader() {
  return (
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
  );
}
