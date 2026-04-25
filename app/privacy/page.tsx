import Link from "next/link";

const LAST_UPDATED = "April 24, 2026";

export default function PrivacyPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Legal</p>
        <h2 className="page-title">Privacy Policy</h2>
        <p className="page-subtitle">
          This policy explains what information this app collects, how it is
          used, and which outside services help run the product.
        </p>
      </div>

      <section className="section-card stack">
        <div className="comment-card">
          <strong>Last updated</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            {LAST_UPDATED}
          </div>
        </div>

        <div className="comment-card">
          <strong>What data we collect</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            When you create an account or use the app, we may collect your
            email address, chosen username, profile image, category
            preferences, comments, likes, and safety reports. We may also store
            technical information needed to keep the app running, such as basic
            request logs or service metadata.
          </div>
        </div>

        <div className="comment-card">
          <strong>How we use your data</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            We use this information to authenticate your account, personalize
            feeds based on the categories you follow, display your profile,
            support comments and likes, and review moderation or safety issues.
            We may also use limited product data to improve performance,
            reliability, and future features.
          </div>
        </div>

        <div className="comment-card">
          <strong>Third-party services</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            The app currently relies on third-party infrastructure providers,
            including Supabase for authentication, database, and storage, and
            Vercel for hosting or deployment workflows. In the future, the app
            may also use advertising or sponsorship providers for sponsored
            placements and banner inventory.
          </div>
        </div>

        <div className="comment-card">
          <strong>Profile images and public content</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Comments, usernames, and profile images may be visible to other
            users inside the app. Uploaded avatars are stored using a public
            storage URL so they can appear in your profile preview and other
            app surfaces where your identity is shown.
          </div>
        </div>

        <div className="comment-card">
          <strong>Safety, moderation, and support</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Reports and moderation actions may be reviewed to keep the app safe
            and enforce the rules. If you have questions about your data or a
            privacy concern, use the app’s support or safety contact methods
            when they become available.
          </div>
        </div>

        <Link href="/profile" className="button button-secondary">
          Back to Profile
        </Link>
      </section>
    </section>
  );
}
