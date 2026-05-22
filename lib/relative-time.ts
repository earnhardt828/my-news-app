export function formatRelativeTimestamp(
  publishedAt?: string | null,
  fallback?: string | null
) {
  if (publishedAt) {
    const timestamp = new Date(publishedAt).getTime();

    if (!Number.isNaN(timestamp)) {
      const diffMs = Date.now() - timestamp;
      const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

      if (diffMinutes < 1) {
        return "Just now";
      }

      if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      }

      const diffHours = Math.floor(diffMinutes / 60);

      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }

      const diffDays = Math.floor(diffHours / 24);

      if (diffDays === 1) {
        return "Yesterday";
      }

      return `${diffDays}d ago`;
    }
  }

  const fallbackValue = fallback?.trim();

  if (!fallbackValue) {
    return "Recent";
  }

  if (/ago|yesterday|today|just now/i.test(fallbackValue)) {
    return fallbackValue;
  }

  return "Recent";
}
