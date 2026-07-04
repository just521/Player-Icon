WidgetMetadata = {
  id: "forward.db_mt",
  title: "豆瓣最近热门-TV",
  description: "国产剧、欧美剧、日剧、韩剧、动画、纪录片",
  author: "Forward",
  version: "1.4.2",
  requiredVersion: "0.0.1",
  site: "https://github.com/InchStudio/ForwardWidgets",

  modules: [
    {
      title: "剧集 动画 纪录片",
      description: "豆瓣最近热门剧集 动画 纪录片",
      functionName: "loadDoubanExplore",
      type: "video",
      cacheDuration: 3600,
      params: [
        {
          name: "channel",
          title: "分类",
          type: "enumeration",
          value: "tv",
          enumOptions: [
            { title: "综合", value: "tv" },
            { title: "国产剧", value: "tv_domestic" },
            { title: "欧美剧", value: "tv_american" },
            { title: "日剧", value: "tv_japanese" },
            { title: "韩剧", value: "tv_korean" },
            { title: "动画", value: "tv_animation" },
            { title: "纪录片", value: "tv_documentary" }
          ]
        },
        {
          name: "page",
          title: "页码",
          type: "page",
          startPage: 1
        }
      ]
    }
  ]
};

// ============================================
// Handler Functions
// ============================================

async function searchTmdb(title, mediaType, debugLog = []) {
  if (typeof title !== "string") {
    debugLog.push(`[TMDB Search] 错误: title 为空或不是字符串: ${title}`);
    return null;
  }

  // 清洗标题，去除季数、年番、完结篇等影响搜索的后缀
  let cleanTitle = title
    .replace(/第[一二三四五六七八九十\d]+[季期章回]/g, "")
    .replace(/年番\d*/g, "")
    .replace(/完结篇/g, "")
    .replace(/特别篇/g, "")
    .trim();

  if (!cleanTitle) cleanTitle = title;

  const logPrefix = `[TMDB Search: "${title}" -> "${cleanTitle}"]`;

  // 1. 尝试使用 search/multi 接口（支持同时搜索电影和剧集）
  try {
    const res = await Widget.tmdb.get("search/multi", {
      params: {
        query: cleanTitle,
        language: "zh-CN"
      }
    });
    if (res && res.results && res.results.length > 0) {
      // 筛选出电影或剧集类型的匹配项
      const match = res.results.find(r => r.media_type === "tv" || r.media_type === "movie");
      if (match) {
        debugLog.push(`${logPrefix} multi 成功匹配到 ${match.media_type} ID: ${match.id}`);
        return match;
      }
    }
    debugLog.push(`${logPrefix} multi 无结果`);
  } catch (error) {
    debugLog.push(`${logPrefix} multi 错误: ${error.message || error}`);
  }

  // 2. 尝试使用特定类型的 search 接口
  try {
    const res = await Widget.tmdb.get(`search/${mediaType}`, {
      params: {
        query: cleanTitle,
        language: "zh-CN"
      }
    });
    const match = (res.results || [])[0];
    if (match) {
      debugLog.push(`${logPrefix} ${mediaType} 成功匹配到 ID: ${match.id}`);
      match.media_type = mediaType;
      return match;
    }
    debugLog.push(`${logPrefix} ${mediaType} 无结果`);
  } catch (error) {
    debugLog.push(`${logPrefix} ${mediaType} 错误: ${error.message || error}`);
  }

  // 3. 如果是剧集类型且没搜到，尝试以电影类型搜索作为最终备用
  if (mediaType === "tv") {
    try {
      const res = await Widget.tmdb.get("search/movie", {
        params: {
          query: cleanTitle,
          language: "zh-CN"
        }
      });
      const match = (res.results || [])[0];
      if (match) {
        debugLog.push(`${logPrefix} movie 成功匹配到 ID: ${match.id}`);
        match.media_type = "movie";
        return match;
      }
      debugLog.push(`${logPrefix} movie 无结果`);
    } catch (error) {
      debugLog.push(`${logPrefix} movie 错误: ${error.message || error}`);
    }
  }

  return null;
}

