import type { Metadata } from "next";
import TrustFooterLinks from "../components/trust-footer-links";

const LAST_UPDATED = "May 9, 2026";

export const metadata: Metadata = {
  title: "Graffiti Terms",
  description:
    "Read the rules for acceptable use, user-generated content, moderation, and third-party news content on Graffiti.",
  alternates: {
    canonical: "https://graffiti.news/terms",
  },
};

export default function TermsPage() {
  return (
    <section className="page-shell">
      <section className="trust-page-shell">
        <p className="legal-last-updated">Last updated {LAST_UPDATED}</p>

        <section className="legal-section">
          <h1 className="trust-page-title">Terms</h1>
          <p className="legal-section-body">
            These terms outline the basic rules for using Graffiti, participating in
            conversations, and interacting with content across the platform.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Acceptable use</h2>
          <p className="legal-section-body">
            You may not use Graffiti to harass, threaten, impersonate, spam, mislead,
            exploit, or otherwise harm other people or the platform. Activity that
            interferes with the normal operation of the service is also prohibited.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">User-generated content</h2>
          <p className="legal-section-body">
            You are responsible for the comments, replies, profile information, and
            other content you post. By submitting content, you confirm that you have the
            right to share it and that it does not violate applicable law or these terms.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Accounts and usernames</h2>
          <p className="legal-section-body">
            Graffiti may require accurate account information and may limit usernames
            that are misleading, abusive, infringing, or designed to impersonate other
            people, organizations, or brands.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Moderation and blocking</h2>
          <p className="legal-section-body">
            Graffiti may hide, limit, remove, or review content and accounts when needed
            for safety, policy enforcement, abuse prevention, legal compliance, or
            product integrity. Users may also have access to blocking and reporting tools.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Intellectual property</h2>
          <p className="legal-section-body">
            Graffiti and its branding, interface, and original product materials are
            protected by intellectual property laws. You may not copy, scrape, or
            redistribute proprietary parts of the service except as permitted by law.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Third-party news content</h2>
          <p className="legal-section-body">
            Graffiti surfaces articles, feeds, and media from third-party publishers.
            Those publishers remain responsible for their reporting, rights, and content,
            and outbound links may be subject to third-party terms and policies.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Liability limitations</h2>
          <p className="legal-section-body">
            Graffiti is provided on an as-available basis. To the extent allowed by law,
            the service disclaims warranties and is not responsible for indirect,
            incidental, or consequential damages arising from use of the platform.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Changes to terms</h2>
          <p className="legal-section-body">
            Graffiti may update these terms as the product evolves. Continued use of the
            service after updates take effect means you accept the revised terms.
          </p>
        </section>

        <TrustFooterLinks />
      </section>
    </section>
  );
}
