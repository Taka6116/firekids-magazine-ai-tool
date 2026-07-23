import "server-only";

const GENERATOR_BASE = (
  process.env.GENERATOR_API_BASE ??
  process.env.NEXT_PUBLIC_GENERATOR_URL ??
  "https://s5d6hqidtk.us-east-1.awsapprunner.com/generator/"
).replace(/\/+$/, "");

const REVALIDATE_SECONDS = 900;

export type PostOrigin = "app" | "existing";

export interface PublishedPost {
  id: number;
  title: string;
  link: string;
  date: string;
  categories: string[];
  brands: string[];
  models: string[];
  origin: PostOrigin;
  status: "publish" | "draft" | "future";
}

export interface PublishedPostsResult {
  posts: PublishedPost[];
  appClassificationAvailable: boolean;
  errors: string[];
  fetchedAt: string;
}

const BRAND_ALIASES: Array<{ label: string; patterns: string[] }> = [
  { label: "ロレックス", patterns: ["ロレックス", "ROLEX"] },
  { label: "オメガ", patterns: ["オメガ", "OMEGA"] },
  { label: "セイコー", patterns: ["セイコー", "SEIKO"] },
  { label: "グランドセイコー", patterns: ["グランドセイコー", "GRAND SEIKO"] },
  { label: "シチズン", patterns: ["シチズン", "CITIZEN"] },
  { label: "IWC", patterns: ["IWC"] },
  { label: "チューダー", patterns: ["チューダー", "TUDOR"] },
  { label: "オリエント", patterns: ["オリエント", "ORIENT"] },
  { label: "ロンジン", patterns: ["ロンジン", "LONGINES"] },
  { label: "ジャガー・ルクルト", patterns: ["ジャガー・ルクルト", "ジャガールクルト", "JAEGER"] },
  { label: "カルティエ", patterns: ["カルティエ", "CARTIER"] },
  { label: "ユニバーサルジュネーブ", patterns: ["ユニバーサルジュネーブ", "ユニバーサル ジュネーブ", "UNIVERSAL"] },
  { label: "ブライトリング", patterns: ["ブライトリング", "BREITLING"] },
  { label: "ヴァシュロン・コンスタンタン", patterns: ["ヴァシュロン", "VACHERON"] },
  { label: "パテック・フィリップ", patterns: ["パテック", "PATEK"] },
  { label: "オーデマ・ピゲ", patterns: ["オーデマ", "AUDEMARS"] },
  { label: "タグ・ホイヤー", patterns: ["タグ・ホイヤー", "タグホイヤー", "TAG HEUER"] },
  { label: "ゼニス", patterns: ["ゼニス", "ZENITH"] },
  { label: "ハミルトン", patterns: ["ハミルトン", "HAMILTON"] },
  { label: "ブレゲ", patterns: ["ブレゲ", "BREGUET"] },
  { label: "エルメス", patterns: ["エルメス", "HERMES"] },
];

const MODEL_ALIASES: Array<{ label: string; patterns: string[] }> = [
  { label: "デイトジャスト", patterns: ["デイトジャスト", "DATEJUST"] },
  { label: "サブマリーナー", patterns: ["サブマリーナー", "サブマリーナ", "SUBMARINER"] },
  { label: "エクスプローラー", patterns: ["エクスプローラー", "EXPLORER"] },
  { label: "デイトナ", patterns: ["デイトナ", "DAYTONA"] },
  { label: "GMTマスター", patterns: ["GMTマスター", "GMT MASTER"] },
  { label: "ミルガウス", patterns: ["ミルガウス", "MILGAUSS"] },
  { label: "シードゥエラー", patterns: ["シードゥエラー", "SEA-DWELLER", "SEA DWELLER"] },
  { label: "エアキング", patterns: ["エアキング", "AIR-KING", "AIR KING"] },
  { label: "シーマスター", patterns: ["シーマスター", "SEAMASTER"] },
  { label: "スピードマスター", patterns: ["スピードマスター", "SPEEDMASTER"] },
  { label: "コンステレーション", patterns: ["コンステレーション", "CONSTELLATION"] },
  { label: "デ・ヴィル", patterns: ["デ・ヴィル", "デヴィル", "DE VILLE"] },
  { label: "セイコー5", patterns: ["セイコー5", "セイコー 5", "SEIKO 5"] },
  { label: "キングセイコー", patterns: ["キングセイコー", "KING SEIKO"] },
  { label: "グランドセイコー", patterns: ["グランドセイコー", "GRAND SEIKO"] },
  { label: "ロードマーベル", patterns: ["ロードマーベル", "LORD MARVEL"] },
  { label: "セイコーマチック", patterns: ["セイコーマチック", "SEIKOMATIC"] },
  { label: "アストロン", patterns: ["アストロン", "ASTRON"] },
  { label: "ナビタイマー", patterns: ["ナビタイマー", "NAVITIMER"] },
  { label: "クロノマット", patterns: ["クロノマット", "CHRONOMAT"] },
  { label: "ポルトフィーノ", patterns: ["ポルトフィーノ", "PORTOFINO"] },
  { label: "インヂュニア", patterns: ["インヂュニア", "インジュニア", "INGENIEUR"] },
  { label: "アクアタイマー", patterns: ["アクアタイマー", "AQUATIMER"] },
  { label: "タンク", patterns: ["カルティエ タンク", "CARTIER TANK", "タンク ルイ", "タンク マスト"] },
  { label: "サントス", patterns: ["サントス", "SANTOS"] },
  { label: "パシャ", patterns: ["パシャ", "PASHA"] },
  { label: "レベルソ", patterns: ["レベルソ", "REVERSO"] },
  { label: "マスター・コントロール", patterns: ["マスター・コントロール", "マスターコントロール", "MASTER CONTROL"] },
  { label: "ブラックベイ", patterns: ["ブラックベイ", "BLACK BAY"] },
  { label: "プリンス", patterns: ["チューダー プリンス", "TUDOR PRINCE"] },
  { label: "コンクエスト", patterns: ["コンクエスト", "CONQUEST"] },
  { label: "フラッグシップ", patterns: ["フラッグシップ", "FLAGSHIP"] },
  { label: "ナインティーンシックスティ", patterns: ["NINETEEN SIXTY", "ナインティーンシックスティ"] },
];

