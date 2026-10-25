/**
 * 豆瓣热门电影（全部）
 *
 * 数据源：https://movie.douban.com/explore?support_type=movie&is_all=false&category=热门&type=全部
 * 固定使用该页面的默认榜单：热门电影 → 全部，不再提供其他分类选项；
 * 只保留前两页，共 40 条，第 3 页起返回空数组以结束继续加载。
 *
 * 豆瓣条目本身带 subject id，直接返回 type: "douban"，由 App 内置的豆瓣详情页打开，
 * 不需要再做 TMDB 匹配，列表与详情数据完全对应豆瓣。
 */

WidgetMetadata = {
  id: "forward.douban_popular_movies",
  title: "豆瓣热门电影",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "豆瓣选电影默认榜：热门电影 · 全部，只保留前两页共 40 条",
  author: "Forward",
  site: "https://movie.douban.com/explore",
  modules: [
    {
      id: "douban_popular_movies",
      title: "热门电影（全部 · 前两页）",
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
const MAX_PAGES = 2;
const MAX_ITEMS = PAGE_SIZE * MAX_PAGES;
const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

async function loadList(params = {}) {
  try {
    const page = Math.max(1, Number(params.page) || 1);
    if (page > MAX_PAGES) return [];

    const start = (page - 1) * PAGE_SIZE;
    const limit = Math.min(PAGE_SIZE, MAX_ITEMS - start);

    const url = `${API}?start=${start}&limit=${limit}&category=${encodeURIComponent(CATEGORY)}&type=${encodeURIComponent(TYPE)}`;
    const res = await Widget.http.get(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://movie.douban.com/explore",
        Accept: "application/json"
      }
    });

    const data = typeof res === "string" ? JSON.parse(res) : (res && res.data !== undefined ? res.data : res);
    const payload = typeof data === "string" ? JSON.parse(data) : data;
    const items = (payload && payload.items) || [];

    return items
      .slice(0, limit)
      .filter((item) => item && item.id && item.title)
      .map(toVideoItem);
  } catch (error) {
    console.error("[loadList] 豆瓣热门电影加载失败:", error.message || error);
    throw error;
  }
}

function toVideoItem(item) {
  const poster = item.pic ? item.pic.large || item.pic.normal || "" : "";
  const rating = item.rating && typeof item.rating.value === "number" ? item.rating.value : 0;
  const ratingCount = item.rating && item.rating.count ? item.rating.count : 0;
  const year = extractYear(item.card_subtitle);
  const genres = extractGenres(item.card_subtitle);

  const descLines = [];
  if (item.card_subtitle) descLines.push(item.card_subtitle);
  if (rating > 0) {
    descLines.push(`豆瓣评分：${rating}${ratingCount ? `（${ratingCount} 人评价）` : ""}`);
  }
  descLines.push("数据来源：豆瓣选电影 · 热门 · 全部");

  const videoItem = {
    id: String(item.id),
    type: "douban",
    mediaType: "movie",
    title: item.title,
    posterPath: poster,
    releaseDate: year || "",
    genreTitle: genres || "",
    description: descLines.join("\n")
  };

  if (rating > 0) videoItem.rating = rating;
  return videoItem;
}

function extractYear(cardSubtitle) {
  const first = String(cardSubtitle || "").split("/")[0].trim();
  const match = first.match(/\d{4}/);
  return match ? match[0] : "";
}

function extractGenres(cardSubtitle) {
  const parts = String(cardSubtitle || "").split("/").map((part) => part.trim());
  return parts.length >= 3 ? parts[2] : "";
}
