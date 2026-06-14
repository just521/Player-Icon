WidgetMetadata = {
  id: "forward.db_mt",
  title: "豆瓣最近热门剧集",
  description: "豆瓣最近热门剧集与综艺探索",
  author: "Forward",
  version: "1.2.0",
  requiredVersion: "0.0.1",
  site: "https://github.com/InchStudio/ForwardWidgets",

  modules: [
    {
      title: "最近热门剧集",
      description: "豆瓣最近热门剧集、综艺、动画与纪录片",
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

async function loadDoubanExplore(params = {}) {
  const page = parseInt(params.page) || 1;
  const limit = 24;
  const start = (page - 1) * limit;
  const typeValue = params.channel || "tv";

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
    const list = data.items || [];
    if (list.length === 0) return page === 1 ? [{ id: "empty", type: "text", title: "⚠️ 暂无数据" }] : [];

    return list.map(item => {
      const rating = item.rating ? item.rating.value : 0;
      return {
        id: String(item.id),
        type: "douban",
        mediaType: "tv",
        title: item.title,
        posterPath: item.pic ? (item.pic.large || item.pic.normal) : "",
        rating: rating,
        description: item.card_subtitle || `评分: ${rating || "暂无"}`
      };
    });
  } catch (error) {
    console.error("[loadDoubanExplore] 失败:", error.message || error);
    return [{ id: "empty", type: "text", title: "⚠️ 豆瓣请求失败", description: "可能触发了频率限制，请稍后重试或切换网络。" }];
  }
}
