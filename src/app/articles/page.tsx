import Link from "next/link";
import { getBrandStats } from "@/lib/articles";
import { BRANDS, BRAND_LABELS } from "@/lib/types";

export default function ArticlesIndexPage() {
  const stats = getBrandStats();

  const totalArticles = Object.values(stats).reduce((s, b) => s + b.total, 0);
  const totalTxt = Object.values(stats).reduce((s, b) => s + b.hasTxt, 0);
  const totalHtml = Object.values(stats).reduce((s, b) => s + b.hasHtml, 0);
  const totalXPost = Object.values(stats).reduce((s, b) => s + b.hasXPost, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          記事一覧
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          ブランドを選択して記事を確認してください
        </p>
      </div>

      {/* KPI サマリーバー */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm grid grid-cols-4 mb-6">
        <KpiCell label="総記事数" value={totalArticles} />
        <KpiCell label="TXT生成済" value={totalTxt} />
        <KpiCell label="HTML生成済" value={totalHtml} />
        <KpiCell label="X投稿済" value={totalXPost} last />
      </div>

      {/* ブランドカードグリッド */}
      <div className="grid grid-cols-3 gap-4">
        {BRANDS.filter((b) => stats[b].total > 0).map((brand) => {
          const s = stats[brand];
          return (
            <Link
              key={brand}
              href={`/articles/${brand}`}
              className="bg-white border border-gray-200 rounded-lg p-5 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer block"
            >
              <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                {brand}
              </div>
              <div className="text-base font-semibold text-gray-900">
                {BRAND_LABELS[brand]}
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-3 mb-2">
                {s.total}
                <span className="text-sm font-medium text-gray-400 ml-1">
                  記事
                </span>
              </div>

              {/* ステータスバー（TXT / HTML / X） */}
              <div className="flex gap-2">
                <ProgressBar
                  value={s.hasTxt}
                  total={s.total}
                  color="bg-blue-500"
                />
                <ProgressBar
                  value={s.hasHtml}
                  total={s.total}
                  color="bg-green-500"
                />
                <ProgressBar
                  value={s.hasXPost}
                  total={s.total}
                  color="bg-orange-500"
                />
              </div>
              <div className="flex gap-3 mt-1.5 text-xs text-gray-500">
                <span>TXT {s.hasTxt}</span>
                <span>HTML {s.hasHtml}</span>
                <span>X {s.hasXPost}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function KpiCell({
  label,
  value,
  last = false,
}: {
  label: string;
  value: number;
  last?: boolean;
}) {
  return (
    <div className={`px-6 py-4 ${last ? "" : "border-r border-gray-200"}`}>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}

function ProgressBar({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  );
}
