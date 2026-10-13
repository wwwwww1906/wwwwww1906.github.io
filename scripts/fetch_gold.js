const https = require('https');
const fs = require('fs');
const path = require('path');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout: ' + url)));
  });
}

function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>'));
  return m ? m[1].trim() : '--';
}

async function main() {
  const ts = Date.now();
  const [c1, c2, c3] = await Promise.all([
    fetchText('https://creditcard1.ccb.com/cn/home/news/gjsycj01.xml?t=' + ts),
    fetchText('https://creditcard3.ccb.com/cn/home/news/gjshjjc01.xml?t=' + ts),
    fetchText('https://creditcard3.ccb.com/cn/home/news/gjsdlj01.xml?t=' + ts)
  ]);

  const blocks = c3.match(/<ReferencePriceSettlement[\s\S]*?<\/ReferencePriceSettlement>/g) || [];
  const auBlock = blocks.find((b) => b.includes('<GldExg_AR_ECD>Au99.99</GldExg_AR_ECD>')) || '';

  const tms = tag(c2, 'Tms');
  const tmMatch = tms.match(/^\d{4}-\d{2}-\d{2} (\d{2}:\d{2}:\d{2})/);
  const riseDrp = parseFloat(tag(auBlock, 'RsDrp_Val'));

  const data = {
    updatedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    ccb: {
      jhjSell: tag(c1, 'Br_Sell_Prc'),
      jhjBuy: tag(c1, 'Br_Bybk_Prc'),
      icjBuy: tag(c2, 'Cst_Buy_Prc'),
      icjSell: tag(c2, 'Cst_Sell_Prc'),
      time: tmMatch ? tmMatch[1] : tms,
      au: {
        latest: tag(auBlock, 'Ltst_Prc'),
        open: tag(auBlock, 'OpnQtn_Prc'),
        high: tag(auBlock, 'Hgst_Prc'),
        low: tag(auBlock, 'Lwst_Prc'),
        buy1: tag(auBlock, 'GldExg_Fst_Buy_Prc'),
        buy1n: tag(auBlock, 'GldExg_Fst_Buy_Num'),
        sell1: tag(auBlock, 'GldExg_Fst_Sell_Prc'),
        sell1n: tag(auBlock, 'GldExg_Fst_Sell_Num'),
        amount: tag(auBlock, 'MkDAm'),
        riseVal: tag(auBlock, 'RsFl_Val'),
        risePct: isNaN(riseDrp) ? '--' : (riseDrp * 100).toFixed(2)
      }
    }
  };

  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'gold.json'), JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log('gold.json updated, ccb time = ' + data.ccb.time);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
