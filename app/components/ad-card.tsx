type AdCardProps = {
  title: string;
  copy: string;
  cta?: string;
  variant?: "inline" | "banner";
};

export default function AdCard({
  title,
  copy,
  cta = "Ad placeholder",
  variant = "inline",
}: AdCardProps) {
  return (
    <aside
      className={`ad-card ${variant === "banner" ? "ad-card-banner" : ""}`}
      aria-label="Sponsored content placeholder"
    >
      <span className="ad-label">Sponsored</span>
      <h3 className="ad-title">{title}</h3>
      <p className="ad-copy">{copy}</p>
      <span className="ad-cta">{cta}</span>
    </aside>
  );
}
