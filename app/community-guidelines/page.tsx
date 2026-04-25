import Link from "next/link";

export default function CommunityGuidelinesPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Safety</p>
        <h2 className="page-title">Community Guidelines</h2>
        <p className="page-subtitle">
          Keep conversations respectful, safe, and useful for everyone.
        </p>
      </div>

      <section className="section-card stack">
        <div className="comment-card">
          <strong>Respect other people</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Do not post harassment, hate, bullying, threats, or targeted abuse.
          </div>
        </div>

        <div className="comment-card">
          <strong>No spam or manipulation</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Avoid spam, repeated promotion, scams, impersonation, and attempts
            to manipulate or flood conversations.
          </div>
        </div>

        <div className="comment-card">
          <strong>No illegal or dangerous content</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Do not share illegal content or anything that encourages violence,
            exploitation, or harm to others.
          </div>
        </div>

        <div className="comment-card">
          <strong>Report safety concerns</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Placeholder contact: safety@mynewsapp.example
          </div>
        </div>

        <Link href="/profile" className="button button-secondary">
          Back to Profile
        </Link>
      </section>
    </section>
  );
}
