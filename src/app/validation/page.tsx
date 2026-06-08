import Link from "next/link";
import { getArticleList, getArticleContent } from "@/lib/articles";
import { validateArticle } from "@/lib/validation";
import { BRANDS, BRAND_LABELS, type Brand } from "@/lib/types";
import type { ValidationIssue } from "@/lib/types";

interface Props {
  searchParams: { brand?: string; slug?: string };
}

export default function ValidationPage({ searchParams }: Props) {
  const selectedBrand = searchParams.brand?.toUpperCase() as Brand | undefined;
  const selectedSlug = searchParams.slug;

  // 特定の記事の詳細検証
  if (selectedBrand && selectedSlug && BRANDS.includes(selectedBrand)) {
    const m = selectedSlug.match(/^(\d+)_(.+)$/);
    if (m) {
      const [, number, slug] = m;
      const content = getArticleContent(selectedBrand, number, slug);
      if (content) {
        const result = validateArticle(content);
        return (
          <DetailValidation
            brand={selectedBrand}
            slug={selectedSlug}
            result={result}
          />
        );
      }
    }
  }

  // ブランド別一括検証
  const brand = selectedBrand && BRANDS.includes(selectedBrand) ? selectedBrand : undefined;
  const articles = getArticleList(brand);

  const results = articles.map((meta) => {
    const content = getArticleContent(meta.brand, meta.number, meta.slug);
    if (!content) return null;
    return validateArticle(content);
  }).filter(Boolean);

  const totalErrors = results.reduce((s, r) => s + (r?.errorCount ?? 0), 0);
  const totalWarnings = results.reduce((s, r) => s + (r?.warningCount ?? 0), 0);
  const cleanCount = results.filter(
    (r) => r?.errorCount === 0 && r?.warningCount === 0
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          ルール検証
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          FK番号・価格・URL・UTM を一括チェックします
        </p>
      </div>

      {/* サマリーバー */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-lg px-6 py-4 text-center">
          <div className="text-2xl font-bold text-red-600">{totalErrors}</div>
          <div className="text-xs text-gray-500 mt-1">❌ エラー（件）</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-6 py-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {totalWarnings}
          </div>
          <div className="text-xs text-gray-500 mt-1">⚠️ 警告（件）</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-6 py-4 text-center">
          <div className="text-2xl font-bold text-green-600">{cleanCount}</div>
          <div className="text-xs text-gray-500 mt-1">✓ クリーン（件）</div>
        </div>
      </div>

      {/* ブランドフィルタータブ */}
      <div className="inline-flex flex-wrap gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4">
        <Link
          href="/validation"
          className={`text-sm px-3 py-1.5 rounded-md transition ${
            !brand
              ? "font-medium text-gray-900 bg-gray-100"
              : "text-gray-500 hover:bg-gray-100"
          }`}
        >
          すべて
        </Link>
        {BRANDS.filter((b) => getArticleList(b).length > 0).map((b) => (
          <Link
            key={b}
            href={`/validation?brand=${b}`}
            className={`text-sm px-3 py-1.5 rounded-md transition ${
              brand === b
                ? "font-medium text-gray-900 bg-gray-100"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {BRAND_LABELS[b]}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <tr>
              <th className="text-left px-4 py-3">ブランド</th>
              <th className="text-left px-4 py-3">スラッグ</th>
              <th className="text-center px-3 py-3 w-20">エラー</th>
              <th className="text-center px-3 py-3 w-20">警告</th>
              <th className="px-4 py-3 w-28 text-right">アクション</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              if (!result) return null;
              const { articleMeta, errorCount, warningCount } = result;
              const ok = errorCount === 0 && warningCount === 0;
              const rowBg =
                errorCount > 0
                  ? "bg-red-50"
                  : warningCount > 0
                  ? "bg-amber-50"
                  : "";
              return (
                <tr
                  key={`${articleMeta.brand}_${articleMeta.filename}`}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${rowBg}`}
                >
                  <td className="px-4 py-2.5 text-xs text-gray-500">
                    {BRAND_LABELS[articleMeta.brand]}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                    {articleMeta.number}_{articleMeta.slug}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {errorCount > 0 ? (
                      <span className="text-sm font-semibold text-red-600">
                        {errorCount}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {warningCount > 0 ? (
                      <span className="text-sm font-semibold text-amber-600">
                        {warningCount}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {!ok ? (
                      <Link
                        href={`/validation?brand=${articleMeta.brand}&slug=${articleMeta.number}_${articleMeta.slug}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        詳細を見る
                      </Link>
                    ) : (
                      <span className="text-green-600 text-xs">✓ OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {results.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            記事が見つかりません
          </div>
        )}
      </div>
    </div>
  );
}

function DetailValidation({
  brand,
  slug,
  result,
}: {
  brand: Brand;
  slug: string;
  result: ReturnType<typeof validateArticle>;
}) {
  const issuesByType = result.issues.reduce<Record<string, ValidationIssue[]>>(
    (acc, issue) => {
      if (!acc[issue.type]) acc[issue.type] = [];
      acc[issue.type].push(issue);
      return acc;
    },
    {}
  );

  const TYPE_LABELS: Record<string, string> = {
    fk_number: "FK番号",
    price: "価格表現",
    individual_url: "個別商品URL",
    missing_utm: "UTMパラメータ不足",
    missing_cta: "CTA不足",
    ai_episode: "擬似エピソード・禁止語気",
    lifestyle_link: "ライフスタイル紐付け",
    external_source: "外部ソース言及",
  };

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/validation?brand=${brand}`}
          className="text-sm text-[#5a5248] hover:underline"
        >
          ← 検証一覧
        </Link>
        <h1 className="text-lg font-bold text-[#1a1a1a]">
          {slug} — 検証詳細
        </h1>
        <Link
          href={`/articles/${brand}/${slug}`}
          className="text-[#E67E22] text-xs hover:underline ml-auto"
        >
          記事プレビュー →
        </Link>
      </div>

      {result.issues.length === 0 ? (
        <div className="p-4 bg-green-50 border border-green-300 rounded text-green-700 text-sm font-medium">
          ✓ ルール違反が検出されませんでした
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(issuesByType).map(([type, issues]) => (
            <div key={type} className="glass-strong overflow-hidden">
              <div className="fk-thead px-4 py-2.5 text-sm font-medium flex items-center gap-2">
                {TYPE_LABELS[type] ?? type}
                <span className="ml-auto text-xs">
                  {issues.filter((i) => i.severity === "error").length > 0 && (
                    <span className="text-red-300 mr-2">
                      エラー {issues.filter((i) => i.severity === "error").length}
                    </span>
                  )}
                  {issues.filter((i) => i.severity === "warning").length > 0 && (
                    <span className="text-yellow-300">
                      警告 {issues.filter((i) => i.severity === "warning").length}
                    </span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-[#e8e4de]">
                {issues.map((issue, i) => (
                  <div
                    key={i}
                    className={`px-4 py-3 text-sm ${
                      issue.severity === "error"
                        ? "bg-red-50"
                        : "bg-yellow-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`text-xs font-bold mt-0.5 ${
                          issue.severity === "error"
                            ? "text-red-700"
                            : "text-yellow-700"
                        }`}
                      >
                        {issue.severity === "error" ? "ERROR" : "WARN"}
                      </span>
                      <div>
                        <div className="font-medium text-[#1a1a1a]">
                          {issue.message}
                        </div>
                        {issue.line && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            行 {issue.line}
                          </div>
                        )}
                        {issue.excerpt && (
                          <pre className="mt-1 text-xs bg-white border border-[#e8e4de] rounded px-2 py-1 font-mono text-gray-700 whitespace-pre-wrap">
                            {issue.excerpt}
                          </pre>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
