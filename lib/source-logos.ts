export function normalizeSourceLogoName(sourceName: string) {
  return sourceName
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function getSourceLogoUrl(sourceName: string) {
  const normalized = normalizeSourceLogoName(sourceName);

  if (!normalized) {
    return null;
  }

  // Source logos are loaded from local assets in /public/source-logos.
  // If a matching file is not present, the UI falls back to the in-app
  // letter badge so Reflekt never renders a broken image box.
  return `/source-logos/${normalized}.png`;
}

export function getSourceInitial(sourceName: string) {
  return sourceName.trim().charAt(0).toUpperCase() || "N";
}
