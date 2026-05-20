export type BreakingNewsNotificationCandidate = {
  articleId: number | string;
  title: string;
  source: string;
  publishedAt: string | null;
  url?: string | null;
};

export function shouldQueueBreakingNewsNotification(
  _candidate: BreakingNewsNotificationCandidate
) {
  // TODO: Only notify users for truly major breaking stories after editorial
  // confidence, duplicate suppression, and source trust rules are finalized.
  return false;
}

export async function prepareBreakingNewsNotificationPipeline() {
  // TODO: Request iOS push notification permission only after the full breaking
  // news notification system is production-ready.
  // TODO: Add APNs and/or Firebase Cloud Messaging credentials + device token flow.
  // TODO: Implement a Supabase Edge Function or backend scheduled checker that
  // scans for major breaking stories and evaluates notification candidates.
  // TODO: Add user preference controls so only opted-in users receive breaking news.
  return null;
}
