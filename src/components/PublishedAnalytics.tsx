"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PublishedPost } from "@/lib/published-posts";

type Scope = "all" | "app" | "existing";

interface Props {
  posts: PublishedPost[];
  appClassificationAvailable: boolean;
  errors: string[];
  fetchedAt: string;
}

interface CountDatum {
  name: string;
  count: number;
}

const PIE_COLORS = ["#DC2626", "#2563EB", "#16A34A", "#D97706", "#7C3AED", "#64748B"];

const scopeLabels: Record<Scope, string> = {
  all: "すべて",
  app: "アプリ投稿",
  existing: "既存WP記事",
};

function countValues(values: string[][]): CountDatum[] {
  const counts = new Map<string, number>();
  values.flat().forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}

function buildMonthly(posts: PublishedPost[]): CountDatum[] {
  if (posts.length === 0) return [];
  const validDates = posts
    .map((post) => new Date(post.date))
    .filter((date) => !Number.isNaN(date.getTime()));
  if (validDates.length === 0) return [];

  const latest = new Date(Math.max(...validDates.map((date) => date.getTime())));
  const months: Array<{ key: string; name: string; count: number }> = [];
  for (let offset = 11; offset >= 0; offset -= 1) {
    const date = new Date(latest.getFullYear(), latest.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    months.push({ key, name: `${date.getMonth() + 1}月`, count: 0 });
  }
  const byKey = new Map(months.map((item) => [item.key, item]));
  posts.forEach((post) => {
    const key = post.date.slice(0, 7);
    const month = byKey.get(key);
    if (month) month.count += 1;
  });
  return months.map(({ name, count }) => ({ name, count }));
}

function ChartPanel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section className="fk-card p-5 min-w-0">
      <div className="mb-4">
        <h3 className="font-semibold text-[var(--text)]">{title}</h3>
        <p className="text-xs text-[var(--text-muted)] mt-1">{note}</p>
      </div>
      {children}
    </section>
  );
}

const tooltipStyle = {
  border: "1px solid rgba(15,23,42,.10)",
  borderRadius: 10,
  boxShadow: "0 8px 24px rgba(15,23,42,.10)",
  fontSize: 12,
};

