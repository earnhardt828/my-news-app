import type { Metadata } from "next";
import ContactForm from "./contact-form";
import TrustFooterLinks from "../components/trust-footer-links";

export const metadata: Metadata = {
  title: "Contact Graffiti",
  description:
    "Get in touch with Graffiti for support, partnerships, or general questions.",
  alternates: {
    canonical: "https://graffiti.news/contact",
  },
};

export default function ContactPage() {
  return (
    <section className="page-shell">
      <section className="trust-page-shell">
        <p className="legal-last-updated">We’d love to hear from you</p>
        <div className="trust-hero">
          <h1 className="trust-page-title">Contact Graffiti</h1>
          <p className="trust-page-copy">
            Reach out for support, partnerships, press, or general questions about the
            platform.
          </p>
        </div>

        <section className="legal-section">
          <h2 className="legal-section-title">Support email</h2>
          <p className="legal-section-body">
            <a className="trust-inline-link" href="mailto:support@graffiti.news">
              support@graffiti.news
            </a>
          </p>
        </section>

        <section className="legal-section">
          <h2 className="legal-section-title">Send a message</h2>
          <p className="legal-section-body">
            Use the form below and we&apos;ll route your note to the right team.
          </p>
          <ContactForm />
        </section>

        <TrustFooterLinks />
      </section>
    </section>
  );
}
