const LAST_UPDATED = "April 24, 2026";

export default function PrivacyPage() {
  return (
    <section className="page-shell">
      <section className="legal-reading">
        <p className="legal-last-updated">Last updated {LAST_UPDATED}</p>

        <section className="legal-section">
          <h2 className="legal-section-title">What data we collect</h2>
          <p className="legal-section-body">
            When you create an account or use the app, we may collect your email
            address, chosen username, profile image, category preferences,
            comments, likes, and safety reports. We may also store technical
            information needed to keep the app running, such as basic request logs
            or service metadata.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">How we use your data</h2>
          <p className="legal-section-body">
            We use this information to authenticate your account, personalize
            feeds based on the categories you follow, display your profile,
            support comments and likes, and review moderation or safety issues.
            We may also use limited product data to improve performance,
            reliability, and future features.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Third-party services</h2>
          <p className="legal-section-body">
            The app currently relies on third-party infrastructure providers,
            including Supabase for authentication, database, and storage, and
            Vercel for hosting or deployment workflows. The app may also use
            Google AdSense or other third-party advertising partners to display
            sponsored placements. Those services may use cookies or similar
            technologies to help deliver, measure, or personalize advertising.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Profile images and public content</h2>
          <p className="legal-section-body">
            Comments, usernames, and profile images may be visible to other users
            inside the app. Uploaded avatars are stored using a public storage URL
            so they can appear in your profile preview and other app surfaces
            where your identity is shown.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Safety, moderation, and support</h2>
          <p className="legal-section-body">
            Reports and moderation actions may be reviewed to keep the app safe
            and enforce the rules. If you have questions about your data or a
            privacy concern, use the app&apos;s support or safety contact methods
            when they become available.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Advertising, cookies, and partners</h2>
          <p className="legal-section-body">
            If advertising is enabled, Google AdSense and future third-party ad
            partners may place or read cookies and similar technologies to serve
            ads, understand engagement, and improve ad delivery. Users should
            review those providers&apos; policies for more information about how
            ad-related data may be handled.
          </p>
        </section>
      </section>
    </section>
  );
}
