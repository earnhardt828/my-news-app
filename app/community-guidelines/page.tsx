const LAST_UPDATED = "April 24, 2026";

export default function CommunityGuidelinesPage() {
  return (
    <section className="page-shell">
      <section className="trust-page-shell">
        <p className="legal-last-updated">Last updated {LAST_UPDATED}</p>

        <section className="legal-section">
          <h1 className="trust-page-title">Community Guidelines</h1>
          <p className="legal-section-body">
            Graffiti is built for informed conversation around current events. These
            guidelines explain how to participate in a way that keeps the app useful,
            respectful, and safe.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">What is encouraged</h2>
          <p className="legal-section-body">
            Healthy discussion, respectful disagreement, thoughtful reactions to news
            stories, and constructive participation are all welcome. That includes
            asking sincere questions, sharing measured opinions, and reporting
            content that appears unsafe or abusive.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">What is not allowed</h2>
          <p className="legal-section-body">
            Harassment, hate speech, bullying, threats, spam, scams, impersonation,
            coordinated abuse, illegal material, or encouragement of violence or
            exploitation are not allowed. Repeated attempts to derail discussions or
            misuse comments, polls, or reporting tools may also lead to enforcement.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Reporting and enforcement</h2>
          <p className="legal-section-body">
            Users can report concerning comments and behavior through the app.
            Reported content may be reviewed and may lead to content removal,
            limited participation, account restrictions, or other moderation action
            depending on severity, repetition, and safety risk.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Safety contact</h2>
          <p className="legal-section-body">
            For urgent safety questions or policy concerns, contact{" "}
            <a className="trust-inline-link" href="mailto:support@graffiti.news">
              support@graffiti.news
            </a>
            .
          </p>
        </section>
      </section>
    </section>
  );
}
