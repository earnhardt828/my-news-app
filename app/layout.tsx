import Link from "next/link";
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
        <nav style={{ padding: "16px", borderBottom: "1px solid #ddd" }}>
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <Link href="/">Trending</Link>
            <Link href="/my-feed">My Feed</Link>
            <Link href="/search">Search</Link>
            <Link href="/profile">Profile</Link>
          </div>
        </nav>

        <main style={{ padding: "24px" }}>{children}</main>
      </body>
    </html>
  );
}
