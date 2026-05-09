"use client";

import { useState } from "react";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!name.trim() || !email.trim() || !message.trim()) {
      setStatus({
        type: "error",
        text: "Please fill out your name, email, and message.",
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    await new Promise((resolve) => window.setTimeout(resolve, 700));

    setIsSubmitting(false);
    setName("");
    setEmail("");
    setMessage("");
    setStatus({
      type: "success",
      text: "Message sent. We’ll get back to you soon.",
    });
  };

  return (
    <form className="trust-form" onSubmit={handleSubmit}>
      <div className="trust-form-grid">
        <label className="trust-field">
          <span className="trust-field-label">Name</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            disabled={isSubmitting}
          />
        </label>

        <label className="trust-field">
          <span className="trust-field-label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            disabled={isSubmitting}
          />
        </label>
      </div>

      <label className="trust-field">
        <span className="trust-field-label">Message</span>
        <textarea
          className="textarea trust-textarea"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="How can we help?"
          disabled={isSubmitting}
        />
      </label>

      <div className="trust-form-actions">
        <button className="button button-accent" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Sending..." : "Send message"}
        </button>
      </div>

      {status ? (
        <div
          className={`status-message ${
            status.type === "success" ? "status-success" : "status-error"
          }`}
        >
          {status.text}
        </div>
      ) : null}
    </form>
  );
}
