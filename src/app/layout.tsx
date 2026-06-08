import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavLink } from "@/components/NavLink";

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
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-5 h-[52px] flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 hover:opacity-80 transition"
            >
              <span className="bg-red-600 text-white w-7 h-7 rounded font-bold text-sm flex items-center justify-center">
                FK
              </span>
              <span className="text-sm font-semibold text-gray-900">
                FIRE KIDS Magazine
              </span>
            </Link>

            {/* 中央: 将来の検索バー用スペース */}
            <div className="flex-1" />

            <nav className="flex items-center gap-1">
              <NavLink href="/articles" label="記事一覧" />
              <NavLink href="/validation" label="ルール検証" />
              <NavLink href="/wordpress" label="WP dry-run" />
              <a
                href={GENERATOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-md hover:bg-red-700 transition"
              >
                ＋ 記事を生成
              </a>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl mx-auto w-full px-5 py-8">
          {children}
        </main>

        <footer className="text-center py-4 text-xs text-gray-400">
          FIRE KIDS Magazine 管理ツール — 内部使用限定
        </footer>
      </body>
    </html>
  );
}
