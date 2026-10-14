/* Cloudflare Worker：Payload 远程提取用的 Range 透传代理
 *
 * 部署步骤（免费账号即可）：
 * 1. 注册登录 dash.cloudflare.com → 左侧 Workers & Pages → Create → Create Worker
 * 2. 把下面 TOKEN 换成你自己的随机字符串，点 Deploy
 * 3. 记下 Worker 地址 https://xxx.workers.dev，填到网页 Payload 页的「代理设置」里
 *    （Token 填同一个字符串）
 *
 * 调用方式：
 *   GET https://xxx.workers.dev/?url=<OTA直链>&token=<TOKEN>   (可带 Range 头)
 * 注意：仅透传 GET / HEAD，且只允许 https。上线后建议定期更换 TOKEN。
 */

const TOKEN = '在这里换成你自己的随机字符串';

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
  if (u.searchParams.get('token') !== TOKEN) {
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
