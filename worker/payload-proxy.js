/* Cloudflare Worker：Payload 远程提取用的 Range 透传代理
 *
 * Token 规则（公开仓库弱鉴权）：
 * - 取 UTC 时间精确到小时，格式为 YYYYMMDDHH，再整体反序作为 token。
 * - 例如 UTC 2026-10-15 10 时 -> "2026101510" -> token "0151016202"。
 * - 同时接受当前小时和上一个小时，避免整点交界时请求失败。
 * - 注意：算法公开后任何人都能算出当前 token，只能防旧 token 复用，
 *   不能当作真正的访问控制。如需防刷请配合 Cloudflare 限流/WAF 或私有后端。
 *
 * 部署步骤（免费账号即可）：
 * 1. 注册登录 dash.cloudflare.com → 左侧 Workers & Pages → Create → Create Worker
 * 2. 直接粘贴本文件并 Deploy；不需要再设置静态 TOKEN
 * 3. 记下 Worker 地址 https://xxx.workers.dev，填到网页 Payload 页的「代理设置」里
 *    （Token 留空即可自动按 UTC 小时生成）
 *
 * 调用方式：
 *   GET https://xxx.workers.dev/?url=<OTA直链>&token=<UTC小时反序>   (可带 Range 头)
 * 注意：仅透传 GET / HEAD，且只允许 https。
 */

function plPad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function plUtcHourStamp(d) {
  return d.getUTCFullYear().toString() +
    plPad2(d.getUTCMonth() + 1) +
    plPad2(d.getUTCDate()) +
    plPad2(d.getUTCHours());
}

function plHourToken(d) {
  return plUtcHourStamp(d).split('').reverse().join('');
}

function plValidTokens(now) {
  const tokens = [plHourToken(now), plHourToken(new Date(now.getTime() - 3600000))];
  return tokens.filter((t, i) => tokens.indexOf(t) === i);
}

function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Max-Age': '86400'
  }, extra || {});
}

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(req) {
  const u = new URL(req.url);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  const token = u.searchParams.get('token') || '';
  if (plValidTokens(new Date()).indexOf(token) === -1) {
    return new Response('forbidden', { status: 403, headers: corsHeaders() });
  }
  const target = u.searchParams.get('url') || '';
  if (!/^https:\/\//.test(target)) {
    return new Response('bad url', { status: 400, headers: corsHeaders() });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405, headers: corsHeaders() });
  }
  const h = new Headers();
  const rg = req.headers.get('range');
  if (rg) h.set('Range', rg);
  const ua = req.headers.get('user-agent');
  if (ua) h.set('User-Agent', ua);
  let up;
  try {
    up = await fetch(target, { method: req.method, headers: h, redirect: 'follow' });
  } catch (e) {
    return new Response('upstream error', { status: 502, headers: corsHeaders() });
  }
  const out = new Headers(up.headers);
  out.set('Access-Control-Allow-Origin', '*');
  out.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  return new Response(up.body, { status: up.status, headers: out });
}
