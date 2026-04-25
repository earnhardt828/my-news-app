import Link from "next/link";

export default function PrivacyPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Legal</p>
        <h2 className="page-title">Privacy Policy</h2>
        <p className="page-subtitle">
          A lightweight placeholder privacy page for future mobile and App Store
          readiness.
        </p>
      </div>

      <section className="section-card stack">
        <div className="comment-card">
          <strong>What data is stored</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            This placeholder policy should explain what profile details, uploaded
            avatars, comments, likes, and report data are stored when people use
            the app.
          </div>
        </div>

        <div className="comment-card">
          <strong>How it is used</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            It should describe how that information supports account access,
            personalized categories, moderation, safety reporting, and product
            improvements.
          </div>
        </div>

        <div className="comment-card">
          <strong>User support</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Include a clear path for users to request help, report a privacy
            concern, or ask about account-related changes.
          </div>
        </div>

        <Link href="/profile" className="button button-secondary">
          Back to Profile
        </Link>
      </section>
    </section>
  );
}
