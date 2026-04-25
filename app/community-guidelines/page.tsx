import Link from "next/link";

const LAST_UPDATED = "April 24, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Safety</p>
        <h2 className="page-title">Community Guidelines</h2>
        <p className="page-subtitle">
          These guidelines explain how to participate in a way that keeps the
          app useful, respectful, and safe.
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
          <strong>What is encouraged</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Healthy discussion, respectful disagreement, thoughtful reactions to
            news stories, and constructive participation are all welcome.
            Examples of allowed behavior include asking sincere questions,
            sharing calm opinions, and reporting content that seems unsafe or
            abusive.
          </div>
        </div>

        <div className="comment-card">
          <strong>What is not allowed</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Disallowed behavior includes harassment, hate speech, bullying,
            threats, spam, scams, impersonation, coordinated abuse, posting
            illegal material, or encouraging violence or exploitation. Repeated
            attempts to derail discussions or misuse community features are also
            not allowed.
          </div>
        </div>

        <div className="comment-card">
          <strong>Examples</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Allowed: respectful disagreement about a headline, posting a short
            opinion, or reporting a harmful comment. Disallowed: attacking a
            person or group, posting slurs, repeating the same promotional
            message, or threatening another user.
          </div>
        </div>

        <div className="comment-card">
          <strong>Reporting and enforcement</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            Users can report concerning comments through the app. Reported
            content may be reviewed and may lead to removal of content, limits
            on participation, or other moderation action depending on severity,
            repeated behavior, or safety risk.
          </div>
        </div>

        <div className="comment-card">
          <strong>Safety contact</strong>
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
