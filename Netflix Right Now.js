/**
 * Netflix Right Now 热门榜
 *
 * 数据源：https://www.whats-on-netflix.com/most-popular/
 * 页面中 “Right now” 区块下方的 Movies / TV series 两张榜单（最多各 50 名），
 * 合并后按 Netflix 热度值（points）混合排序，默认从高到低。
 *
 * 页面本身只有 Netflix 内部 id 与标题，海报/详情通过 TMDB 搜索补全；
 * 因此返回的是内置 tmdb 详情页可直接打开的 VideoItem。
 */

WidgetMetadata = {
  id: "forward.netflix_right_now",
  title: "Netflix Right Now 热门榜",
  version: "4.0.0",
  requiredVersion: "0.0.1",
  description:
    "抓取 whats-on-netflix.com 的 Right now 榜单，合并 Movies 与 TV series，仅保留 Netflix 热度值 ≥ 90 的条目，再按热度混合排序（默认从高到低）",
  author: "Forward",
  site: "https://www.whats-on-netflix.com/most-popular/",
  modules: [
    {
      id: "netflix_right_now",
      title: "Right now 电影 + 剧集",
      functionName: "loadList",
      cacheDuration: 1800,
      params: [
        {
          name: "media_type",
          title: "内容类型",
          type: "enumeration",
          value: "all",
          enumOptions: [
            { title: "全部（混合排序）", value: "all" },
            { title: "仅电影", value: "movie" },
            { title: "仅剧集", value: "tv" }
          ]
        },
        {
          name: "sort_mode",
          title: "排序方式",
          type: "enumeration",
          value: "points_desc",
          enumOptions: [
            { title: "热度从高到低", value: "points_desc" },
            { title: "热度从低到高", value: "points_asc" }
          ]
        },
        { name: "page", title: "页码", type: "page" }
      ]
    }
  ]
};

const CHART_URL = "https://www.whats-on-netflix.com/most-popular/";
const PAGE_SIZE = 20;
// 只保留 Netflix 热度值达到该阈值的条目：低热度长尾既没有代表性，TMDB 也大多搜不到
const MIN_POINTS = 90;
// 同名作品靠“是否在 Netflix 上架”来消歧时使用的 provider id（TMDB 里 Netflix 固定为 8）
const NETFLIX_PROVIDER_ID = 8;
const CHART_TTL_MS = 10 * 60 * 1000;
const TYPE_LABEL = { movie: "电影", tv: "剧集" };
const TYPE_BADGE = { movie: "🎬", tv: "📺" };
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

let chartMemo = { time: 0, items: [], chartDate: "" };
const tmdbMemo = Object.create(null);
const providerMemo = Object.create(null);

