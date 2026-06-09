WidgetMetadata = {
    id: "forward.rotten_tomatoes",
    title: "番茄最受欢迎的电影与剧集",
    description: "rottentomatoes.com",
    author: "Forward",
    version: "1.0.0",
    requiredVersion: "0.0.1",
    site: "",
    modules: [
        {
            title: "烂番茄最受欢迎的电影与剧集",
            functionName: "loadRottenTomatoesTrends",
            type: "video",
            cacheDuration: 3600,
            params: [
                {
                    name: "rt_sort",
                    title: "",
                    type: "enumeration",
                    value: "rt_movies_home",
                    enumOptions: [
                        { title: "最受欢迎的流媒体电影", value: "rt_movies_home" },
                        { title: "最受欢迎的流媒体剧集", value: "rt_tv_popular" }
                    ]
                },
                { name: "page", title: "页码", type: "page", startPage: 1 }
            ]
        }
    ]
};

// =========================================================================
// 1. 核心逻辑函数
// =========================================================================

async function loadRottenTomatoesTrends(params = {}) {
    const page = parseInt(params.page) || 1;
    const rtSort = params.rt_sort || "rt_movies_home";
    const pageSize = 15;

    const allItems = await fetchRottenTomatoesList(rtSort);
    if (allItems.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "无数据" }] : [];

    const start = (page - 1) * pageSize;
    const pageItems = allItems.slice(start, start + pageSize);
    const promises = pageItems.map((item, i) => searchRtTmdb(item, start + i + 1));
    return (await Promise.all(promises)).filter(Boolean);
}

async function fetchRottenTomatoesList(type) {
    const RT_URLS = {
        "rt_movies_home": "https://www.rottentomatoes.com/browse/movies_at_home/sort:popular?minTomato=75",
        "rt_tv_popular": "https://www.rottentomatoes.com/browse/tv_series_browse/sort:popular?minTomato=75"
    };
    const url = RT_URLS[type] || RT_URLS["rt_movies_home"];

    try {
        const res = await Widget.http.get(url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" }
        });
        const html = typeof res === 'string' ? res : (res.data || "");
        const $ = Widget.html.load(html);
        const items = [];

        // 🚀 同步：逆向DOM树遍历解析
        const titleNodes = $('[data-qa="discovery-media-list-item-title"], [data-qa="list-item-title"], .js-tile-link .p--small');

        if (titleNodes.length > 0) {
            titleNodes.each((i, el) => {
                const title = $(el).text().trim();
                if (!title) return;

                // 像爬树一样往上找：匹配最稳定的卡片容器
                let container = $(el).parent();
                for (let level = 0; level < 5; level++) {
                    if (container.find('score-board, score-pairs, score-pairs-deprecated').length > 0) break;
                    if (container.length === 0) break;
                    container = container.parent();
                }

                let tomatoScore = "";
                let popcornScore = "";

                // 兼容最新版 <score-board> 和老版标签
                const scoreTags = ['score-board', 'score-pairs', 'score-pairs-deprecated'];
                for (const tag of scoreTags) {
                    const scoreEl = container.find(tag);
                    if (scoreEl.length > 0) {
                        tomatoScore = scoreEl.attr('tomatometerscore') || scoreEl.attr('critics-score') || scoreEl.attr('criticsscore') || "";
                        popcornScore = scoreEl.attr('audiencescore') || scoreEl.attr('audience-score') || "";
                        break;
                    }
                }

                items.push({
                    title: title,
                    tomatoScore: tomatoScore,
                    popcornScore: popcornScore,
                    mediaType: type.includes("tv") ? "tv" : "movie"
                });
            });
        }

        // 去重防御
        const uniqueItems = [];
        const seen = new Set();
        for (const item of items) {
            const cleanTitle = item.title.replace(/\s+/g, ' ').trim();
            if (cleanTitle && !seen.has(cleanTitle)) {
                seen.add(cleanTitle);
                item.title = cleanTitle;
                uniqueItems.push(item);
            }
        }
        return uniqueItems;
    } catch (e) { return []; }
}

async function searchRtTmdb(rtItem, rank) {
    const cleanTitle = rtItem.title.replace(/\s\(\d{4}\)$/, "");
    try {
        const res = await Widget.tmdb.get(`/search/${rtItem.mediaType}`, { params: { query: cleanTitle, language: "zh-CN" } });
        const match = (res.results || [])[0];
        if (!match) return null;
        let scores = [];
        if (rtItem.tomatoScore) scores.push(`🍅 ${rtItem.tomatoScore}%`);
        if (rtItem.popcornScore) scores.push(`🍿 ${rtItem.popcornScore}%`);
        const customSub = scores.join("  ") || "烂番茄认证";
        const dateStr = match.first_air_date || match.release_date || "";

        return {
            id: String(match.id),
            tmdbId: match.id,
            type: "tmdb",
            mediaType: rtItem.mediaType,
            title: `${rank}. ${match.name || match.title}`,
            genreTitle: rtItem.mediaType === "movie" ? "电影" : "剧集",
            description: `${dateStr}\n原名: ${rtItem.title}`,
            releaseDate: dateStr,
            subTitle: customSub,
            posterPath: match.poster_path ? `https://image.tmdb.org/t/p/w500${match.poster_path}` : "",
            backdropPath: match.backdrop_path ? `https://image.tmdb.org/t/p/w780${match.backdrop_path}` : ""
        };
    } catch (e) { return null; }
}