async function loadDoubanExplore(params = {}) {
  const page = parseInt(params.page) || 1;
  const limit = 24;
  const start = (page - 1) * limit;
  const typeValue = params.channel || "tv";
  const debugLog = [];

  // 豆瓣移动版 Rexxar 接口，完美对应“选剧集”的真实数据请求
  const url = `https://m.douban.com/rexxar/api/v2/subject/recent_hot/tv?start=${start}&limit=${limit}&category=tv&type=${typeValue}`;

  try {
    const res = await Widget.http.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        "Referer": "https://m.douban.com/tv/"
      }
    });

    const data = typeof res.data === "string" ? JSON.parse(res.data) : (res.data || {});
    const list = (data.items || []).filter(item => item && item.id && item.title);
    if (list.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "⚠️ 暂无数据" }] : [];

    // 并行对每个豆瓣条目进行 TMDB 匹配
    const promises = list.map(async item => {
      const tmdb = await searchTmdb(item.title, "tv", debugLog);

      // 如果在列表中能成功匹配 TMDB，直接以 type: "tmdb" 返回，确保完美呈现与播放
      if (tmdb) {
        const rating = tmdb.vote_average || (item.rating ? item.rating.value : 0);
        const date = tmdb.first_air_date || tmdb.release_date || "";
        const year = date ? date.substring(0, 4) : "";
        const displayTitle = year ? `${item.title} (${year})` : item.title;
        return {
          id: tmdb.id,
          type: "tmdb",
          mediaType: tmdb.media_type || "tv",
          title: displayTitle,
          posterPath: tmdb.poster_path,
          backdropPath: tmdb.backdrop_path,
          releaseDate: date,
          rating: rating,
          description: item.card_subtitle || tmdb.overview || "暂无简介"
        };
      }

      // 如果在列表中没能匹配到 TMDB，我们不要将其过滤，而是作为 type: "url" 返回！
      // 这样用户在列表页中可以正常看到该剧集（显示豆瓣标题、评分、豆瓣封面），点击进入详情页时再做深度搜索匹配
      const yearMatch = (item.card_subtitle || "").match(/(\d{4})/);
      const releaseDate = yearMatch ? yearMatch[1] : "";
      const displayTitle = releaseDate ? `${item.title} (${releaseDate})` : item.title;
      return {
        id: `db_${item.id}`,
        type: "url",
        title: displayTitle,
        posterPath: item.pic ? item.pic.large : "",
        releaseDate: releaseDate,
        rating: item.rating ? item.rating.value : 0,
        description: item.card_subtitle || "暂无简介",
        link: `douban:${item.type || "tv"}:${item.id}:${item.title}`
      };
    });

    const results = (await Promise.all(promises)).filter(Boolean);

    // 对返回的结果默认进行时间降序排序
    results.sort((a, b) => {
      const dateA = a.releaseDate || "";
      const dateB = b.releaseDate || "";
      return dateB.localeCompare(dateA);
    });

    // 如果列表全空，展示错误和调试日志
    if (results.length === 0) {
      return page === 1 ? [{ id: "empty", type: "text", title: "⚠️ 未在TMDB找到匹配的剧集", description: debugLog.join("\n") }] : [];
    }

    return results;
  } catch (error) {
    console.error("[loadDoubanExplore] 失败:", error.message || error);
    return [{ id: "empty", type: "text", title: "⚠️ 豆瓣请求失败", description: "可能触发了频率限制，请稍后重试或切换网络。" }];
  }
}

async function loadDetail(link) {
  if (!link || !link.startsWith("douban:")) return null;
  const parts = link.split(":");
  const mediaType = parts[1]; // tv or movie
  const doubanId = parts[2];
  const title = parts[3];

  // 用户点击未匹配到 TMDB 的剧集时，详情页单次加载时再次尝试匹配 TMDB
  // 由于单次加载不涉及并发限流，且增加了多次尝试，搜到的概率极高
  let tmdbMatch = null;
  try {
    let res = await Widget.tmdb.get("search/multi", { params: { query: title, language: "zh-CN" } });
    let match = res?.results?.find(r => r.media_type === "tv" || r.media_type === "movie");
    if (!match) {
      res = await Widget.tmdb.get(`search/${mediaType}`, { params: { query: title, language: "zh-CN" } });
      match = res?.results?.[0];
    }
    if (!match && mediaType === "tv") {
      res = await Widget.tmdb.get("search/movie", { params: { query: title, language: "zh-CN" } });
      match = res?.results?.[0];
      if (match) match.media_type = "movie";
    }
    if (match) {
      tmdbMatch = match;
      tmdbMatch.media_type = match.media_type || mediaType;
    }
  } catch (e) {
    console.error("[loadDetail] 详情页 TMDB 匹配错误:", e);
  }

  // 获取该剧集的豆瓣详细数据用来展示简介和海报
  let doubanData = null;
  try {
    const url = `https://m.douban.com/rexxar/api/v2/${mediaType}/${doubanId}`;
    const res = await Widget.http.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        "Referer": "https://m.douban.com/tv/"
      }
    });
    doubanData = typeof res.data === "string" ? JSON.parse(res.data) : (res.data || {});
  } catch (e) { }

  const finalTitle = title;
  const finalDesc = doubanData?.intro || doubanData?.card_subtitle || "暂无简介";
  const finalPoster = doubanData?.pic?.large || "";

  // 如果成功匹配到了 TMDB，返回标准的 tmdb VideoItem 启用播放
  if (tmdbMatch) {
    return {
      id: tmdbMatch.id,
      type: "tmdb",
      mediaType: tmdbMatch.media_type,
      title: finalTitle,
      posterPath: tmdbMatch.poster_path || finalPoster,
      backdropPath: tmdbMatch.backdrop_path,
      releaseDate: tmdbMatch.first_air_date || tmdbMatch.release_date || "",
      rating: tmdbMatch.vote_average || doubanData?.rating?.value || 0,
      description: finalDesc
    };
  }

  const yearMatch = (doubanData?.card_subtitle || doubanData?.year || "").toString().match(/(\d{4})/);
  const releaseDate = yearMatch ? yearMatch[1] : "";

  // 依然没有匹配到，返回纯展示的 url 类型，避免报错
  return {
    id: link,
    type: "url",
    title: finalTitle,
    posterPath: finalPoster,
    releaseDate: releaseDate,
    description: finalDesc,
    link: link
  };
}
