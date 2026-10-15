/* Cloudflare Worker：Payload 远程提取用的 Range 透传代理（Modules 格式）
 *
 * Token 直接写死在下面的 TOKEN 常量里（当前 1999）：
 * 1. 把本文件粘贴到 Worker 代码区，Save and deploy
 * 2. 以后改 Token：改这个文件里的值，Cloudflare 和 GitHub 两边一起改
 *    - Cloudflare：改完点部署
 *    - GitHub：仓库 Secrets 里改 PAYLOAD_PROXY_TOKEN，下次构建自动生效
 *
 * 页面上不展示任何 Token 输入框。
 *
 * 调用方式：
 *   GET https://xxx.workers.dev/?url=<OTA直链>&token=<TOKEN>   (可带 Range 头)
 * 注意：仅透传 GET / HEAD，且只允许 https。
 */

function corsHeaders(extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Max-Age': '86400'
  }, extra || {});
}

const TOKEN = '1999';

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    const u = new URL(req.url);
    const token = u.searchParams.get('token') || '';
    if (token !== TOKEN) {
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
};
