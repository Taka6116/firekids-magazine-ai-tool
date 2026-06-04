import Link from "next/link";
import { getBrandStats } from "@/lib/articles";
import { BRANDS, BRAND_LABELS } from "@/lib/types";

const GENERATOR_URL =
  process.env.NEXT_PUBLIC_GENERATOR_URL ??
  "https://s5d6hqidtk.us-east-1.awsapprunner.com/generator/";

export default function HomePage() {
  const stats = getBrandStats();
  const totalArticles = Object.values(stats).reduce(
    (s, b) => s + b.total,
    0
  );
  const totalHtml = Object.values(stats).reduce((s, b) => s + b.hasHtml, 0);
  const totalXPost = Object.values(stats).reduce(
    (s, b) => s + b.hasXPost,
    0
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient mb-1.5 tracking-tight">
          FIRE KIDS Magazine 管理ツール
        </h1>
        <p className="text-sm text-[#5a5248]">
          記事ブラウザ・ルール検証・HTML/X変換補助・WordPress投稿dry-run
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-3 gap-5 mb-6">
        <SummaryCard label="総記事数" value={totalArticles} />
        <SummaryCard label="HTML生成済み" value={totalHtml} />
        <SummaryCard label="X投稿あり" value={totalXPost} />
      </div>

      {/* 記事生成CTA */}
      <a
        href={GENERATOR_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="glass glass-hover block p-6 mb-6 relative overflow-hidden"
      >
        <div
          className="absolute inset-0 opacity-90"
          style={{
            background:
              "linear-gradient(110deg, rgba(230,126,34,0.12) 0%, rgba(139,111,71,0.08) 50%, transparent 100%)",
          }}
        />
        <div className="relative flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg text-[#1a1a1a]">
                記事を生成する
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#e67e22]/15 text-[#c4621a] border border-[#e67e22]/30">
                AWS Bedrock
              </span>
            </div>
            <p className="text-sm text-[#5a5248]">
              テーマを入力してAIでSEO記事を生成・保存します（別ウィンドウで開きます）
            </p>
          </div>
          <span className="text-[#c4621a] font-semibold text-sm whitespace-nowrap">
            生成ツールを開く →
          </span>
        </div>
      </a>

      {/* クイックアクション */}
      <div className="grid grid-cols-3 gap-5 mb-8">
        <QuickLink
          href="/articles"
          title="記事一覧"
          description="ブランド別に記事を一覧表示・検索"
        />
        <QuickLink
          href="/validation"
          title="ルール検証"
          description="FK番号・価格・URL・UTMを一括チェック"
        />
        <QuickLink
          href="/wordpress"
          title="WP dry-run"
          description="WordPress投稿前の内容確認"
        />
      </div>

      {/* ブランド別概要 */}
      <h2 className="text-lg font-bold mb-3 text-[#1a1a1a]">
        ブランド別概要
      </h2>
      <div className="glass-strong overflow-hidden">
        <table className="w-full text-sm">
          <thead className="fk-thead">
            <tr>
              <th className="text-left px-4 py-3">ブランド</th>
              <th className="text-right px-4 py-3">記事</th>
              <th className="text-right px-4 py-3">TXT</th>
              <th className="text-right px-4 py-3">HTML</th>
              <th className="text-right px-4 py-3">X投稿</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {BRANDS.filter((b) => stats[b].total > 0).map((brand, i) => (
              <tr
                key={brand}
                className={`transition hover:bg-[#e67e22]/5 ${
                  i % 2 === 0 ? "bg-white/40" : "bg-white/20"
                }`}
              >
                <td className="px-4 py-2.5 font-medium">
                  {BRAND_LABELS[brand]}
                  <span className="ml-2 text-xs text-gray-400">{brand}</span>
                </td>
                <td className="px-4 py-2.5 text-right">{stats[brand].total}</td>
                <td className="px-4 py-2.5 text-right text-green-700">
                  {stats[brand].hasTxt}
                </td>
                <td className="px-4 py-2.5 text-right text-blue-700">
                  {stats[brand].hasHtml}
                </td>
                <td className="px-4 py-2.5 text-right text-purple-700">
                  {stats[brand].hasXPost}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/articles/${brand}`}
                    className="text-[#E67E22] text-xs hover:underline"
                  >
                    一覧 →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="glass p-5">
      <div className="text-3xl font-bold stat-accent">{value}</div>
      <div className="text-sm text-[#5a5248] mt-1">{label}</div>
    </div>
  );
}

function QuickLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="glass glass-hover p-5 block">
      <div className="font-bold text-[#1a1a1a] mb-1">{title}</div>
      <div className="text-sm text-[#5a5248]">{description}</div>
    </Link>
  );
}
