/**
 * 玛卡巴卡 Trakt 用户数据 Forward Widget
 * 聚合 Trakt 用户的想看、评分、列表与点赞
 */

WidgetMetadata = {
  id: "trakt_user_widget",
  title: "Trakt用户数据",
  description: "查看任一 Trakt 用户的想看/收藏夹、评分列表、公开列表与点赞",
  author: "𝙈𝙖𝙠𝙠𝙖𝙋𝙖𝙠𝙠𝙖",
  site: "https://t.me/MakkaPakkaOvO",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  
  globalParams: [
    {
      name: "traktClientId",
      title: "Trakt Client ID",
      type: "input",
      description: "选填，不填则使用内置。",
      value: ""
    }
  ],
  
  modules: [
    {
      title: "Trakt 用户数据",
      functionName: "loadTraktUserList",
      type: "video",
      cacheDuration: 3600,
      params: [
        {
          name: "username",
          title: "Trakt 用户名",
          type: "input",
          value: "love00"
        },
        {
          name: "category",
          title: "数据类型",
          type: "enumeration",
          value: "watchlist",
          enumOptions: [
            { title: "想看/收藏夹 (Watchlist)", value: "watchlist" },
            { title: "评分列表 (Ratings)", value: "ratings" },
            { title: "自定义列表 (Lists)", value: "lists" },
            { title: "点赞的列表 (Likes)", value: "likes" }
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

const DEFAULT_TRAKT_ID = "95b59922670c84040db3632c7aac6f33704f6ffe5cbf3113a056e37cb45cb482";

const GLOBAL_GENRE_MAP_ALL = {
    16: "动画", 10759: "动作冒险", 35: "喜剧", 18: "剧情", 14: "奇幻", 878: "科幻", 9648: "悬疑", 
    10749: "爱情", 27: "恐怖", 10765: "科幻奇幻", 80: "犯罪", 99: "纪录片", 10751: "家庭", 
    36: "历史", 10402: "音乐", 10770: "电视电影", 53: "惊悚", 10752: "战争", 37: "西部", 28: "动作", 12: "冒险",
    10762: "儿童", 10763: "新闻", 10764: "真人秀", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战综"
};

function getGlobalGenreText(ids) {
    if (!ids || !Array.isArray(ids)) return "影视";
    const genres = ids.map(id => GLOBAL_GENRE_MAP_ALL[id]).filter(Boolean);
    return genres.length > 0 ? genres.slice(0, 2).join(" / ") : "影视";
}

// =========================================================================
// Handler Functions
// =========================================================================

async function fetchTraktUserApi(endpoint, traktClientId, page) {
    const limit = 20;
    const url = `https://api.trakt.tv/${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=${limit}&page=${page}`;
    console.log(`[Trakt Debug] fetching endpoint: ${endpoint}, using client ID: "${traktClientId}"`);
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": traktClientId
    };
    try {
        const res = await Widget.http.get(url, { headers });
        return res?.data || [];
    } catch (e) {
        console.error(`[Trakt API Error] ${url}: ${e.message || e}`);
        throw e;
    }
}

async function loadTraktUserList(params = {}) {
    const username = params.username || "love00";
    const category = params.category || "watchlist";
    const page = params.page || 1;
    
    let traktClientId = params.traktClientId;
    if (!traktClientId || traktClientId === "null" || traktClientId === "undefined" || String(traktClientId).trim() === "") {
        traktClientId = DEFAULT_TRAKT_ID;
    }
    try {
        Widget.storage.set("trakt_client_id", traktClientId);
    } catch(err) {}

    try {
        if (category === "watchlist") {
            const rawData = await fetchTraktUserApi(`users/${username}/watchlist`, traktClientId, page);
            return await parseTraktUserItems(rawData, traktClientId, page);
        } else if (category === "ratings") {
            const rawData = await fetchTraktUserApi(`users/${username}/ratings`, traktClientId, page);
            return await parseTraktUserItems(rawData, traktClientId, page);
        } else if (category === "lists") {
            const rawData = await fetchTraktUserApi(`users/${username}/lists`, traktClientId, page);
            return (rawData || []).map(list => {
                const link = `trakt-list:${list.user?.username || username}:${list.ids.trakt}`;
                return {
                    id: link,
                    type: "url",
                    title: `📂 ${list.name}`,
                    genreTitle: "Trakt 列表",
                    subTitle: `📄 ${list.item_count} 个项目 · 👍 ${list.likes} 点赞`,
                    description: list.description || "暂无简介",
                    link: link
                };
            });
        } else if (category === "likes") {
            let rawData = [];
            try {
                rawData = await fetchTraktUserApi(`users/${username}/likes/lists`, traktClientId, page);
            } catch (err) {
                try {
                    rawData = await fetchTraktUserApi(`users/${username}/likes`, traktClientId, page);
                } catch (innerErr) {
                    return [{
                        id: "api_limit",
                        type: "text",
                        title: "🔒 点赞列表获取受限",
                        description: "由于 Trakt API 限制，无法获取非认证用户的公开点赞列表。请尝试查看其【想看/收藏夹 (Watchlist)】。"
                    }];
                }
            }
            if (!rawData || rawData.length === 0) return [];
            return (rawData || []).map(item => {
                const list = item.list;
                if (!list) return null;
                const link = `trakt-list:${list.user?.username || username}:${list.ids.trakt}`;
                return {
                    id: link,
                    type: "url",
                    title: `📂 ${list.name}`,
                    genreTitle: "Trakt 点赞列表",
                    subTitle: `📄 ${list.item_count} 个项目 · 👍 ${list.likes} 点赞`,
                    description: list.description || "暂无简介",
                    link: link
                };
            }).filter(Boolean);
        }
    } catch (e) {
        return [{ id: "empty", type: "text", title: "⚠️ 加载失败", description: e.message || "请检查网络或用户名" }];
    }
    return [];
}

async function parseTraktUserItems(rawData, traktClientId, page) {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return [];
    
    const promises = rawData.map(async (item, index) => {
        const mediaType = (item.type === "show" || item.show) ? "tv" : "movie";
        const subject = item.show || item.movie || item.season || item.episode || item;
        
        if (!subject || !subject.ids || !subject.ids.tmdb) {
            return {
                id: String(subject.ids?.trakt || subject.ids?.slug || Math.random()),
                type: "url",
                title: subject.title || subject.name || "未知",
                genreTitle: item.type || "Trakt",
                subTitle: subject.year ? String(subject.year) : "",
                description: `Trakt ID: ${subject.ids?.trakt || "未知"}`
            };
        }
        
        try {
            const d = await Widget.tmdb.get(`/${mediaType}/${subject.ids.tmdb}`, { params: { language: "zh-CN" } });
            const ratingText = item.rating ? `⭐ ${item.rating}分` : "";
            const yearText = (d.first_air_date || d.release_date || "").substring(0, 4);
            const subTitle = [yearText, ratingText].filter(Boolean).join(" · ");
            return {
                id: String(d.id),
                tmdbId: d.id,
                type: "tmdb",
                mediaType: mediaType,
                title: d.name || d.title || subject.title,
                genreTitle: getGlobalGenreText(d.genres?.map(g => g.id)),
                releaseDate: d.first_air_date || d.release_date || "",
                subTitle: subTitle,
                description: `${d.first_air_date || d.release_date || ""}\n${d.overview || "暂无简介"}`,
                posterPath: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : "",
                backdropPath: d.backdrop_path ? `https://image.tmdb.org/t/p/w780${d.backdrop_path}` : ""
            };
        } catch (e) {
            return {
                id: String(subject.ids.tmdb),
                tmdbId: subject.ids.tmdb,
                type: "tmdb",
                mediaType: mediaType,
                title: subject.title || "未知",
                description: "加载详情失败",
                subTitle: subject.year ? String(subject.year) : ""
            };
        }
    });
    
    return (await Promise.all(promises)).filter(Boolean);
}

// =========================================================================
// Detail view handler
// =========================================================================

async function loadDetail(link) {
    if (typeof link === "string" && link.startsWith("trakt-list:")) {
        const parts = link.split(":");
        const username = parts[1];
        const listId = parts[2];
        let traktClientId = DEFAULT_TRAKT_ID;
        try {
            traktClientId = Widget.storage.get("trakt_client_id") || DEFAULT_TRAKT_ID;
        } catch(err) {}
        try {
            const rawData = await fetchTraktUserApi(`users/${username}/lists/${listId}/items`, traktClientId, 1);
            const items = await parseTraktUserItems(rawData, traktClientId, 1);
            return {
                id: link,
                type: "url",
                title: "Trakt 列表详情",
                link: link,
                childItems: items,
                relatedItems: items
            };
        } catch (e) {
            return null;
        }
    }
    return null;
}
