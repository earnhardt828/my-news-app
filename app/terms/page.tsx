import Link from "next/link";

const LAST_UPDATED = "April 24, 2026";

export default function TermsPage() {
  return (
    <section className="page-shell">
      <div className="page-hero">
        <p className="page-eyebrow">Legal</p>
        <h2 className="page-title">Terms of Use</h2>
        <p className="page-subtitle">
          These terms set the ground rules for using the app, participating in
          discussions, and interacting with other users.
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
          <strong>User responsibilities</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            You are responsible for maintaining the accuracy of your account
            information, protecting access to your account, and making sure the
            content you submit is respectful, lawful, and appropriate for a
            shared news community.
          </div>
        </div>

        <div className="comment-card">
          <strong>Prohibited content</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            You may not post harassment, hate speech, spam, scams, illegal
            content, threats, impersonation, or material that promotes harm or
            exploitation. Attempts to flood discussions, evade moderation, or
            abuse reporting tools are also prohibited.
          </div>
        </div>

        <div className="comment-card">
          <strong>Comments, reports, and moderation</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            The app may allow users to comment on content, report safety
            concerns, and delete their own comments. The service also reserves
            the right to review, limit, hide, or remove content when needed for
            safety, moderation, legal compliance, or product integrity.
          </div>
        </div>

        <div className="comment-card">
          <strong>Rights of the service</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            We may suspend features, change functionality, update policies, or
            take reasonable action against accounts or content that violate the
            rules or create risk for the service or other users.
          </div>
        </div>

        <div className="comment-card">
          <strong>Future changes</strong>
          <div className="muted" style={{ marginTop: "6px" }}>
            These terms may be updated as the app grows, including when mobile
            distribution, advertising, subscriptions, or additional moderation
            systems are introduced.
          </div>
        </div>

        <Link href="/profile" className="button button-secondary">
          Back to Profile
        </Link>
      </section>
    </section>
  );
}
