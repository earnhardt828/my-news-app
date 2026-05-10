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
      <div className="loading-screen-logo-wrap">
        <Image
          src="/branding/graffiti-loading-center.png"
          alt="Graffiti"
          width={96}
          height={96}
          priority
          className="loading-screen-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-center-dark.png"
          alt="Graffiti"
          width={96}
          height={96}
          priority
          className="loading-screen-logo branding-image-dark"
        />
      </div>
      <p className="loading-screen-status-text">{message ?? label}</p>
      <div className="loading-screen-bottom-wrap">
        <Image
          src="/branding/graffiti-loading-bottom.png"
          alt="Graffiti"
          width={150}
          height={30}
          priority
          className="loading-screen-bottom-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-bottom-dark.png"
          alt="Graffiti"
          width={150}
          height={30}
          priority
          className="loading-screen-bottom-logo branding-image-dark"
        />
      </div>
    </div>
  );
}