function decodeHtml(value: string): string {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&#039;": "'",
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&#8211;": "–",
    "&#8212;": "—",
    "&#038;": "&",
  };
  return value
    .replace(/&(amp|quot|apos|lt|gt|nbsp);|&#0?39;|&#8211;|&#8212;|&#0?38;/g, (m) => named[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]+>/g, "")
    .trim();
}

function includesPattern(text: string, pattern: string): boolean {
  return text.toLocaleUpperCase("ja-JP").includes(pattern.toLocaleUpperCase("ja-JP"));
}

export function classifyBrands(title: string, tags: string[]): string[] {
  const source = [...tags, title].join(" ");
  return BRAND_ALIASES
    .filter(({ patterns }) => patterns.some((pattern) => includesPattern(source, pattern)))
    .map(({ label }) => label);
}

export function classifyModels(title: string): string[] {
  return MODEL_ALIASES
    .filter(({ patterns }) => patterns.some((pattern) => includesPattern(title, pattern)))
    .map(({ label }) => label);
}

interface AnalyticsPost {
  id: number;
  date: string;
  link: string;
  title: string;
  categories: string[];
  tags: string[];
  status: "publish" | "draft" | "future";
  origin: PostOrigin;
  brand: string;
}

interface AnalyticsResponse {
  posts?: AnalyticsPost[];
  errors?: string[];
  app_lookup_ok?: boolean;
}

/**
 * 投稿分析データは App Runner 経由で取得する。
 * Vercel（米国データセンター IP）から m.firekids.jp を直接叩くと 403 になるため、
 * WordPress へ到達できる App Runner で全記事を正規化してもらう。
 */
async function fetchAnalyticsPosts(): Promise<AnalyticsResponse> {
  const token = process.env.DASHBOARD_API_TOKEN;
  if (!token) {
    throw new Error("DASHBOARD_API_TOKEN が未設定です");
  }
  const response = await fetch(`${GENERATOR_BASE}/dashboard-analytics`, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: {
      Accept: "application/json",
      "X-Dashboard-Token": token,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return await response.json() as AnalyticsResponse;
}

export async function getPublishedPosts(): Promise<PublishedPostsResult> {
  const errors: string[] = [];
  try {
    const body = await fetchAnalyticsPosts();
    const source = (body.posts ?? []).filter((post) => Number.isInteger(post.id));
    if (body.errors && body.errors.length > 0) {
      errors.push("WordPress記事の一部を取得できませんでした。");
    }

    const posts = source.map((post): PublishedPost => {
      const title = decodeHtml(post.title);
      const tags = (post.tags ?? []).map((tag) => decodeHtml(tag)).filter(Boolean);
      if (post.brand) tags.push(post.brand);
      const models = classifyModels(title);
      return {
        id: post.id,
        title,
        link: post.link,
        date: (post.date ?? "").replace(/\./g, "-"),
        categories: (post.categories ?? []).map((name) => decodeHtml(name)).filter(Boolean),
        brands: classifyBrands(title, tags),
        models: models.length > 0 ? models : ["その他"],
        origin: post.origin === "app" ? "app" : "existing",
        status: post.status ?? "publish",
      };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return {
      posts,
      appClassificationAvailable: body.app_lookup_ok !== false,
      errors,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    errors.push(`投稿データを取得できませんでした: ${error instanceof Error ? error.message : String(error)}`);
    return {
      posts: [],
      appClassificationAvailable: false,
      errors,
      fetchedAt: new Date().toISOString(),
    };
  }
}
