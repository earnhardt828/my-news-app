import type { Metadata } from "next";
import TrustFooterLinks from "../components/trust-footer-links";

export const metadata: Metadata = {
  title: "About Graffiti",
  description:
    "Learn about Graffiti, a modern social news platform for discovering, discussing, and following current events.",
  alternates: {
    canonical: "https://graffiti.news/about",
  },
};

export default function AboutPage() {
  return (
    <section className="page-shell">
      <section className="trust-page-shell">
        <p className="legal-last-updated">Graffiti overview</p>
        <div className="trust-hero">
          <h1 className="trust-page-title">A modern social news platform built for context.</h1>
          <p className="trust-page-copy">
            Graffiti helps people discover, discuss, and follow current events through a
            clean, mobile-first experience. The platform brings together real-time stories,
            source discovery, comments, videos, and personalized feeds in one place.
          </p>
          <p className="trust-page-copy">
            Whether you want to scan the latest headlines, compare reporting across
            publishers, or stay close to the categories and sources that matter most to
            you, Graffiti is designed to make following the news feel more informed,
            social, and approachable.
          </p>
        </div>

        <section className="legal-section">
          <h2 className="legal-section-title">What Graffiti is built for</h2>
          <p className="legal-section-body">
            Graffiti combines personalized feeds, public conversations, short-form video,
            and source exploration so readers can move from headline discovery to deeper
            understanding without losing the broader picture.
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">How people use it</h2>
          <p className="legal-section-body">
            Readers can follow current events, compare sources, save stories, participate
            in discussions, and keep up with the topics they care about most. The goal is
            a more transparent and useful relationship with the news, not just a faster feed.
          </p>
        </section>

        <TrustFooterLinks />
      </section>
    </section>
  );
}
