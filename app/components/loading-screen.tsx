import Image from "next/image";

type LoadingScreenProps = {
  label?: string;
};

export default function LoadingScreen({
  label = "Loading Graffiti",
}: LoadingScreenProps) {
  return (
    <div className="loading-screen" role="status" aria-live="polite" aria-label={label}>
      <div className="loading-screen-logo-wrap">
        <Image
          src="/branding/graffiti-loading-center.png"
          alt="Graffiti"
          width={72}
          height={72}
          priority
          className="loading-screen-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-center-transparent.png"
          alt="Graffiti"
          width={72}
          height={72}
          priority
          className="loading-screen-logo branding-image-dark"
        />
      </div>
      <div className="loading-screen-bottom-wrap">
        <Image
          src="/branding/graffiti-loading-bottom.png"
          alt="Graffiti"
          width={180}
          height={36}
          priority
          className="loading-screen-bottom-logo branding-image-light"
        />
        <Image
          src="/branding/graffiti-loading-bottom-transparent.png"
          alt="Graffiti"
          width={180}
          height={36}
          priority
          className="loading-screen-bottom-logo branding-image-dark"
        />
      </div>
    </div>
  );
}
