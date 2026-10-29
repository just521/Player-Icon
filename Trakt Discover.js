/**
 * Trakt 发现（Discover）
 *
 * 数据源：Trakt 新站发现页 app.trakt.tv/discover 使用的 apiz.trakt.tv 接口。
 * 该接口无需登录，支持 countries / statuses / page / limit 等过滤参数，
 * 返回的条目已带 TMDB id，因此列表项可以直接交给 App 内置的 TMDB 详情页。
 *
 * 默认值与用户给出的发现页链接一致：
 *   mode=media & countries=us,cn & statuses=continuing,released,returning series,ended
 *
 * 列表标题/简介会用 TMDB 按当前语言补全（中文环境下得到中文标题）；
 * TMDB 查询失败时回退到 Trakt 原始数据，不会影响列表展示。
 */

WidgetMetadata = {
  id: "forward.trakt_discover",
  title: "Trakt 发现",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description:
    "复刻 Trakt 发现页：同时筛选美国 / 中国、在播 / 已上映 / 已完结的影视，支持热门、流行、期待、观看、收藏、播放等榜单",
  author: "Forward",
  site: "https://app.trakt.tv/discover",
  detailCacheDuration: 60,
  globalParams: [
    {
      name: "traktApiKey",
      title: "Trakt Client Key",
      type: "input",
      value: "",
      description: "选填。默认使用 Trakt Web 内置 Key；若接口失效，可填入自己的 Trakt API Key。"
    }
  ],
  modules: [
    {
      id: "trakt_discover",
      title: "Trakt 发现",
      functionName: "loadList",
      cacheDuration: 3600,
      params: [
        {
          name: "sort",
          title: "榜单",
          type: "enumeration",
          value: "trending",
          enumOptions: [
            { title: "🔥 正在热看", value: "trending" },
            { title: "📈 大众流行", value: "popular" },
            { title: "⏳ 最受期待", value: "anticipated" },
            { title: "👁 最近观看", value: "watched" },
            { title: "📥 最近收藏", value: "collected" },
            { title: "▶️ 播放最多", value: "played" }
          ]
        },
        {
          name: "media_type",
          title: "内容类型",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "电影 + 剧集", value: "all" },
            { title: "仅剧集", value: "tv" },
            { title: "仅电影", value: "movie" }
          ]
        },
        {
          name: "country",
          title: "国家 / 地区",
          type: "enumeration",
          value: "us,cn",
          enumOptions: [
            { title: "美国 + 中国（默认）", value: "us,cn" },
            { title: "仅美国", value: "us" },
            { title: "仅中国", value: "cn" },
            { title: "不限国家", value: "all" }
          ]
        },
        {
          name: "status",
          title: "状态",
          type: "enumeration",
          value: "default",
          enumOptions: [
            { title: "在播 / 已上映 / 已完结（默认）", value: "default" },
            { title: "仅连载中的剧集", value: "airing" },
            { title: "仅已完结", value: "ended" },
            { title: "不限状态", value: "all" }
          ]
        },
        {
          name: "language",
          title: "语言",
          type: "language",
          value: "zh-CN"
        },
        { name: "page", title: "页码", type: "page" }
      ]
    }
  ]
};

const API_BASE = "https://apiz.trakt.tv";
// app.trakt.tv 网页端使用的 Web Client Key（不是 api.trakt.tv 的开放 API Key）
const DEFAULT_API_KEY = "201dc70c5ec6af530f12f079ea1922733f6e1085ad7b02f36d8e011b75bcea7d";
const PAGE_SIZE = 20;
const SORT_VALUES = ["trending", "popular", "anticipated", "watched", "collected", "played"];
// apiz.trakt.tv 前置了 Cloudflare，非浏览器 UA 会被 403
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const STATUS_PRESETS = {
  default: "continuing,released,returning series,ended",
  airing: "continuing,returning series",
  ended: "ended",
  all: ""
};

const STATUS_LABELS = {
  "returning series": "待续",
  continuing: "在播",
  ended: "已完结",
  canceled: "已取消",
  released: "已上映",
  "in production": "制作中",
  planned: "待定",
  upcoming: "待播"
};

const COUNTRY_LABELS = {
  us: "美国",
  cn: "中国",
  gb: "英国",
  uk: "英国",
  jp: "日本",
  kr: "韩国",
  ca: "加拿大",
  au: "澳大利亚",
  fr: "法国",
  de: "德国",
  in: "印度",
  hk: "中国香港",
  tw: "中国台湾"
};

