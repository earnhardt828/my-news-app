import Image from "next/image";

type LoadingScreenProps = {
  label?: string;
  message?: string;
};

export default function LoadingScreen({
  label = "Loading Graffiti",
  message,
}: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-screen-spray loading-screen-spray-primary" aria-hidden="true" />
      <div className="loading-screen-spray loading-screen-spray-secondary" aria-hidden="true" />
      <div className="loading-screen-speckles" aria-hidden="true" />
      <div className="loading-screen-pulse" aria-hidden="true" />
      <div className="loading-screen-logo-wrap">
        <Image
          src="/branding/Logo%20Graffiti.png"
          alt="Graffiti"
          width={86}
          height={86}
          priority
          className="loading-screen-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-center-dark-transparent.png"
          alt="Graffiti"
          width={86}
          height={86}
          priority
          className="loading-screen-logo branding-image-dark"
        />
      </div>
      <p className="loading-screen-status-text">{message ?? label}</p>
      <div className="loading-screen-bottom-wrap">
        <Image
          src="/branding/Graffiti%20name%20logo%20rainbow.png"
          alt="Graffiti"
          width={172}
          height={34}
          priority
          className="loading-screen-bottom-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-bottom-dark-transparent.png"
          alt="Graffiti"
          width={172}
          height={34}
          priority
          className="loading-screen-bottom-logo branding-image-dark"
        />
      </div>
    </div>
  );
}
