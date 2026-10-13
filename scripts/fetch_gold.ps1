$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$outFile = Join-Path $repoRoot 'data/gold.json'

function Fetch-Text([string]$url) {
  $r = Invoke-WebRequest -Uri ('https://r.jina.ai/' + $url) -TimeoutSec 45 -UseBasicParsing -ErrorAction Stop
  return $r.Content
}

function Get-Tag([string]$xml, [string]$name) {
  if ($xml -match ('<{0}>([\s\S]*?)</{0}>' -f $name)) { return $matches[1].Trim() }
  return '--'
}

$targets = @(
  'https://creditcard1.ccb.com/cn/home/news/gjsycj01.xml',
  'https://creditcard3.ccb.com/cn/home/news/gjshjjc01.xml',
  'https://creditcard3.ccb.com/cn/home/news/gjsdlj01.xml'
)

$contents = @()
foreach ($u in $targets) {
  $got = $null
  for ($try = 1; $try -le 3 -and -not $got; $try++) {
    try { $got = Fetch-Text $u } catch { Start-Sleep -Seconds 4 }
  }
  if (-not $got) { throw "Failed to fetch $u" }
  $contents += $got
}

$c1 = $contents[0]
$c2 = $contents[1]
$c3 = $contents[2]

$blocks = [regex]::Matches($c3, '<ReferencePriceSettlement[\s\S]*?</ReferencePriceSettlement>')
$auBlock = $blocks | Where-Object { $_.Value -match '<GldExg_AR_ECD>Au99\.99</GldExg_AR_ECD>' } | Select-Object -First 1
$auXml = if ($auBlock) { $auBlock.Value } else { '' }

$tms = Get-Tag $c2 'Tms'
$time = if ($tms -match '^\d{4}-\d{2}-\d{2} (\d{2}:\d{2}:\d{2})') { $matches[1] } else { $tms }

$rsDrp = 0.0
[void][double]::TryParse((Get-Tag $auXml 'RsDrp_Val'), [ref]$rsDrp)

$data = [ordered]@{
  updatedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
  ccb       = [ordered]@{
    jhjSell = (Get-Tag $c1 'Br_Sell_Prc')
    jhjBuy  = (Get-Tag $c1 'Br_Bybk_Prc')
    icjBuy  = (Get-Tag $c2 'Cst_Buy_Prc')
    icjSell = (Get-Tag $c2 'Cst_Sell_Prc')
    time    = $time
    au      = [ordered]@{
      latest  = (Get-Tag $auXml 'Ltst_Prc')
      open    = (Get-Tag $auXml 'OpnQtn_Prc')
      high    = (Get-Tag $auXml 'Hgst_Prc')
      low     = (Get-Tag $auXml 'Lwst_Prc')
      buy1    = (Get-Tag $auXml 'GldExg_Fst_Buy_Prc')
      buy1n   = (Get-Tag $auXml 'GldExg_Fst_Buy_Num')
      sell1   = (Get-Tag $auXml 'GldExg_Fst_Sell_Prc')
      sell1n  = (Get-Tag $auXml 'GldExg_Fst_Sell_Num')
      amount  = (Get-Tag $auXml 'MkDAm')
      riseVal = (Get-Tag $auXml 'RsFl_Val')
      risePct = ('{0:0.00}' -f ($rsDrp * 100))
    }
  }
}

if ($data.ccb.jhjSell -eq '--' -or $data.ccb.icjBuy -eq '--' -or $data.ccb.au.latest -eq '--') {
  throw 'Parsed data looks invalid (key fields missing); not writing file.'
}

New-Item -ItemType Directory -Path (Split-Path -Parent $outFile) -Force | Out-Null
$json = ($data | ConvertTo-Json -Depth 6)
[System.IO.File]::WriteAllText($outFile, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "gold.json updated, ccb time = $time"
