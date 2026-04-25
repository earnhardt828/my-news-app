import Link from "next/link";

export default function TermsPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Legal</p>
        <h2 className="page-title">Terms of Use</h2>
        <p className="page-subtitle">
          A simple placeholder terms page for acceptable use and service rules.
        </p>
      </div>

      <section className="section-card stack">
        <div className="comment-card">
          <strong>Using the app</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            This placeholder terms section should describe acceptable app use
            and basic expectations around account access and participation.
          </div>
        </div>

        <div className="comment-card">
          <strong>User content and moderation</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            It should explain ownership of user-submitted content, moderation
            rights, and how comments, reports, and removals may be handled.
          </div>
        </div>

        <div className="comment-card">
          <strong>Misuse and abuse</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Add clear limits around misuse, abuse, evasion of moderation, and
            other behavior that harms the service or its users.
          </div>
        </div>

        <Link href="/profile" className="button button-secondary">
          Back to Profile
        </Link>
      </section>
    </section>
  );
}