const TYPE_LABELS = { tv: "剧集", movie: "电影" };

const tmdbMemo = Object.create(null);

async function loadList(params = {}) {
  try {
    const page = Math.max(1, Number(params.page) || 1);
    const sort = SORT_VALUES.indexOf(params.sort) !== -1 ? params.sort : "trending";
    const mediaType =
      params.media_type === "tv" || params.media_type === "movie" ? params.media_type : "all";
    const country = normalizeCountry(params.country);
    const status = normalizeStatus(params.status);
    const language = params.language || "zh-CN";
    const apiKey = params.traktApiKey || DEFAULT_API_KEY;

    const rows = await fetchMedia({ sort, mediaType, country, status, page, apiKey });
    if (rows.length === 0) {
      if (page === 1) console.error("[loadList] Trakt 返回空列表:", { sort, mediaType, country, status });
      return [];
    }

    const entries = rows
      .map((row) => readEntry(row, mediaType))
      .filter((entry) => entry && entry.media && entry.media.ids && Number(entry.media.ids.tmdb));

    if (entries.length === 0) {
      console.error("[loadList] 返回了数据，但没有任何条目带 TMDB id");
      return [];
    }

    const baseRank = (page - 1) * PAGE_SIZE;
    const items = await mapLimit(entries, 6, (entry, index) =>
      buildItem(entry, {
        language,
        sort,
        mixed: mediaType === "all",
        rank: baseRank + index + 1
      })
    );
    return items.filter(Boolean);
  } catch (error) {
    console.error("[loadList] 失败:", error.message || error);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* Trakt 请求与数据规整                                                */
/* ------------------------------------------------------------------ */

async function fetchMedia({ sort, mediaType, country, status, page, apiKey }) {
  const section = mediaType === "tv" ? "shows" : mediaType === "movie" ? "movies" : "media";
  const query = {
    extended: "full,images,colors",
    page,
    limit: PAGE_SIZE
  };
  if (country) query.countries = country;
  if (status) query.statuses = status;

  const res = await Widget.http.get(`${API_BASE}/${section}/${sort}`, {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": UA,
      "trakt-api-version": "2",
      "trakt-api-key": apiKey,
      Origin: "https://app.trakt.tv",
      Referer: "https://app.trakt.tv/"
    },
    params: query
  });

  let rows = res && res.data;
  if (typeof rows === "string") {
    try {
      rows = JSON.parse(rows);
    } catch (error) {
      throw new Error("Trakt 返回内容不是合法 JSON");
    }
  }
  if (!Array.isArray(rows)) {
    throw new Error("Trakt 返回格式异常（不是数组）");
  }
  return rows;
}

/**
 * 各榜单的返回结构并不完全一致：
 * - trending / anticipated / watched / collected / played：{ watchers|list_count|..., show|movie }
 * - popular：直接是 show / movie 对象本身
 */
function readEntry(row, mediaTypeHint) {
  if (!row) return null;
  if (row.show) return { media: row.show, mediaType: "tv", row };
  if (row.movie) return { media: row.movie, mediaType: "movie", row };

  const media = row;
  let mediaType = mediaTypeHint === "tv" || mediaTypeHint === "movie" ? mediaTypeHint : "";
  if (!mediaType) {
    mediaType = media.first_aired || media.airs || media.network ? "tv" : "movie";
  }
  return { media, mediaType, row };
}

async function buildItem(entry, ctx) {
  const { media, mediaType, row } = entry;
  const tmdbId = Number(media.ids && media.ids.tmdb);
  if (!tmdbId) return null;

  const enriched = await enrichFromTmdb(tmdbId, mediaType, ctx.language);

  const title =
    (enriched && (enriched.name || enriched.title)) ||
    media.title ||
    media.original_title ||
    "";
  if (!title) return null;

  const overview = (enriched && enriched.overview) || media.overview || "";
  const posterPath =
    (enriched && enriched.poster_path) || firstImage(media.images, "poster");
  const backdropPath =
    (enriched && enriched.backdrop_path) ||
    firstImage(media.images, "fanart") ||
    firstImage(media.images, "thumb") ||
    firstImage(media.images, "banner") ||
    (enriched && enriched.poster_path);

  const releaseDate = normalizeDate(
    (enriched && (enriched.release_date || enriched.first_air_date)) ||
      media.released ||
      media.first_aired
  );
  const rating = normalizeRating(
    enriched && Number(enriched.vote_average) > 0 ? enriched.vote_average : media.rating
  );

  const countryLabel = COUNTRY_LABELS[String(media.country || "").toLowerCase()] || "";
  const statusLabel = STATUS_LABELS[String(media.status || "").toLowerCase()] || "";
  const typeLabel = TYPE_LABELS[mediaType] || "";
  const audience = audienceText(row, ctx.sort);

  const meta = [];
  if (ctx.mixed) meta.push(typeLabel);
  if (countryLabel) meta.push(countryLabel);
  if (mediaType === "tv" && media.network) meta.push(media.network);
  if (statusLabel) meta.push(statusLabel);
  if (releaseDate) meta.push(releaseDate);

  const descriptionLines = [];
  if (meta.length) descriptionLines.push(meta.join(" · "));
  if (overview) {
    if (descriptionLines.length) descriptionLines.push("");
    descriptionLines.push(overview);
  }

  const subtitleParts = [`#${ctx.rank}`];
  if (audience) subtitleParts.push(audience);
  if (ctx.mixed) subtitleParts.push(typeLabel);
  if (mediaType === "tv" && media.network) subtitleParts.push(media.network);
  if (statusLabel) subtitleParts.push(statusLabel);

  const item = {
    id: tmdbId,
    type: "tmdb",
    mediaType,
    title,
    posterPath,
    backdropPath,
    releaseDate,
    description: descriptionLines.join("\n"),
    subTitle: subtitleParts.filter(Boolean).join(" · ")
  };

  if (rating > 0) item.rating = rating;
  if (Number(media.votes) > 0) item.voteCount = Number(media.votes);
  return item;
}

async function enrichFromTmdb(id, mediaType, language) {
  const key = `${mediaType}:${id}:${language}`;
  if (key in tmdbMemo) return tmdbMemo[key];

  let detail = null;
  try {
    // Widget.tmdb.get 直接返回 TMDB 响应体（没有 .data 包装）
    detail = await Widget.tmdb.get(`${mediaType}/${id}`, { params: { language } });
  } catch (error) {
    console.error("[enrichFromTmdb] 查询失败:", mediaType, id, error.message || error);
  }

  tmdbMemo[key] = detail || null;
  return tmdbMemo[key];
}

/* ------------------------------------------------------------------ */
/* 展示辅助                                                            */
/* ------------------------------------------------------------------ */

function audienceText(row, sort) {
  if (!row) return "";
  const count = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  if (sort === "trending") {
    return count(row.watchers) ? `🔥 ${formatCount(row.watchers)} 人在看` : "";
  }
  if (sort === "anticipated") {
    return count(row.list_count) ? `❤️ ${formatCount(row.list_count)} 人期待` : "";
  }
  if (sort === "watched") {
    const n = count(row.watcher_count);
    return n ? `👁 ${formatCount(n)} 人看过` : "";
  }
  if (sort === "collected") {
    const n = count(row.collector_count) || count(row.collected_count);
    return n ? `📥 ${formatCount(n)} 人收藏` : "";
  }
  if (sort === "played") {
    return count(row.play_count) ? `▶️ ${formatCount(row.play_count)} 次播放` : "";
  }
  return "";
}

function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 100000000) return trimZero((n / 100000000).toFixed(1)) + "亿";
  if (n >= 10000) return trimZero((n / 10000).toFixed(1)) + "万";
  return String(n);
}

function trimZero(text) {
  return text.replace(/\.0$/, "");
}

function firstImage(images, name) {
  const list = images && images[name];
  if (!Array.isArray(list) || !list.length) return "";
  const path = String(list[0] || "");
  if (!path) return "";
  return /^https?:\/\//i.test(path) ? path : "https://" + path.replace(/^\/+/, "");
}

function normalizeDate(value) {
  const match = String(value == null ? "" : value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function normalizeRating(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 10) / 10;
}

function normalizeCountry(value) {
  if (value === undefined || value === null) return "us,cn";
  const raw = String(value).trim();
  if (!raw || raw === "all") return "";
  return raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join(",");
}

function normalizeStatus(value) {
  if (value === undefined || value === null) return STATUS_PRESETS.default;
  const raw = String(value).trim();
  if (raw in STATUS_PRESETS) return STATUS_PRESETS[raw];
  return raw;
}

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
