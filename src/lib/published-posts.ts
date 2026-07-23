import "server-only";

const WP_API_BASE =
  process.env.WP_PUBLIC_API_BASE ??
  "https://m.firekids.jp/wp-json/wp/v2";

const GENERATOR_BASE = (
  process.env.GENERATOR_API_BASE ??
  process.env.NEXT_PUBLIC_GENERATOR_URL ??
  "https://s5d6hqidtk.us-east-1.awsapprunner.com/generator/"
).replace(/\/+$/, "");

const REVALIDATE_SECONDS = 900;

type WPRendered = { rendered: string };

interface WPPost {
  id: number;
  date: string;
  link: string;
  title: WPRendered;
  categories: number[];
  tags: number[];
  status?: "publish" | "draft" | "future";
}

interface AppWPPost extends WPPost {
  brand?: string;
}

interface WPTerm {
  id: number;
  name: string;
}

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

async function fetchJson<T>(url: string): Promise<{ data: T; headers: Headers }> {
  const response = await fetch(url, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return { data: await response.json() as T, headers: response.headers };
}

async function fetchTerms(endpoint: "categories" | "tags"): Promise<Map<number, string>> {
  const url = `${WP_API_BASE}/${endpoint}?per_page=100&_fields=id,name`;
  const { data } = await fetchJson<WPTerm[]>(url);
  return new Map(data.map((term) => [term.id, decodeHtml(term.name)]));
}

async function fetchAllWordPressPosts(): Promise<WPPost[]> {
  const fields = "id,date,link,title,categories,tags";
  const firstUrl = `${WP_API_BASE}/posts?per_page=100&page=1&_fields=${fields}`;
  const first = await fetchJson<WPPost[]>(firstUrl);
  const totalPages = Math.max(1, Number(first.headers.get("X-WP-TotalPages") ?? "1"));
  if (totalPages === 1) return first.data;

  const remaining = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) => {
      const page = index + 2;
      return fetchJson<WPPost[]>(`${WP_API_BASE}/posts?per_page=100&page=${page}&_fields=${fields}`)
        .then((result) => result.data);
    }),
  );
  return first.data.concat(...remaining);
}

async function fetchAppPosts(): Promise<AppWPPost[]> {
  const token = process.env.DASHBOARD_API_TOKEN;
  if (!token) {
    throw new Error("DASHBOARD_API_TOKEN が未設定です");
  }
  const response = await fetch(`${GENERATOR_BASE}/dashboard-posts`, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: {
      Accept: "application/json",
      "X-Dashboard-Token": token,
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const body = await response.json() as { posts?: AppWPPost[] };
  return (body.posts ?? []).filter((post) => Number.isInteger(post.id));
}

export async function getPublishedPosts(): Promise<PublishedPostsResult> {
  const errors: string[] = [];
  try {
    const [wpPosts, categoryMap, tagMap, appResult] = await Promise.all([
      fetchAllWordPressPosts(),
      fetchTerms("categories"),
      fetchTerms("tags"),
      fetchAppPosts()
        .then((posts) => ({ posts, available: true }))
        .catch((error: unknown) => {
          errors.push(`アプリ投稿の判定データを取得できませんでした: ${error instanceof Error ? error.message : String(error)}`);
          return { posts: [] as AppWPPost[], available: false };
        }),
    ]);

    const appIds = new Set(appResult.posts.map((post) => post.id));
    const combined = new Map<number, AppWPPost | WPPost>(
      wpPosts.map((post) => [post.id, post]),
    );
    appResult.posts.forEach((post) => combined.set(post.id, post));

    const posts = [...combined.values()].map((post): PublishedPost => {
      const title = decodeHtml(post.title.rendered);
      const tags = post.tags.map((id) => tagMap.get(id)).filter((name): name is string => Boolean(name));
      if ("brand" in post && post.brand) tags.push(post.brand);
      const models = classifyModels(title);
      return {
        id: post.id,
        title,
        link: post.link,
        date: post.date.replace(/\./g, "-"),
        categories: post.categories.map((id) => categoryMap.get(id) ?? `カテゴリー ${id}`),
        brands: classifyBrands(title, tags),
        models: models.length > 0 ? models : ["その他"],
        origin: appIds.has(post.id) ? "app" : "existing",
        status: post.status ?? "publish",
      };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return {
      posts,
      appClassificationAvailable: appResult.available,
      errors,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    errors.push(`WordPress公開記事を取得できませんでした: ${error instanceof Error ? error.message : String(error)}`);
    return {
      posts: [],
      appClassificationAvailable: false,
      errors,
      fetchedAt: new Date().toISOString(),
    };
  }
}
