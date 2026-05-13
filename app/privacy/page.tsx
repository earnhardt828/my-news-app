import type { Metadata } from "next";
import TrustFooterLinks from "../components/trust-footer-links";

const LAST_UPDATED = "May 9, 2026";

export const metadata: Metadata = {
  title: "Graffiti Privacy",
  description:
    "Read how Graffiti handles accounts, profiles, comments, analytics, safety tools, and data retention.",
  alternates: {
    canonical: "https://graffiti.news/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <section className="page-shell">
      <section className="trust-page-shell">
        <p className="legal-last-updated">Last updated {LAST_UPDATED}</p>

        <section className="legal-section">
          <h1 className="trust-page-title">Privacy</h1>
          <p className="legal-section-body">
            Graffiti is built to help people discover and discuss current events while
            keeping account, profile, and safety information handled with care.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Information collected</h2>
          <p className="legal-section-body">
            Graffiti may collect account information such as your email address,
            username, profile image, category preferences, saved articles, hearts,
            follows, poll votes, and the content you submit through comments, polls,
            reports, or support messages.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Accounts and profiles</h2>
          <p className="legal-section-body">
            Profile details like usernames, avatars, bios, and selected categories are
            used to personalize the app and help other users recognize who is
            participating in public conversations. Public profile pages may also show
            your polls, follows, and other visible account activity inside Graffiti.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Comments and public content</h2>
          <p className="legal-section-body">
            Comments, replies, polls, poll votes, hearts, and related moderation
            activity may be visible inside Graffiti. If you choose to participate
            publicly, the information you post can be seen by other users in the app.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Analytics and app usage</h2>
          <p className="legal-section-body">
            Graffiti may store limited technical and usage information to keep the app
            reliable, understand feature performance, and improve the feed, search, and
            product experience over time. That can include app analytics, error logs,
            performance signals, and feature usage data where available.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Third-party services</h2>
          <p className="legal-section-body">
            Graffiti relies on third-party infrastructure and content sources, including
            services for authentication, databases, hosting, analytics, and news or
            video ingestion. Graffiti currently uses providers such as Supabase and
            third-party news/video services, which may process limited data as needed
            to support the app.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Blocking and reporting tools</h2>
          <p className="legal-section-body">
            Blocking, abuse reporting, and moderation workflows may store relevant user,
            comment, poll, follow, and safety information so the app can enforce
            policies and respond to issues responsibly.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Bookmarks and follows</h2>
          <p className="legal-section-body">
            Graffiti stores saved articles, source hearts, follows, and show-less
            preferences so the app can personalize My Feed and help you return to
            content and publishers that matter to you.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Data retention</h2>
          <p className="legal-section-body">
            Graffiti keeps account and content data for as long as it is needed to operate
            the service, fulfill safety obligations, resolve disputes, or comply with
            legal requirements. Retention periods may vary depending on the type of data.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Contact</h2>
          <p className="legal-section-body">
            You can contact Graffiti about privacy, account deletion, or data questions at{" "}
            <a className="trust-inline-link" href="mailto:support@graffiti.news">
              support@graffiti.news
            </a>
            .
          </p>
        </section>

        <TrustFooterLinks />
      </section>
    </section>
  );
}