export default function PublishedAnalytics({
  posts,
  appClassificationAvailable,
  errors,
  fetchedAt,
}: Props) {
  const [scope, setScope] = useState<Scope>("all");

  const filtered = useMemo(() => {
    if (scope === "all") return posts;
    return posts.filter((post) => post.origin === scope);
  }, [posts, scope]);

  const categoryData = useMemo(
    () => countValues(filtered.map((post) => post.categories.length > 0 ? post.categories : ["カテゴリーなし"])),
    [filtered],
  );
  const brandData = useMemo(
    () => countValues(filtered.map((post) => post.brands.length > 0 ? post.brands : ["ブランド未判定"])).slice(0, 12),
    [filtered],
  );
  const allModels = useMemo(() => countValues(filtered.map((post) => post.models)), [filtered]);
  const modelData = useMemo(() => allModels.filter((item) => item.name !== "その他").slice(0, 10), [allModels]);
  const unclassifiedModels = allModels.find((item) => item.name === "その他")?.count ?? 0;
  const monthlyData = useMemo(() => buildMonthly(filtered), [filtered]);
  const latestDate = filtered
    .map((post) => post.date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const statusCounts = {
    publish: filtered.filter((post) => post.status === "publish").length,
    future: filtered.filter((post) => post.status === "future").length,
    draft: filtered.filter((post) => post.status === "draft").length,
  };

  const scopeCounts: Record<Scope, number> = {
    all: posts.length,
    app: posts.filter((post) => post.origin === "app").length,
    existing: posts.filter((post) => post.origin === "existing").length,
  };

  return (
    <div>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-5">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">投稿分析</h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            WordPressの記事を、カテゴリー・ブランド・モデル・投稿日で集計しています。
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          データ取得 {new Date(fetchedAt).toLocaleString("ja-JP")}
        </p>
      </div>

      {errors.map((error) => (
        <div key={error} className="mb-4 rounded-xl bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E] ring-1 ring-[#F59E0B]/20">
          {error}
        </div>
      ))}

      <div className="flex items-center gap-2 flex-wrap mb-5" role="tablist" aria-label="投稿範囲">
        {(Object.keys(scopeLabels) as Scope[]).map((key) => {
          const unavailable = key !== "all" && !appClassificationAvailable;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={scope === key}
              disabled={unavailable}
              title={unavailable ? "アプリ投稿の判定データを取得できないため選択できません" : undefined}
              onClick={() => setScope(key)}
              className={`fk-chip ${scope === key ? "fk-chip-active" : ""} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {scopeLabels[key]}
              <span className={`ml-1 text-xs ${scope === key ? "text-white/80" : "text-[var(--text-muted)]"}`}>
                {scopeCounts[key].toLocaleString("ja-JP")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-baseline gap-3 mb-5">
        <span className="text-3xl font-bold stat-accent">{filtered.length.toLocaleString("ja-JP")}</span>
        <span className="text-sm text-[var(--text-muted)]">{scopeLabels[scope]}の記事</span>
        <span className="text-xs text-[var(--text-muted)]">
          公開 {statusCounts.publish.toLocaleString("ja-JP")}
          {statusCounts.future > 0 && `・予約 ${statusCounts.future.toLocaleString("ja-JP")}`}
          {statusCounts.draft > 0 && `・下書き ${statusCounts.draft.toLocaleString("ja-JP")}`}
        </span>
        {latestDate && (
          <span className="text-xs text-[var(--text-muted)]">
            最新 {new Date(latestDate).toLocaleDateString("ja-JP")}
          </span>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state fk-card">
          <p className="text-sm">この条件に該当する公開記事はありません。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <ChartPanel title="記事カテゴリー" note="WordPressに設定されたカテゴリー別の構成">
            <div className="h-[310px]" aria-label="記事カテゴリー円グラフ">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    dataKey="count"
                    nameKey="name"
                    innerRadius={62}
                    outerRadius={98}
                    paddingAngle={2}
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toLocaleString("ja-JP")}件`, "記事数"]} />
                  <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>

          <ChartPanel title="時計ブランド" note="WordPressタグを優先し、タイトルからもブランド名を補完">
            <div className="h-[310px]" aria-label="時計ブランド横棒グラフ">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brandData} layout="vertical" margin={{ left: 12, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(15,23,42,.08)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toLocaleString("ja-JP")}件`, "記事数"]} />
                  <Bar dataKey="count" fill="#DC2626" radius={[0, 5, 5, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>

          <ChartPanel
            title="モデル／時計名 上位"
            note={`記事タイトルから判定したモデル名。判定対象外 ${unclassifiedModels.toLocaleString("ja-JP")}件`}
          >
            <div className="h-[310px]" aria-label="モデル時計名横棒グラフ">
              {modelData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={modelData} layout="vertical" margin={{ left: 12, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(15,23,42,.08)" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" width={112} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toLocaleString("ja-JP")}件`, "記事数"]} />
                    <Bar dataKey="count" fill="#2563EB" radius={[0, 5, 5, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-[var(--text-muted)]">
                  タイトルから判定できるモデル名がありません。
                </div>
              )}
            </div>
          </ChartPanel>

          <ChartPanel title="月別の公開本数" note="選択中の記事を直近12か月で集計">
            <div className="h-[310px]" aria-label="月別公開本数折れ線グラフ">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData} margin={{ left: 0, right: 16, top: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(15,23,42,.08)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={34} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value) => [`${Number(value).toLocaleString("ja-JP")}件`, "公開本数"]} />
                  <Line type="monotone" dataKey="count" stroke="#16A34A" strokeWidth={2.5} dot={{ r: 3, fill: "#16A34A" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </ChartPanel>
        </div>
      )}
    </div>
  );
}
