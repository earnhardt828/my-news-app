import AppHeader from "./components/app-header";
import ArticleSourceReaderModal from "./components/article-source-reader-modal";
import BottomNav from "./components/bottom-nav";
import Script from "next/script";
import "./globals.css";

export const metadata = {
  title: "Graffiti",
  description:
    "A personalized social news feed with comments, profiles, and trending stories",
  metadataBase: new URL("https://graffiti.news"),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta
          name="google-adsense-account"
          content="ca-pub-7337526374337325"
        />
      </head>
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
        >{`
          try {
            var storedTheme = localStorage.getItem("graffiti-theme") || localStorage.getItem("reflekt-theme") || localStorage.getItem("mirur-theme");
            var theme = storedTheme === "dark" || storedTheme === "light"
              ? storedTheme
              : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            var weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
            var weekday = weekdayNames[new Date().getDay()] || "monday";
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.weekday = weekday;
            document.documentElement.style.colorScheme = theme;
          } catch (error) {}
        `}</Script>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7337526374337325"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-inner">
              <AppHeader />
            </div>
          </header>

          <main className="app-main">{children}</main>

          <BottomNav />
          <ArticleSourceReaderModal />
        </div>
      </body>
    </html>
  );
}
