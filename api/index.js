// api/index.js
// CommonJS 形式（package.json不要）

const FREE_ALLOW = ["ema","rsi","atr","donchian","adx","breakout","trend","ema200","rr2"];

// ===== Ping (確認用) =====
function handlePing(req, res) {
  res.status(200).json({ ok: true, route: "/api/ping", time: new Date().toISOString() });
}

// ===== Freeプラン制限 =====
function isFreeOK(text) {
  const t = (text || "").toLowerCase();
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  return words.every(w => FREE_ALLOW.includes(w));
}

// ===== フォールバックEA（AIキーなしでも必ずコンパイル可） =====
function fallbackEA(comment) {
  return `//+------------------------------------------------------------------+
//|   Auto-generated EA (MQL5)                                       |
//|   Note: ${comment}                                               |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
CTrade trade;

int OnInit(){ return(INIT_SUCCEEDED); }
void OnTick(){
  if(Bars<300) return;
  static datetime last;
  datetime nowBar = iTime(_Symbol,_Period,0);
  if(last==nowBar) return;
  last = nowBar;

  double ema = iMA(_Symbol,_Period,200,0,MODE_EMA,PRICE_CLOSE,0);
  double price = Close[0];
  if(PositionSelect(_Symbol)) return;

  double sl = 200*_Point;
  double tp = 400*_Point;
  double lot = 0.1;

  if(price > ema){
    trade.Buy(lot,NULL,price,price-sl,price+tp);
  }else if(price < ema){
    trade.Sell(lot,NULL,price,price+sl,price-tp);
  }
}`;
}

// ===== OpenAI呼び出し（APIキー未設定ならfallback） =====
async function generateEA(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallbackEA("OPENAI_API_KEY 未設定");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "あなたは熟練のMQL5エンジニア。常に #property strict と CTrade を使い、コンパイル可能なEAの全文だけを出力する。" },
          { role: "user", content: `仕様: ${prompt}\n必須: OnInit/OnTick, SL/TP, ロット計算。日本語コメント。` }
        ]
      })
    });
    const j = await r.json();
    const code = j?.choices?.[0]?.message?.content?.trim();
    if (!code || !code.includes("#property strict")) return fallbackEA("AI応答が不完全");
    return code;
  } catch (e) {
    return fallbackEA("AIエラー: " + e.message);
  }
}

// ===== /api/generate =====
async function handleGenerate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  const body = await readJson(req);
  const email = (body.email || "").trim();
  const prompt = (body.prompt || "").trim();

  // Free制限
  if (!email || (!prompt && prompt !== "")) {
    return res.status(400).json({ ok: false, error: "email と prompt を送ってください" });
  }
  if (!isFreeOK(prompt)) {
    return res.status(402).json({
      ok: false,
      error: "Free版では一部キーワードのみ使用可（EMA/RSI/ATR/Donchian/ADX 等）。"
    });
  }

  const code = await generateEA(prompt);
  return res.status(200).json({ ok: true, code });
}

// ===== JSONパーサ =====
function readJson(req) {
  return new Promise((resolve) => {
    let d = ""; req.setEncoding("utf8");
    req.on("data", c => d += c);
    req.on("end", () => resolve(JSON.parse(d || "{}")));
  });
}

// ===== ルータ =====
module.exports = async (req, res) => {
  if (req.url.endsWith("/ping")) return handlePing(req, res);
  if (req.url.endsWith("/generate")) return handleGenerate(req, res);
  res.status(404).json({ ok: false, error: "Not Found" });
};
