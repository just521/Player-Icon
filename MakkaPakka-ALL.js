// =========================================================================
// 1. 全局配置与纯净内存缓存 (必须置于顶部)
// =========================================================================



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
// 
// =========================================================================
var WidgetMetadata = {
    id: "super_ultime_media_hub_makka",
    title: "Forward",
    description: "豆瓣热榜 平台剧场 Trakd热门列表",
    author: "",
    version: "1.4.1", // 
    requiredVersion: "0.0.1",
    site: "",

    globalParams: [
        {
            name: "traktClientId",
            title: "Trakt Client ID",
            type: "input",
            description: "选填，不填则使用内置。Trakt 榜单专用。",
            value: ""
        }
    ],

    modules: [

        // ---------------- 豆瓣热榜 ----------------
        {
            title: "🟢 豆瓣热榜",
            description: "豆瓣实时热门影剧综",
            functionName: "loadDouban",
            type: "video",
            cacheDuration: 43200,
            params: [
                {
                    name: "channel",
                    title: "榜单分类",
                    type: "enumeration",
                    value: "tv",
                    enumOptions: [
                        { title: "全部剧集", value: "tv" },
                        { title: "大陆剧集", value: "tv_domestic" },
                        { title: "欧美剧集", value: "tv_american" },
                        { title: "日本剧集", value: "tv_japanese" },
                        { title: "韩国剧集", value: "tv_korean" },
                        { title: "动漫番剧", value: "tv_animation" },
                        { title: "纪录片", value: "tv_documentary" },
                        { title: "大陆综艺", value: "show_domestic" },
                        { title: "国外综艺", value: "show_foreign" }
                    ]
                },
                {
                    name: "sort_type",
                    title: "排序方式",
                    type: "enumeration",
                    value: "default",
                    enumOptions: [
                        { title: "默认原序", value: "default" },
                        { title: "最近更新", value: "updated" },
                        { title: "最近发布", value: "recent" },
                        { title: "热度最高", value: "heat" },
                        { title: "流行趋势", value: "trending" },
                        { title: "高分优先", value: "rating" }
                    ]
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page",
                    startPage: 1
                }
            ]
        },

        // ---------------- 平台剧场 ----------------
        {
            title: "🎭 平台剧场",
            description: "网络平台剧场榜单",
            functionName: "loadTheater",
            type: "video",
            cacheDuration: 43200,
            params: [
                {
                    name: "brand",
                    title: "剧场品牌",
                    type: "enumeration",
                    value: "迷雾剧场",
                    enumOptions: [
                        { title: "迷雾剧场", value: "迷雾剧场" },
                        { title: "白夜剧场", value: "白夜剧场" },
                        { title: "X 剧场", value: "X剧场" },
                        { title: "玛卡的片单", value: "玛卡巴卡的悬疑剧" },
                        { title: "横屏短剧", value: "横屏短剧" },
                        { title: "生花剧场", value: "生花剧场" },
                        { title: "大家剧场", value: "大家剧场" },
                        { title: "小逗剧场", value: "小逗剧场" },
                        { title: "十分剧场", value: "十分剧场" },
                        { title: "板凳单元", value: "板凳单元" },
                        { title: "萤火单元", value: "萤火单元" },
                        { title: "正午阳光", value: "正午阳光" },
                        { title: "恋恋剧场", value: "恋恋剧场" },
                        { title: "悬疑剧场", value: "悬疑剧场" },
                        { title: "微尘剧场", value: "微尘剧场" }
                    ]
                },
                {
                    name: "status",
                    title: "播出状态",
                    type: "enumeration",
                    value: "all",
                    enumOptions: [
                        { title: "全部", value: "all" },
                        { title: "已开播", value: "aired" },
                        { title: "即将推出", value: "upcoming" }
                    ]
                },
                {
                    name: "sort_type",
                    title: "排序方式",
                    type: "enumeration",
                    value: "default",
                    enumOptions: [
                        { title: "默认原序", value: "default" },
                        { title: "最近更新", value: "updated" },
                        { title: "最近发布", value: "recent" },
                        { title: "热度最高", value: "heat" },
                        { title: "流行趋势", value: "trending" },
                        { title: "高分优先", value: "rating" }
                    ]
                },
                {
                    name: "page",
                    title: "页码",
                    type: "page",
                    startPage: 1
                }
            ]
        },

        // ---------------- Trakt热门列表 ----------------
        {
            title: "🌍 Trakd热门列表",
            description: "展示 Trakd 公开列表的内容",
            functionName: "loadTraktUserList",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "listSlug",
                    title: "列表标识 (Slug)",
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

// =========================================================================
// 
// =========================================================================

const GithubDataUtils = {
    emptyTips: [{ id: "empty", type: "text", title: "⚠️ 加载失败", description: "请检查网络连线" }],

    async fetch(filename) {
        const url = `https://raw.githubusercontent.com/MakkaPakka518/List/refs/heads/main/data/${filename}`;
        try {
            const resp = await Widget.http.get(url, { decodable: true });
            if (!resp?.data) return this.emptyTips;
            return typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data;
        } catch (e) {
            console.error(`[Error] ${url}: ${e.message}`);
            return this.emptyTips;
        }
    },

    sortList(list, sortType) {
        if (!list || !Array.isArray(list) || list.length === 0) return list || [];
        if (!sortType || sortType === "default") return list;

        return [...list].sort((a, b) => {
            switch (sortType) {
                case "updated":
                    const updateA = a.lastUpdateDate ? new Date(a.lastUpdateDate).getTime() : (a.releaseDate ? new Date(a.releaseDate).getTime() : 0);
                    const updateB = b.lastUpdateDate ? new Date(b.lastUpdateDate).getTime() : (b.releaseDate ? new Date(b.releaseDate).getTime() : 0);
                    return updateB - updateA;
                case "recent":
                    const dateA = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
                    const dateB = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
                    return dateB - dateA;
                case "heat":
                    const heatA = parseFloat(a.voteCount || a.vote_count) || 0;
                    const heatB = parseFloat(b.voteCount || b.vote_count) || 0;
                    return heatB - heatA;
                case "trending":
                    const trendA = parseFloat(a.popularity) || 0;
                    const trendB = parseFloat(b.popularity) || 0;
                    return trendB - trendA;
                case "rating":
                    const rateA = parseFloat(a.rating) || 0;
                    const rateB = parseFloat(b.rating) || 0;
                    return rateB - rateA;
                default:
                    return 0;
            }
        });
    },

    paginate(list, pageNum, pageSize = 24) {
        if (!list || !Array.isArray(list)) return [];
        const p = parseInt(pageNum) || 1;
        const start = (p - 1) * pageSize;
        return list.slice(start, start + pageSize);
    }
};

/**
 * 模块：加载豆瓣榜单
 */
async function loadDouban(params = {}) {
    const data = await GithubDataUtils.fetch("douban-hot.json");
    if (data === GithubDataUtils.emptyTips) return data;

    let list = data?.[params.channel] || [];
    list = GithubDataUtils.sortList(list, params.sort_type);
    return GithubDataUtils.paginate(list, params.page);
}

/**
 * 模块：加载精选剧场
 */
async function loadTheater(params = {}) {
    const data = await GithubDataUtils.fetch("theater-data.json");
    if (data === GithubDataUtils.emptyTips) return data;

    const brand = params.brand || "迷雾剧场";
    const status = params.status || "all";

    const brandData = data[brand];
    if (!brandData) return [];

    let list = [];
    if (status === "aired") {
        list = brandData.aired || [];
    } else if (status === "upcoming") {
        list = brandData.upcoming || [];
    } else {
        list = [...(brandData.upcoming || []), ...(brandData.aired || [])];
    }

    list = GithubDataUtils.sortList(list, params.sort_type);
    return GithubDataUtils.paginate(list, params.page);
}

/**
 * 模块：Trakt 热门列表
 */
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

async function parseTraktUserItems(rawData, traktClientId, page) {
    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) return [];

    const promises = rawData.map(async (item) => {
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

    // 全局搜索该列表，自动定位拥有者 and ID
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

/**
 * 详情页路由
 */
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


