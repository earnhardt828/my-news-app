type LoadingScreenProps = {
  label?: string;
  message?: string;
};

export default function LoadingScreen({
  label = "Loading Graffiti",
  message,
}: LoadingScreenProps) {
  console.log(
    "REMOVED IN-APP LOADING SCREEN FROM:",
    "/Users/erniewilson/my-news-app/app/components/loading-screen.tsx"
  );

  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-screen-inline">
        <span className="loading-screen-spinner" aria-hidden="true" />
        <span className="loading-screen-text">{message ?? label}</span>
      </div>
    </div>
  );
}
