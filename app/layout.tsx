import BottomNav from "./components/bottom-nav";
import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "Mirur",
  description:
    "A personalized social news feed with comments, profiles, and trending stories",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="google-adsense-account"
          content="ca-pub-7337526374337325"
        />
      </head>
      <body>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7337526374337325"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-inner">
              <div className="brand-row">
                <div className="brand-mark" aria-hidden="true">
                  M
                </div>
                <div className="brand-copy">
                  <p className="brand-kicker">Mirur</p>
                  <h1 className="brand-title">Mirur</h1>
                </div>
              </div>
              <p className="page-subtitle" style={{ marginTop: "6px" }}>
                Your personalized news feed
              </p>
            </div>
          </header>

          <main className="app-main">{children}</main>

          <BottomNav />
        </div>
      </body>
    </html>
  );
}
