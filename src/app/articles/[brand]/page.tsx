import Link from "next/link";
import { notFound } from "next/navigation";
import { getArticleList } from "@/lib/articles";
import { BRANDS, BRAND_LABELS, type Brand, type ArticleMeta } from "@/lib/types";

interface Props {
  params: { brand: string };
}

export function generateStaticParams() {
  return BRANDS.map((b) => ({ brand: b }));
}

// スラッグ → 読みやすいタイトル（アンダースコア→スペース、先頭大文字化）
function slugToTitle(slug: string): string {
  return slug
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function BrandArticlesPage({ params }: Props) {
  const brand = params.brand.toUpperCase() as Brand;
  if (!BRANDS.includes(brand)) return notFound();

  const articles = getArticleList(brand);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline">
          <h1 className="text-xl font-semibold text-gray-900">
            {brand}（{BRAND_LABELS[brand]}）
          </h1>
          <span className="text-sm text-gray-500 ml-2 align-baseline">
            {articles.length}件
          </span>
        </div>
        <Link
          href="/articles"
          className="text-sm text-blue-600 hover:underline"
        >
          ← 一覧に戻る
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3 w-12">#</th>
              <th className="text-left px-4 py-3">記事タイトル</th>
              <th className="text-left px-4 py-3 w-28">ステータス</th>
              <th className="text-left px-4 py-3 w-28">更新日</th>
              <th className="text-right px-4 py-3 w-24">アクション</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr
                key={article.filename}
                className="border-b border-gray-100 hover:bg-gray-50"
              >
                <td className="px-4 py-3 text-xs text-gray-400 align-top">
                  {article.number}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">
                    {slugToTitle(article.slug)}
                  </div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    {article.slug}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <StatusPill article={article} />
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 align-top">
                  {formatDate(article.updatedAt)}
                </td>
                <td className="px-4 py-3 text-right align-top">
                  <Link
                    href={`/articles/${brand}/${article.number}_${article.slug}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    プレビュー
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {articles.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            記事が見つかりません
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ article }: { article: ArticleMeta }) {
  const base =
    "inline-block text-xs font-medium px-2 py-0.5 rounded-full border";
  if (article.hasTxt && article.hasHtml && article.hasXPost) {
    return (
      <span className={`${base} bg-green-50 text-green-700 border-green-200`}>
        Published
      </span>
    );
  }
  if (article.hasTxt && article.hasHtml) {
    return (
      <span className={`${base} bg-blue-50 text-blue-700 border-blue-200`}>
        Ready
      </span>
    );
  }
  return (
    <span className={`${base} bg-gray-50 text-gray-600 border-gray-200`}>
      Draft
    </span>
  );
}
