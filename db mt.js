WidgetMetadata = {
  id: "forward.db_mt",
  title: "豆瓣实时探索",
  description: "豆瓣实时电影与电视剧探索",
  author: "Forward",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  site: "https://github.com/InchStudio/ForwardWidgets",

  modules: [
    {
      title: "豆瓣实时探索",
      description: "豆瓣实时电影与电视剧探索（直连接口）",
      functionName: "loadDoubanExplore",
      type: "video",
      cacheDuration: 3600,
      params: [
        {
          name: "media_type",
          title: "影视类型",
          type: "enumeration",
          value: "movie",
          enumOptions: [
            { title: "🎬 电影", value: "movie" },
            { title: "📺 电视剧/综艺", value: "tv" }
          ]
        },
        {
          name: "movie_tag",
          title: "电影板块",
          type: "enumeration",
          value: "电影",
          belongTo: { paramName: "media_type", value: ["movie"] },
          enumOptions: [
            { title: "全部", value: "电影" },
            { title: "华语电影", value: "电影,华语" },
            { title: "欧美电影", value: "电影,欧美" },
            { title: "韩国电影", value: "电影,韩国" },
            { title: "日本电影", value: "电影,日本" }
          ]
        },
        {
          name: "tv_tag",
          title: "电视剧板块",
          type: "enumeration",
          value: "电视剧",
          belongTo: { paramName: "media_type", value: ["tv"] },
          enumOptions: [
            { title: "全部剧集", value: "电视剧" },
            { title: "国产剧", value: "电视剧,华语" },
            { title: "美剧", value: "电视剧,美剧" },
            { title: "日剧", value: "电视剧,日本" },
            { title: "韩剧", value: "电视剧,韩国" },
            { title: "港剧", value: "电视剧,港剧" },
            { title: "台剧", value: "电视剧,台湾" },
            { title: "英剧", value: "电视剧,英国" },
            { title: "动画", value: "动画" },
            { title: "纪录片", value: "纪录片" }
          ]
        },
        {
          name: "sort_type",
          title: "排序方式",
          type: "enumeration",
          value: "T",
          enumOptions: [
            { title: "🔥 热门推荐", value: "T" },
            { title: "📅 最新上映", value: "R" },
            { title: "⭐ 高分优先", value: "S" }
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

async function loadDoubanExplore(params = {}) {
  const page = parseInt(params.page) || 1;
  const limit = 24;
  const start = (page - 1) * limit;
  const mediaType = params.media_type || "movie";
  const tags = mediaType === "movie" ? (params.movie_tag || "电影") : (params.tv_tag || "电视剧");
  const sort = params.sort_type || "T";

  const randomBid = Math.random().toString(36).substring(2, 13);
  const url = `https://movie.douban.com/j/new_search_subjects?sort=${sort}&range=0,10&tags=${encodeURIComponent(tags)}&start=${start}&limit=${limit}`;

  try {
    const res = await Widget.http.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)",
        "Referer": "https://movie.douban.com/explore",
        "Host": "movie.douban.com",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": `bid=${randomBid};`
      }
    });

    const data = typeof res.data === "string" ? JSON.parse(res.data) : (res.data || {});
    const list = data.data || [];
    if (list.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "⚠️ 暂无数据" }] : [];

    return list.map(item => {
      const directorsText = item.directors && item.directors.length > 0 ? `导演: ${item.directors.join(", ")}` : "";
      const castsText = item.casts && item.casts.length > 0 ? `主演: ${item.casts.join(", ")}` : "";
      const ratingText = `评分: ${item.rate || "暂无"}`;
      const desc = [directorsText, castsText, ratingText].filter(Boolean).join("\n");

      return {
        id: String(item.id),
        type: "douban",
        mediaType: mediaType,
        title: item.title,
        posterPath: item.cover,
        rating: parseFloat(item.rate) || 0,
        description: desc
      };
    });
  } catch (error) {
    console.error("[loadDoubanExplore] 失败:", error.message || error);
    return [{ id: "empty", type: "text", title: "⚠️ 豆瓣请求失败", description: "可能触发了频率限制，请稍后重试或切换网络。" }];
  }
}
