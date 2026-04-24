import BottomNav from "./components/bottom-nav";
import "./globals.css";

export const metadata = {
  title: "My News App",
  description: "A news app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar-inner">
              <p className="brand-kicker">Morning Brief</p>
              <h1 className="brand-title">My News App</h1>
            </div>
          </header>

          <main className="app-main">{children}</main>

          <BottomNav />
        </div>
      </body>
    </html>
  );
}
