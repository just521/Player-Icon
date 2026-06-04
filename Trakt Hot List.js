/**
 * 
 * 自动获取并展示Trakt公开列表的内容 
 */

WidgetMetadata = {
    id: "trakt_user_widget",
    title: "Trakt 热门列表",
    description: "展示Trakt公开列表的内容",
    author: "love00",
    site: "https://app.trakt.tv/search?m=lists",
    version: "1.0.0",
    requiredVersion: "0.0.1",

    modules: [
        {
            title: "Trakt 列表内容",
            functionName: "loadTraktUserList",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "listSlug",
                    title: "默认IMDb Top/可自行填写其他",
                    type: "input",
                    value: "imdb-top-rated-movies"
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
    const listSlug = params.listSlug || "imdb-top-rated-movies";
    const page = params.page || 1;

    let traktClientId = params.traktClientId;
    const hex64Regex = /^[0-9a-fA-F]{64}$/;
    if (!traktClientId || !hex64Regex.test(String(traktClientId).trim())) {
        traktClientId = DEFAULT_TRAKT_ID;
    }
    try {
        Widget.storage.set("trakt_client_id", traktClientId);
    } catch (err) { }

    const errors = [];

    // 1. 全局搜索该列表，自动定位拥有者和 ID
    try {
        const searchResults = await fetchTraktUserApi(`search/list?query=${encodeURIComponent(listSlug)}`, traktClientId, 1);
        if (searchResults && searchResults.length > 0) {
            const match = searchResults[0].list;
            if (match && match.user && match.ids) {
                const owner = match.user.username;
                const listId = match.ids.trakt;
                console.log(`[Trakt Search] Found list "${match.name}" owned by "${owner}", fetching items...`);
                try {
                    const rawData = await fetchTraktUserApi(`users/${owner}/lists/${listId}/items`, traktClientId, page);
                    if (rawData && rawData.length > 0) {
                        return await parseTraktUserItems(rawData, traktClientId, page);
                    } else {
                        errors.push(`[数据] 列表为空或无返回项`);
                    }
                } catch (fetchErr) {
                    errors.push(`[拉取列表] ${fetchErr.message || fetchErr}`);
                }
            } else {
                errors.push(`[搜索解析] 结构不完整`);
            }
        } else {
            errors.push(`[搜索结果] 未找到名为 "${listSlug}" 的列表`);
        }
    } catch (err) {
        errors.push(`[全局搜索] ${err.message || err}`);
    }

    return [{
        id: "empty",
        type: "text",
        title: "⚠️ 列表加载失败",
        description: `错误排查日志:\n${errors.join("\n")}`
    }];
}

async function parseTraktUserItems(rawData, traktClientId, page) {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return [];

    const promises = rawData.map(async (item, index) => {
        const mediaType = (item.type === "show" || item.show) ? "tv" : "movie";
        const subject = item.show || item.movie || item.season || item.episode || item;

        if (!subject || !subject.ids || !subject.ids.tmdb) {
            return null;
        }

        try {
            const d = await Widget.tmdb.get(`/${mediaType}/${subject.ids.tmdb}`, { params: { language: "zh-CN" } });
            const ratingText = item.rating ? `⭐ ${item.rating}分` : "";
            const yearText = (d.first_air_date || d.release_date || "").substring(0, 4);
            const subTitle = [yearText, ratingText].filter(Boolean).join(" · ");
            return {
                id: Number(d.id),
                tmdbId: Number(d.id),
                type: "tmdb",
                mediaType: mediaType,
                title: d.name || d.title || subject.title,
                genreTitle: getGlobalGenreText(d.genres?.map(g => g.id)),
                releaseDate: d.first_air_date || d.release_date || "",
                subTitle: subTitle,
                description: `${d.first_air_date || d.release_date || ""}\n${d.overview || "暂无简介"}`,
                posterPath: d.poster_path || "",
                backdropPath: d.backdrop_path || ""
            };
        } catch (e) {
            return null;
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
        } catch (err) { }
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
