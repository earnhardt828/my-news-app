export default function PodcastsPage() {
  return (
    <section className="page-shell home-sections-shell">
      <section className="home-section-block home-section-plain home-top-trending-block">
        <div className="home-section-header">
          <div className="stack" style={{ gap: "4px" }}>
            <strong className="profile-section-title home-section-title">Podcasts</strong>
            <span className="muted">Podcast discovery is coming soon.</span>
          </div>
        </div>

        <div className="empty-state compact-empty-state">
          <strong>Podcast listening is on the way.</strong>
          <span>We&apos;re getting the player, subscriptions, and episode recommendations ready.</span>
        </div>
      </section>
    </section>
  );
}
