import Image from "next/image";

type LoadingScreenProps = {
  label?: string;
};

export default function LoadingScreen({
  label = "Loading Reflekt",
}: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-screen-logo-wrap">
        <Image
          src="/trending-r-logo.png"
          alt="Reflekt"
          width={72}
          height={72}
          priority
          className="loading-screen-logo"
        />
      </div>
    </div>
  );
}
