// pages/api/generate.js

const FREE_ALLOW = ["ema","rsi","atr","donchian","adx","breakout","trend","ema200","rr2"];

// --- Free制限：許可語のみか確認 ---
function isFreeOK(text) {
  const t = (text || "").toLowerCase();
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  return words.every(w => FREE_ALLOW.includes(w));
}

// --- フォールバックEA（AI未設定/失敗でも必ず返す）---
function fallbackEA(note) {
  return `//+------------------------------------------------------------------+
//|   Auto-generated EA (MQL5)                                       |
//|   Note: ${note}                                                   |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
CTrade trade;
int OnInit(){ return(INIT_SUCCEEDED); }
void OnTick(){
  if(Bars<300) return;
  static datetime last;
  datetime nowBar = iTime(_Symbol,_Period,0);
  if(last==nowBar) return; last=nowBar;
  double ema=iMA(_Symbol,_Period,200,0,MODE_EMA,PRICE_CLOSE,0);
  if(PositionSelect(_Symbol)) return;
  double price=Close[0], sl=200*_Point, tp=400*_Point; double lot=0.1;
  if(price>ema) trade.Buy(lot,NULL,price,price-sl,price+tp);
  else if(price<ema) trade.Sell(lot,NULL,price,price+sl,price-tp);
}`;
}

// --- OpenAIでEA生成（なければフォールバック）---
async function generateEA(prompt) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return fallbackEA("OPENAI_API_KEY 未設定（テンプレEA）");
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: "あなたは熟練のMQL5エンジニア。常に #property strict と CTrade を用い、コンパイル可能なEAの全文のみを返す。" },
          { role: "user", content: `仕様: ${prompt}\n必須: OnInit/OnTick, SL/TP, ロット計算, 日本語コメント。` }
        ]
      })
    });
    const j = await r.json();
    const code = j?.choices?.[0]?.message?.content?.trim();
    if (!code || !code.includes("#property strict")) return fallbackEA("AI応答が不完全（テンプレEA）");
    return code;
  } catch (e) {
    return fallbackEA("AIエラー: "+e.message);
  }
}

// --- Square: メールから購読Tierを判定（free/pro/advance）---
async function checkSquareTierByEmail(email) {
  const token = process.env.SQUARE_ACCESS_TOKEN;
  if (!token || !email) return "free";

  // 1) 顧客検索（メール一致）
  const cRes = await fetch("https://connect.squareup.com/v2/customers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ query: { filter: { email_address: { exact: email } } } })
  });
  const cJson = await cRes.json();
  const customer = cJson?.customers?.[0];
  if (!customer?.id) return "free";

  // 2) 顧客のサブスク一覧
  const sRes = await fetch(`https://connect.squareup.com/v2/subscriptions?customer_id=${customer.id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const sJson = await sRes.json();
  const active = (sJson?.subscriptions || []).filter(s => s.status === "ACTIVE");
  if (active.length === 0) return "free";

  // 3) プラン名からtier判定（variation名に "pro" / "advance" を含めておく）
  const name = (active[0].plan_variation_name || active[0].plan_id || "").toLowerCase();
  if (name.includes("advance")) return "advance";
  if (name.includes("pro")) return "pro";
  return "pro";
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    // GETで叩いた人向け（まず動作させたい時用の説明）
    return res.status(200).json({
      ok: true,
      howto: "POST JSON to this endpoint",
      example: { email: "you@example.com", prompt: "EMA200 × Donchian30 ブレイク" }
    });
  }

  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  // JSON受け取り
  let body = {};
  try {
    body = req.body ?? {};
    if (typeof body === "string") body = JSON.parse(body || "{}");
  } catch {
    return res.status(400).json({ ok: false, error: "invalid JSON" });
  }

  const email  = (body.email  || "").trim();
  const prompt = (body.prompt || "").trim();
  if (!email)  return res.status(400).json({ ok:false, error:"email を送ってください" });
  if (!prompt) return res.status(400).json({ ok:false, error:"prompt を送ってください" });

  // 課金Tier判定（free/pro/advance）
  const tier = await checkSquareTierByEmail(email);

  // Freeはキーワード制限
  if (tier === "free" && !isFreeOK(prompt)) {
    return res.status(402).json({
      ok: false,
      error: "Free版では一部キーワードのみ使用可（EMA/RSI/ATR/Donchian/ADX など）。Pro/Advanceをご利用ください。"
    });
  }

  // 生成
  const code = await generateEA(prompt);

  // 返す（Blogger側でtextareaに出す or ダウンロード処理にしてもOK）
  return res.status(200).json({ ok: true, tier, code });
}