async function loadList(params = {}) {
  try {
    const page = Math.max(1, Number(params.page) || 1);
    const mediaType = params.media_type || "all";
    const sortMode = params.sort_mode || "points_desc";
    const language = params.language || "zh-CN";

    const chart = await getChart();
    let items = chart.items.slice();

    if (mediaType === "movie" || mediaType === "tv") {
      items = items.filter((item) => item.mediaType === mediaType);
    }
    items = items.filter((item) => item.points >= MIN_POINTS);
    sortChartItems(items, sortMode);

    const start = (page - 1) * PAGE_SIZE;
    const pageItems = items.slice(start, start + PAGE_SIZE);
    if (pageItems.length === 0) return [];

    const resolved = await mapLimit(pageItems, 6, (item) => buildVideoItem(item, chart.chartDate, language));
    const list = resolved.filter(Boolean);

    if (page === 1 && list.length === 0) {
      console.error("[loadList] 榜单解析成功但没有任何条目匹配到 TMDB");
    }
    return list;
  } catch (error) {
    console.error("[loadList] 失败:", error.message || error);
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* 榜单抓取与解析                                                      */
/* ------------------------------------------------------------------ */

async function getChart() {
  const now = Date.now();
  if (chartMemo.items.length > 0 && now - chartMemo.time < CHART_TTL_MS) {
    return chartMemo;
  }

  const html = await fetchChartHtml();
  const parsed = parseChart(html);
  if (parsed.items.length === 0) {
    throw new Error("未能从页面解析出 Right now 榜单，页面结构可能已变化");
  }

  chartMemo = { time: now, items: parsed.items, chartDate: parsed.chartDate };
  return chartMemo;
}

async function fetchChartHtml() {
  const res = await Widget.http.get(CHART_URL, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const html = typeof res === "string" ? res : res && res.data;
  if (typeof html !== "string" || html.length === 0) {
    throw new Error("榜单页面返回空内容");
  }
  if (html.indexOf("won-mp") === -1) {
    throw new Error("榜单页面内容异常（未找到榜单标记）");
  }
  return html;
}

function parseChart(html) {
  const $ = Widget.html.load(html);
  const byKey = new Map();
  let chartDate = "";

  // 同一部片可能在榜单里以不同语言标题重复出现（Netflix id 相同），
  // 只保留热度值最高（也就是排名最好）的那一条。
  const addEntry = (entry) => {
    if (!entry || !entry.title) return;
    if (!chartDate && entry.date) chartDate = entry.date;

    const key = entry.netflixId
      ? entry.mediaType + ":" + entry.netflixId
      : entry.mediaType + ":title:" + entry.title.toLowerCase();
    const prev = byKey.get(key);
    if (!prev || entry.points > prev.points || (entry.points === prev.points && entry.rank < prev.rank)) {
      byKey.set(key, entry);
    }
  };

  const readButton = (btn) => {
    const $btn = $(btn);
    const rawType = $btn.attr("data-won-mp-trend-type");
    return {
      mediaType: rawType === "tv" ? "tv" : "movie",
      netflixId: $btn.attr("data-won-mp-trend-id") || "",
      title: ($btn.attr("data-won-mp-trend-title") || $btn.text() || "").replace(/\s+/g, " ").trim(),
      date: $btn.attr("data-won-mp-trend-end-date") || ""
    };
  };

  // 1) “Right now” 区块的双榜榜首（也作为榜单表格解析失败时的兜底）
  $(".won-mp-now .won-mp-leader, .won-mp-leader").each((_, el) => {
    const $el = $(el);
    const $btn = $el.find("button[data-won-mp-trend-type]").first();
    if ($btn.length === 0) return;

    addEntry({
      ...readButton($btn),
      rank: toInt($el.find(".won-mp-leader__rank").first().text()) || 1,
      points: toInt($el.find(".won-mp-points").first().text()),
      move: ($el.find(".won-mp-move").first().text() || "").trim()
    });
  });

  // 2) “Right now” 下方的全球榜单表格：每行左列 Movies、右列 TV series
  let $rows = $("table.won-mp-table--global tbody tr");
  if ($rows.length === 0) $rows = $("#won-mp-charts tbody tr");

  $rows.each((rowIndex, tr) => {
    const $tr = $(tr);
    const rowRank = toInt($tr.find("td.won-mp-rank-col").first().text()) || rowIndex + 1;

    $tr.find("button[data-won-mp-trend-type]").each((_, btn) => {
      const $btn = $(btn);
      const $td = $btn.closest("td");
      const $points = $td.next("td").find(".won-mp-points").first();
      const $move = $td.next("td").next("td").find(".won-mp-move").first();

      addEntry({
        ...readButton($btn),
        rank: rowRank,
        points: toInt($points.text()),
        move: ($move.text() || "").trim()
      });
    });
  });

  const items = Array.from(byKey.values()).sort(
    (a, b) => b.points - a.points || a.rank - b.rank || a.title.localeCompare(b.title)
  );
  return { items, chartDate };
}

function sortChartItems(items, sortMode) {
  const direction = sortMode === "points_asc" ? 1 : -1;
  items.sort((a, b) => {
    if (a.points !== b.points) return (a.points - b.points) * direction;
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.mediaType !== b.mediaType) return a.mediaType === "movie" ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return items;
}

function toInt(value) {
  const number = parseInt(String(value == null ? "" : value).replace(/[^\d-]/g, ""), 10);
  return Number.isFinite(number) ? number : 0;
}

/* ------------------------------------------------------------------ */
/* TMDB 匹配与条目构造                                                  */
/* ------------------------------------------------------------------ */

async function buildVideoItem(entry, chartDate, language) {
  const match = await resolveTmdb(entry, language);
  if (!match) {
    console.error("[loadList] 未匹配到 TMDB:", entry.mediaType, entry.title);
    return null;
  }

  const displayTitle = match.title || match.name || entry.title;
  const releaseDate = match.release_date || match.first_air_date || "";
  const typeLabel = TYPE_LABEL[entry.mediaType];

  const descLines = [`Netflix 热度 ${entry.points} 分 · ${typeLabel}榜第 ${entry.rank} 名`];
  if (entry.move) descLines.push(`较昨日：${entry.move}`);
  if (chartDate) descLines.push(`榜单日期：${chartDate}`);
  if (normalizeTitle(displayTitle) !== normalizeTitle(entry.title)) descLines.push(`原名：${entry.title}`);
  if (match.overview) descLines.push("", match.overview);

  const videoItem = {
    id: match.id,
    type: "tmdb",
    mediaType: entry.mediaType,
    title: `${TYPE_BADGE[entry.mediaType]} ${displayTitle}`,
    posterPath: match.poster_path || "",
    backdropPath: match.backdrop_path || "",
    releaseDate,
    description: descLines.join("\n"),
    subTitle: `${typeLabel}榜 #${entry.rank} · 热度 ${entry.points}`,
    popularity: entry.points
  };

  if (typeof match.vote_average === "number" && match.vote_average > 0) {
    videoItem.rating = Math.round(match.vote_average * 10) / 10;
  }
  return videoItem;
}

async function resolveTmdb(entry, language) {
  const key = entry.mediaType + "||" + normalizeTitle(entry.title);
  if (key in tmdbMemo) return tmdbMemo[key];

  let match = await tmdbSearch(entry.title, entry, language);

  // 带副标题的片名（如 "Doctor X: Mafia in White"）在 TMDB 上可能只收录主标题
  const mainTitle = entry.title.split(/\s*[:：]\s*/)[0];
  if (!match && mainTitle && mainTitle !== entry.title) {
    match = await tmdbSearch(mainTitle, entry, language);
  }

  tmdbMemo[key] = match;
  return match;
}

async function tmdbSearch(query, entry, language) {
  try {
    const res = await Widget.tmdb.get(`search/${entry.mediaType}`, {
      params: { query, language, include_adult: false }
    });
    return await pickBestMatch((res && res.results) || [], query, entry);
  } catch (error) {
    console.error("[tmdbSearch] 失败:", query, error.message || error);
    return null;
  }
}

/*
 * 同名作品在 TMDB 上经常有好几部（The Trap / Below / Blackout 这类通用名尤甚），
 * 只按 popularity + vote_count 排序，几乎必然选到“最出名的那一部”，而不是榜单上这一部。
 * 现在按三层信号收敛：
 *   1) 片名：完全相同(1000) > 前缀相同(300) > 共享实词(100)，完全无关的直接丢掉；
 *   2) 时间：榜单是“此刻”，候选的播出/上映年份越接近榜单日期越可能是同一部；
 *   3) 上架：片名完全相同的候选之间，用 watch/providers 查它是否真的在 Netflix 上，
 *      在架者优先——能上 Netflix 榜单的作品，本来就该在 Netflix 上可以看到。
 */
async function pickBestMatch(results, wantedTitle, entry) {
  if (!results || results.length === 0) return null;

  const target = normalizeTitle(wantedTitle);
  const targetTokens = target.split(" ").filter(Boolean);
  const chartYear = toYear(entry && entry.date);

  const ranked = results
    .filter((result) => result && result.id)
    .map((result) => scoreCandidate(result, target, targetTokens, chartYear))
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;

  // 只有“片名完全一致”的多个候选才值得多花几次请求去查上架情况
  const exact = ranked.filter((candidate) => candidate.exact);
  if (exact.length > 1) {
    const verified = [];
    for (const candidate of exact.slice(0, 3)) {
      if (await isOnNetflix(candidate.result.id, entry.mediaType)) verified.push(candidate);
    }
    if (verified.length > 0) {
      // verified 已按分数排序：同年份内热度高、票数多的在前
      return verified[0].result;
    }
  }

  const best = ranked[0];
  // 完全没有任何片名关联时宁可不展示，也不返回一部错误的剧
  if (best.score < 100) return null;
  return best.result;
}

function scoreCandidate(result, target, targetTokens, chartYear) {
  const names = [result.title, result.name, result.original_title, result.original_name]
    .filter(Boolean)
    .map(normalizeTitle)
    .filter(Boolean);
  if (names.length === 0) return null;

  let titleScore = 0;
  if (names.indexOf(target) !== -1) {
    titleScore = 1000;
  } else if (names.some((name) => name.indexOf(target) === 0 || target.indexOf(name) === 0)) {
    titleScore = 300;
  } else if (names.some((name) => hasSharedToken(name, targetTokens))) {
    titleScore = 100;
  } else {
    return null;
  }

  let recency = 0;
  const year = toYear(result.release_date || result.first_air_date);
  if (chartYear && year) {
    const gap = Math.abs(chartYear - year);
    recency = gap <= 1 ? 60 : gap <= 3 ? 20 : -10 * Math.min(5, gap - 3);
  }

  // 热度与票数只作为同年份候选之间的细微权重，不改变“片名是否匹配”的判断
  const popularity = Math.min(100, Number(result.popularity) || 0) / 20;
  const votes = Math.min(50, Number(result.vote_count) || 0) / 200;

  return { result, score: titleScore + recency + popularity + votes, exact: titleScore >= 1000 };
}

async function isOnNetflix(id, mediaType) {
  const key = mediaType + "||" + id;
  if (key in providerMemo) return providerMemo[key];

  let onNetflix = false;
  try {
    const res = await Widget.tmdb.get(`${mediaType}/${id}/watch/providers`, { params: {} });
    const regions = (res && res.results) || {};
    onNetflix = Object.keys(regions).some((region) => {
      const offer = regions[region] || {};
      return ["flatrate", "free", "ads"].some((channel) =>
        Array.isArray(offer[channel]) &&
        offer[channel].some(
          (provider) =>
            Number(provider.provider_id) === NETFLIX_PROVIDER_ID ||
            /netflix/i.test(provider.provider_name || "")
        )
      );
    });
  } catch (error) {
    console.error("[isOnNetflix] 查询上架失败:", mediaType, id, error.message || error);
  }

  providerMemo[key] = onNetflix;
  return onNetflix;
}

function toYear(value) {
  const match = String(value == null ? "" : value).match(/(\d{4})/);
  return match ? Number(match[1]) : 0;
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
