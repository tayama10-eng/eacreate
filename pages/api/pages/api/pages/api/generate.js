export default function handler(req, res) {
  const mq5 = `//+------------------------------------------------------------------+
//|   HelloEA.mq5 (MT5にそのまま貼れる最小テンプレ)                 |
//+------------------------------------------------------------------+
#property strict
#include <Trade/Trade.mqh>
CTrade trade;
int OnInit(){ return(INIT_SUCCEEDED); }
void OnTick(){ /* ここにロジック */ }`;
  res.setHeader("Content-Type","text/plain; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="HelloEA.mq5"');
  res.status(200).send(mq5);
}
