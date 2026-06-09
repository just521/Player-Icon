/**
 * 玛卡巴卡云端剧场 Forward Widget
 * 聚合豆瓣榜单、精选剧场、热门番剧与芒果TV推荐 (极速本地全局排序版)
 */

WidgetMetadata = {
  id: "makkapakka_hub_list_2.0",
  title: "豆瓣剧集与番剧",
  description: "豆瓣地区热门剧集与番剧",
  author: "Forward",
  site: "",
  version: "1.1.0",
  requiredVersion: "0.0.1",

  modules: [
    {
      title: "热门剧集",
      description: "豆瓣实时热门影剧综",
      functionName: "loadDouban",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "channel",
          title: "榜单分类",
          type: "enumeration",
          value: "tv_domestic",
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
          type: "input",
          value: "updated",
          placeholders: [
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
    {
      title: "热门番剧",
      description: "Bangumi 实时热榜",
      functionName: "loadBangumi",
      type: "video",
      cacheDuration: 43200,
      params: [
        {
          name: "genre",
          title: "番剧类型",
          type: "enumeration",
          value: "",
          enumOptions: [
            { title: "全部", value: "" },
            { title: "动作", value: "28" },
            { title: "冒险", value: "12" },
            { title: "动画", value: "16" },
            { title: "喜剧", value: "35" },
            { title: "奇幻", value: "14" },
            { title: "剧情", value: "18" },
            { title: "科幻", value: "878" },
            { title: "悬疑", value: "9648" }
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
    }
  ]
};

// ============================================
// Handler Functions
// ============================================

const Utils = {
  emptyTips: [{ id: "empty", type: "text", title: "⚠️ 加载失败", description: "请检查网络连接" }],

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

  // 完全纯本地的同步排序逻辑，速度极快
  sortList(list, sortType) {
    if (!list || !Array.isArray(list) || list.length === 0) return list || [];
    if (!sortType || sortType === "default") return list;

    // 复制数组以防污染原数据
    return [...list].sort((a, b) => {
      switch (sortType) {
        case "updated":
          // 优先取爬虫抓好的 lastUpdateDate，如果没有则回退到 releaseDate (首播)
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
 * 模块 1：加载豆瓣榜单
 */
async function loadDouban(params = {}) {
  const data = await Utils.fetch("douban-hot.json");
  if (data === Utils.emptyTips) return data;

  let list = data?.[params.channel] || [];
  list = Utils.sortList(list, params.sort_type); // 直接同步调用，不再 await
  return Utils.paginate(list, params.page);
}

/**
 * 模块 3：加载热门番剧 (Bangumi)
 */
async function loadBangumi(params = {}) {
  const data = await Utils.fetch("bangumi-hot.json");
  if (data === Utils.emptyTips) return data;

  let list = data?.hot_anime || data?.items || [];

  if (params.genre && params.genre !== "") {
    const genreId = parseInt(params.genre);
    list = list.filter(item => item.rawGenres && item.rawGenres.includes(genreId));
  }

  list = Utils.sortList(list, params.sort_type); // 同步调用
  return Utils.paginate(list, params.page);
}