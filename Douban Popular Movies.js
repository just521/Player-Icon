/**
 * 豆瓣热门电影（TMDB 匹配）
 *
 * 数据源：https://movie.douban.com/explore?support_type=movie&is_all=false&category=热门&type=全部
 * 固定使用该页面的默认榜单：热门电影 → 全部，加载前五页共 100 条。
 *
 * 按需求只从豆瓣抓取片名，封面、横图、评分、上映日期、简介等全部通过 TMDB 搜索匹配，
 * 返回 type: "tmdb" 的 VideoItem，可直接使用 App 内置的 TMDB 详情页。
 */

WidgetMetadata = {
  id: "forward.douban_popular_movies",
  title: "豆瓣热门电影",
  version: "2.0.1",
  requiredVersion: "0.0.1",
  description: "豆瓣热门电影 · 全部：只取前五页共 100 个片名，封面/评分/简介用 TMDB 匹配",
  author: "Forward",
  site: "https://movie.douban.com/explore",
  modules: [
    {
      id: "douban_popular_movies",
      title: "热门电影（全部 · 前五页）",
      functionName: "loadList",
      cacheDuration: 1800,
      params: [{ name: "page", title: "页码", type: "page", startPage: 1 }]
    }
  ]
};

const API = "https://m.douban.com/rexxar/api/v2/subject/recent_hot/movie";
const CATEGORY = "热门";
const TYPE = "全部";
const PAGE_SIZE = 20;
const MAX_PAGES = 5;
const MAX_ITEMS = PAGE_SIZE * MAX_PAGES;
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

const tmdbMemo = Object.create(null);

async function loadList(params = {}) {
  try {
    const page = Math.max(1, Number(params.page) || 1);
    if (page > MAX_PAGES) return [];

    const start = (page - 1) * PAGE_SIZE;
    const limit = Math.min(PAGE_SIZE, MAX_ITEMS - start);
    const language = params.language || "zh-CN";

    const titles = await fetchTitles(start, limit);
    if (titles.length === 0) return [];

    const resolved = await mapLimit(titles, 6, (title) => buildVideoItem(title, language));
    return resolved.filter(Boolean);
  } catch (error) {
    console.error("[loadList] 豆瓣热门电影加载失败:", error.message || error);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* 只抓取豆瓣片名                                                       */
/* ------------------------------------------------------------------ */

async function fetchTitles(start, limit) {
  const url = `${API}?start=${start}&limit=${limit}&category=${encodeURIComponent(CATEGORY)}&type=${encodeURIComponent(TYPE)}`;

  const res = await Widget.http.get(url, {
    headers: {
      "User-Agent": UA,
      Referer: "https://movie.douban.com/explore",
      Accept: "application/json"
    }
  });

  const data = typeof res === "string" ? JSON.parse(res) : res && res.data !== undefined ? res.data : res;
  const payload = typeof data === "string" ? JSON.parse(data) : data;
  const items = (payload && payload.items) || [];

  return items
    .slice(0, limit)
    .map((item) => (item && item.title ? String(item.title).trim() : ""))
    .filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* TMDB 匹配                                                            */
/* ------------------------------------------------------------------ */

async function buildVideoItem(title, language) {
  const match = await resolveTmdb(title, language);
  if (!match) {
    console.error("[loadList] 未匹配到 TMDB:", title);
    return null;
  }

  const tmdbTitle = match.title || match.name || "";
  const descLines = [];

  if (tmdbTitle && normalizeTitle(tmdbTitle) !== normalizeTitle(title)) {
    descLines.push(`TMDB 片名：${tmdbTitle}`);
  }
  if (match.release_date) descLines.push(`上映日期：${match.release_date}`);
  if (match.overview) descLines.push("", match.overview);

  const videoItem = {
    id: match.id,
    type: "tmdb",
    mediaType: "movie",
    title,
    posterPath: match.poster_path || "",
    backdropPath: match.backdrop_path || "",
    releaseDate: match.release_date || "",
    description: descLines.join("\n")
  };

  if (typeof match.vote_average === "number" && match.vote_average > 0) {
    videoItem.rating = Math.round(match.vote_average * 10) / 10;
  }

  return videoItem;
}

async function resolveTmdb(title, language) {
  const key = normalizeTitle(title);
  if (key in tmdbMemo) return tmdbMemo[key];

  const match = await tmdbSearch(title, language);
  tmdbMemo[key] = match;
  return match;
}

async function tmdbSearch(query, language) {
  try {
    const res = await Widget.tmdb.get("search/movie", {
      params: { query, language, include_adult: false }
    });
    return pickBestMatch((res && res.results) || [], query);
  } catch (error) {
    console.error("[tmdbSearch] 失败:", query, error.message || error);
    return null;
  }
}

function pickBestMatch(results, wantedTitle) {
  if (!results || results.length === 0) return null;

  const target = normalizeTitle(wantedTitle);
  const targetTokens = target.split(" ").filter(Boolean);
  // 太短的片名（如“春”“希望”）只认完全匹配，避免前缀匹配到无关电影
  const allowPrefix = target.length >= 4 || targetTokens.length > 1;
  let best = null;
  let bestScore = -Infinity;

  results.forEach((result, index) => {
    if (!result || !result.id) return;

    const names = [result.title, result.original_title]
      .filter(Boolean)
      .map(normalizeTitle)
      .filter(Boolean);

    let score = 0;
    if (names.indexOf(target) !== -1) {
      score += 1000;
    } else if (allowPrefix && names.some((name) => name.indexOf(target) === 0 || target.indexOf(name) === 0)) {
      score += 300;
    } else if (names.some((name) => hasSharedToken(name, targetTokens))) {
      score += 100;
    }

    score += Math.min(100, Number(result.popularity) || 0) / 10;
    score += Math.min(50, Number(result.vote_count) || 0) / 100;
    score += (results.length - index) / results.length;

    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  });

  // 片名完全对不上时宁可不展示，也不返回一部错误的电影
  if (bestScore < 100) return null;
  return best;
}

function hasSharedToken(name, tokens) {
  if (tokens.length === 0) return false;
  const nameTokens = name.split(" ");
  return tokens.some((token) => token.length > 2 && nameTokens.indexOf(token) !== -1);
}

function normalizeTitle(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[\s\-_:：·,，.。!！?？'"“”‘’()（）\[\]【】/\\]+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;

  const run = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index], index);
    }
  };

  const workers = [];
  const count = Math.max(1, Math.min(limit, items.length));
  for (let i = 0; i < count; i++) workers.push(run());
  await Promise.all(workers);
  return output;
}
