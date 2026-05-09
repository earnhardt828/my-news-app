import Link from "next/link";

const links = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export default function TrustFooterLinks() {
  return (
    <nav className="trust-footer-links" aria-label="Graffiti trust links">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="trust-footer-link">
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
