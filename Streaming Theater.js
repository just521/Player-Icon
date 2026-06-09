WidgetMetadata = {
  id: "forward.stream_provider",
  title: "流媒体与剧场",
  version: "1.0.0",
  requiredVersion: "0.0.1",
  description: "基于TMDB发现全球主流流媒体平台及国内热门剧场品牌的电视剧",
  author: "Antigravity",
  site: "https://github.com/InchStudio/ForwardWidgets",
  modules: [
    {
      id: "discover",
      title: "发现剧集",
      functionName: "loadList",
      cacheDuration: 3600,
      params: [
        {
          name: "provider",
          title: "平台 / 剧场",
          type: "enumeration",
          value: "netflix",
          enumOptions: [
            { title: "Netflix", value: "netflix" },
            { title: "Disney+", value: "disney" },
            { title: "HBO", value: "hbo" },
            { title: "Apple TV+", value: "apple-tv" },
            { title: "腾讯视频", value: "tencent" },
            { title: "爱奇艺", value: "iqiyi" },
            { title: "优酷", value: "youku" },
            { title: "芒果TV", value: "mgtv" },
            { title: "哔哩哔哩", value: "bilibili" },
            { title: "迷雾剧场", value: "light-on" },
            { title: "白夜剧场", value: "white-night" },
            { title: "X剧场", value: "x-theater" },
            { title: "正午阳光", value: "daylight-entertainment" }
          ]
        },
        {
          name: "sort_by",
          title: "排序方式",
          type: "input",
          value: "first_air_date.desc",
          placeholders: [
            { title: "📅 首播时间降序", value: "first_air_date.desc" },
            { title: "📅 首播时间升序", value: "first_air_date.asc" },
            { title: "🔥 流行热度降序", value: "popularity.desc" },
            { title: "⭐ 用户评分降序", value: "vote_average.desc" }
          ]
        },
        {
          name: "page",
          title: "页码",
          type: "page"
        }
      ]
    }
  ],
  search: {
    title: "搜索剧集",
    functionName: "search",
    params: [
      { name: "keyword", title: "关键词", type: "input" },
      { name: "page", title: "页码", type: "page" }
    ]
  }
};

async function loadList(params = {}) {
  try {
    const page = Number(params.page || 1);
    const provider = params.provider || "netflix";
    const sortBy = params.sort_by || "first_air_date.desc";
    const language = params.language || "zh-CN";

    if (provider === "light-on" || provider === "white-night" || provider === "x-theater") {
      let query = "";
      if (provider === "light-on") query = "迷雾剧场";
      else if (provider === "white-night") query = "白夜剧场";
      else if (provider === "x-theater") query = "X剧场";

      const res = await Widget.tmdb.get("search/tv", {
        params: { query, page, language }
      });
      if (!res || !res.results) return [];

      let results = res.results;
      if (sortBy === "first_air_date.desc") {
        results.sort((a, b) => new Date(b.first_air_date || 0) - new Date(a.first_air_date || 0));
      } else if (sortBy === "first_air_date.asc") {
        results.sort((a, b) => new Date(a.first_air_date || 0) - new Date(b.first_air_date || 0));
      } else if (sortBy === "popularity.desc") {
        results.sort((a, b) => b.popularity - a.popularity);
      } else if (sortBy === "vote_average.desc") {
        results.sort((a, b) => b.vote_average - a.vote_average);
      }

      return results.map((m) => ({
        id: m.id,
        type: "tmdb",
        mediaType: "tv",
        title: m.name || m.original_name,
        posterPath: m.poster_path,
        backdropPath: m.backdrop_path,
        rating: m.vote_average,
        releaseDate: m.first_air_date,
        description: m.overview,
      }));
    }

    const discoverParams = {
      page,
      sort_by: sortBy,
      language,
    };

    if (provider === "netflix") {
      discoverParams.with_networks = 213;
    } else if (provider === "disney") {
      discoverParams.with_networks = 2739;
    } else if (provider === "hbo") {
      discoverParams.with_networks = 49;
    } else if (provider === "apple-tv") {
      discoverParams.with_networks = 2552;
    } else if (provider === "tencent") {
      discoverParams.with_networks = 2007;
    } else if (provider === "iqiyi") {
      discoverParams.with_networks = 1330;
    } else if (provider === "youku") {
      discoverParams.with_networks = 1419;
    } else if (provider === "mgtv") {
      discoverParams.with_networks = 1631;
    } else if (provider === "bilibili") {
      discoverParams.with_networks = 1605;
    } else if (provider === "daylight-entertainment") {
      discoverParams.with_companies = 148869;
    }

    const res = await Widget.tmdb.get("discover/tv", { params: discoverParams });
    if (!res || !res.results) return [];

    return res.results.map((m) => ({
      id: m.id,
      type: "tmdb",
      mediaType: "tv",
      title: m.name || m.original_name,
      posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      rating: m.vote_average,
      releaseDate: m.first_air_date,
      description: m.overview,
    }));
  } catch (error) {
    console.error("[loadList] 失败:", error.message || error);
    throw error;
  }
}

async function search(params = {}) {
  try {
    const page = Number(params.page || 1);
    const query = params.keyword || "";
    if (!query) return [];
    const res = await Widget.tmdb.get("search/tv", { params: { query, page, language: "zh-CN" } });
    if (!res || !res.results) return [];
    return res.results.map((m) => ({
      id: m.id,
      type: "tmdb",
      mediaType: "tv",
      title: m.name || m.original_name,
      posterPath: m.poster_path,
      backdropPath: m.backdrop_path,
      rating: m.vote_average,
      releaseDate: m.first_air_date,
      description: m.overview,
    }));
  } catch (error) {
    console.error("[search] 失败:", error.message || error);
    throw error;
  }
}
