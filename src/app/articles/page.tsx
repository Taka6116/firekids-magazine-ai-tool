import Link from "next/link";
import { getBrandStats } from "@/lib/articles";
import { BRANDS, BRAND_LABELS } from "@/lib/types";

export default function ArticlesIndexPage() {
  const stats = getBrandStats();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gradient tracking-tight">記事一覧</h1>
        <p className="text-sm text-[#5a5248] mt-1">
          ブランドを選択して記事を確認してください
        </p>
      </div>

      <div className="grid grid-cols-3 gap-5">
        {BRANDS.filter((b) => stats[b].total > 0).map((brand) => (
          <Link
            key={brand}
            href={`/articles/${brand}`}
            className="glass glass-hover p-5 block"
          >
            <div className="font-bold text-[#1a1a1a]">
              {BRAND_LABELS[brand]}
            </div>
            <div className="text-xs text-gray-400 mb-2">{brand}</div>
            <div className="flex gap-3 text-xs">
              <span className="text-gray-600">
                計 <strong>{stats[brand].total}</strong>
              </span>
              <span className="text-green-700">
                TXT <strong>{stats[brand].hasTxt}</strong>
              </span>
              <span className="text-blue-700">
                HTML <strong>{stats[brand].hasHtml}</strong>
              </span>
              <span className="text-purple-700">
                X <strong>{stats[brand].hasXPost}</strong>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
