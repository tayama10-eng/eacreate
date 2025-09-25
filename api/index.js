// api/index.js  ← 1ファイルで複数ルートをさばく
function handleGenerate(req, res) {
  const mq5 = `//+------------------------------------------------------------------+
//|   HelloEA.mq5  (MT5にそのまま貼れる最小テンプレ)                 |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
CTrade trade;

// ---- 入力パラメータ ----
input int    InpEMAPeriod = 200;  // EMA期間
input double InpRiskPct   = 1.0;  // リスク％(0=固定0.1ロット)
input double InpSL_Pips   = 200;  // 損切りpips
input double InpTP_Pips   = 400;  // 利確pips

double LotByRisk(double sl_pips){
  if(InpRiskPct<=0) return 0.10;
  double bal=AccountInfoDouble(ACCOUNT_BALANCE);
  double tickval=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_VALUE);
  double ticksize=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_TICK_SIZE);
  if(tickval<=0 || ticksize<=0) return 0.10;
  double risk=bal*InpRiskPct/100.0;
  double perLotLoss=(sl_pips*_Point)*(tickval/ticksize);
  if(perLotLoss<=0) return 0.10;
  double lot=risk/perLotLoss;
  double step=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_STEP);
  double minl=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MIN);
  double maxl=SymbolInfoDouble(_Symbol,SYMBOL_VOLUME_MAX);
  lot = MathMax(minl, MathMin(maxl, MathFloor(lot/step)*step));
  return lot;
}

int OnInit(){ return(INIT_SUCCEEDED); }

void OnTick(){
  if(Bars<300) return;

  static datetime last;
  datetime nowBar = iTime(_Symbol,_Period,0);
  if(last==nowBar) return;
  last = nowBar;

  double ema = iMA(_Symbol,_Period,InpEMAPeriod,0,MODE_EMA,PRICE_CLOSE,0);
  double price = SymbolInfoDouble(_Symbol,SYMBOL_ASK);
  if(price<=0) price = Close[0];

  if(PositionSelect(_Symbol)) return;

  double sl = InpSL_Pips*_Point;
  double tp = InpTP_Pips*_Point;
  double lot = LotByRisk(InpSL_Pips);

  if(Close[0] > ema){
    trade.Buy(lot,NULL,price,price-sl,price+tp);
  }else if(Close[0] < ema){
    trade.Sell(lot,NULL,price,price+sl,price-tp);
  }
}
`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="HelloEA.mq5"');
  res.status(200).send(mq5);
}

function handlePing(req, res) {
  res.status(200).json({ ok: true, route: "/api/ping", time: new Date().toISOString() });
}

module.exports = (req, res) => {
  // ルート振り分け（vercel.jsonで dest は全部このファイルに来る）
  if (req.url.endsWith("/generate")) return handleGenerate(req, res);
  if (req.url.endsWith("/ping"))     return handlePing(req, res);
  res.status(404).json({ ok: false, error: "Not Found" });
};
