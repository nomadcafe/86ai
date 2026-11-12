// Cloudflare Pages Function: GET /api/rankings
// 读取 OpenRouter 排名页里给读屏 / 爬虫准备的文本表格（data-ssr-content="rankings-summary"），
// 返回全球大模型 Token 用量榜（近 30 天）和各公司请求份额，并标出中国模型。
// 结果用 Cloudflare Cache API 缓存 6 小时，过期后下一次访问重新抓取，所以榜单会“偶尔自动更新”。

const SOURCE_URL = 'https://openrouter.ai/rankings';
const TOP_N = 10;

// 中国模型厂商（OpenRouter 的作者 slug 或显示名，统一去掉符号后小写比较）
const CN_AUTHORS = new Set([
  'deepseek', 'zai', 'zhipu', 'zhipuai', 'thudm', 'qwen', 'alibaba', 'moonshotai', 'moonshot',
  'minimax', 'tencent', 'baidu', 'bytedance', 'bytedanceseed', 'stepfun', 'xiaomi', 'meituan',
  '01ai', 'baichuan', 'inclusionai', 'antgroup', 'kuaishou', 'kwaipilot', 'iflytek',
]);
const LABELS = {
  deepseek: 'DeepSeek', zai: 'Z.ai', qwen: 'Qwen', moonshotai: 'Moonshot', minimax: 'MiniMax',
  tencent: 'Tencent', baidu: 'Baidu', bytedance: 'ByteDance', bytedanceseed: 'ByteDance', stepfun: 'StepFun',
  xiaomi: 'Xiaomi', meituan: 'Meituan', openai: 'OpenAI', anthropic: 'Anthropic', google: 'Google',
  xai: 'xAI', mistralai: 'Mistral', metallama: 'Meta', meta: 'Meta', inclusionai: 'Ant Group',
};

const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const isCN = author => CN_AUTHORS.has(norm(author));

function decode(s) {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

// 找到某个标题后面的第一张表，返回 tbody 里每行的单元格文本
function table(html, heading) {
  const i = html.indexOf(heading);
  if (i < 0) return [];
  const rest = html.slice(i);
  const end = rest.indexOf('</table>');
  const body = rest.slice(rest.indexOf('<tbody'), end < 0 ? undefined : end);
  return (body.match(/<tr[\s>][\s\S]*?<\/tr>/g) || []).map(row =>
    (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/g) || []).map(decode));
}

function tokensNum(s) {
  const m = /^([\d.]+)\s*([KMBT]?)/i.exec(s || '');
  if (!m) return 0;
  return parseFloat(m[1]) * ({ '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 })[m[2].toUpperCase()];
}

const CACHE_TTL = 6 * 3600;   // 边缘缓存 6 小时
const BROWSER_TTL = 600;      // 浏览器缓存 10 分钟
const COMMON = {
  'Content-Type': 'application/json; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
  'X-Content-Type-Options': 'nosniff',
};

async function build() {
  const r = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 86ai-rankings/1.0)', Accept: 'text/html' },
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error('openrouter ' + r.status);
  const html = await r.text();

  const models = table(html, 'Top models this month, as text')
    .filter(c => c.length >= 5 && /^\d+$/.test(c[0]))
    .slice(0, TOP_N)
    .map(([rank, name, author, tokens, change]) => ({
      rank: +rank, name: name.slice(0, 60), tokens: tokens.slice(0, 10), change: change.slice(0, 8),
      tokensNum: tokensNum(tokens),
      author: LABELS[norm(author)] || author,
      cn: isCN(author),
    }));
  if (models.length < 5) throw new Error('rankings table not found');

  const shareRows = table(html, 'Market share by model author, as text')
    .filter(c => c.length >= 3 && /%/.test(c[2]));
  const cnShare = shareRows
    .filter(c => /^\d+$/.test(c[0]) && isCN(c[1]))
    .reduce((sum, c) => sum + parseFloat(c[2]), 0);

  return {
    updated: Date.now(),
    source: 'OpenRouter',
    sourceUrl: SOURCE_URL,
    period: '30D',
    models,
    cnCount: models.filter(m => m.cn).length,
    cnShare: shareRows.length ? Math.round(cnShare * 10) / 10 : null,
  };
}

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL('/api/rankings', request.url).toString());

  const hit = await cache.match(key);
  if (hit) {
    return new Response(hit.body, {
      headers: { ...COMMON, 'Cache-Control': `public, max-age=${BROWSER_TTL}`, 'X-Cache': 'HIT' },
    });
  }

  try {
    const body = JSON.stringify(await build());
    waitUntil(cache.put(key, new Response(body, {
      headers: { ...COMMON, 'Cache-Control': `public, max-age=${CACHE_TTL}` },
    })));
    return new Response(body, {
      headers: { ...COMMON, 'Cache-Control': `public, max-age=${BROWSER_TTL}`, 'X-Cache': 'MISS' },
    });
  } catch (e) {
    console.error('rankings failed:', e);   // 细节只记在 Cloudflare 日志里，不返回给访客
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 502, headers: { ...COMMON, 'Cache-Control': 'no-store' },
    });
  }
}
