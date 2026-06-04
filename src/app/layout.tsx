import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FIRE KIDS Magazine — 管理ツール",
  description: "FIRE KIDS Magazine 記事管理・検証・投稿補助ツール",
};

// 記事生成ページ（AWS App Runner / Bedrock）。環境変数で差し替え可能。
const GENERATOR_URL =
  process.env.NEXT_PUBLIC_GENERATOR_URL ??
  "https://s5d6hqidtk.us-east-1.awsapprunner.com/generator/";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <header className="glass-nav text-white sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-5 py-3.5 flex items-center gap-6">
            <Link
              href="/"
              className="font-bold text-lg tracking-wide hover:opacity-80 transition flex items-baseline gap-2"
            >
              <span className="text-white">FIRE KIDS Magazine</span>
              <span className="text-xs font-normal text-gray-400">
                管理ツール
              </span>
            </Link>
            <nav className="flex items-center gap-1 text-sm ml-auto">
              <NavLink href="/articles" label="記事一覧" />
              <NavLink href="/validation" label="ルール検証" />
              <NavLink href="/wordpress" label="WP dry-run" />
              <a
                href={GENERATOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 px-4 py-1.5 rounded-full text-sm font-semibold text-white transition hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(120deg, #e67e22 0%, #c4621a 100%)",
                  boxShadow: "0 4px 14px rgba(230,126,34,0.4)",
                }}
              >
                記事を生成
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-8">
          {children}
        </main>

        <footer className="text-center py-4 text-xs text-[#8b6f47]">
          FIRE KIDS Magazine 管理ツール — 内部使用限定
        </footer>
      </body>
    </html>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-full text-gray-300 hover:text-white hover:bg-white/10 transition"
    >
      {label}
    </Link>
  );
}
