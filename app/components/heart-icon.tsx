"use client";

type HeartIconProps = {
  className?: string;
  filled?: boolean;
  size?: number;
  strokeWidth?: number;
};

export default function HeartIcon({
  className,
  filled = false,
  size = 20,
  strokeWidth = 1.9,
}: HeartIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      aria-hidden="true"
    >
      <path d="M12 21.25 10.7 20.06C5.12 15 2 12.18 2 8.52 2 5.66 4.24 3.5 7.1 3.5c1.7 0 3.34.8 4.4 2.07 1.06-1.27 2.7-2.07 4.4-2.07C18.76 3.5 21 5.66 21 8.52c0 3.66-3.12 6.48-8.7 11.54L12 21.25Z" />
    </svg>
  );
}
