const { PAGE_URL } = require("./icbc");
const { formatTime } = require("./log");

const formatYuan = (fen) => (fen / 100).toFixed(2);

function changeText(oldFen, newFen) {
  const delta = newFen - oldFen;
  const percent = oldFen ? (delta / oldFen) * 100 : 0;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${(delta / 100).toFixed(2)} 元（${sign}${percent.toFixed(2)}%）`;
}

function buildChangeMessage(quote, lastPushed) {
  const rows = [
    { name: "主动积存价", oldFen: lastPushed.activeFen, newFen: quote.activeFen },
    { name: "赎回价", oldFen: lastPushed.redeemFen, newFen: quote.redeemFen },
  ];
  const changed = rows.filter((row) => row.oldFen !== row.newFen);
  const summary = `如意金积存变动：${changed
    .map((row) => `${row.name} ${formatYuan(row.oldFen)}→${formatYuan(row.newFen)}`)
    .join("，")} 元/克`;
  const table = rows
    .map((row) => {
      const note = row.oldFen === row.newFen ? "未变" : changeText(row.oldFen, row.newFen);
      return `<tr><td>${row.name}</td><td>${formatYuan(row.oldFen)}</td><td><b>${formatYuan(
        row.newFen
      )}</b></td><td>${note}</td></tr>`;
    })
    .join("");
  const content = [
    "<h2>如意金积存价格变动</h2>",
    '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:14px;">',
    "<tr><th>项目</th><th>上次推送</th><th>当前</th><th>变动</th></tr>",
    table,
    "</table>",
    `<p>时间：${formatTime(new Date(quote.fetchedAt))}（北京时间）</p>`,
    "<p>主动积存价为买入积存金价格，赎回价为卖出价格；单位：元/克。</p>",
    `<p><a href="${PAGE_URL}">打开工商银行如意金积存行情</a></p>`,
  ].join("");
  return { summary: summary.slice(0, 100), content, url: PAGE_URL };
}

function buildStartupMessage(quote) {
  return {
    summary: `监控已启动：主动积存 ${formatYuan(quote.activeFen)} 元/克`,
    content:
      `<h2>工行积存金监控已启动</h2>` +
      `<p>主动积存价：<b>${formatYuan(quote.activeFen)}</b> 元/克</p>` +
      `<p>赎回价：<b>${formatYuan(quote.redeemFen)}</b> 元/克</p>` +
      `<p>时间：${formatTime(new Date(quote.fetchedAt))}（北京时间）</p>` +
      `<p>之后价格变化时将推送通知。</p>`,
    url: PAGE_URL,
  };
}

function buildRecoveryMessage(quote) {
  return {
    summary: `监控已恢复：主动积存 ${formatYuan(quote.activeFen)} 元/克`,
    content:
      `<h2>工行积存金监控已恢复</h2>` +
      `<p>主动积存价：<b>${formatYuan(quote.activeFen)}</b> 元/克</p>` +
      `<p>赎回价：<b>${formatYuan(quote.redeemFen)}</b> 元/克</p>` +
      `<p>时间：${formatTime(new Date(quote.fetchedAt))}（北京时间）</p>`,
    url: PAGE_URL,
  };
}

function buildAlertMessage(error, failureCount) {
  return {
    summary: `工行积存金监控异常：连续 ${failureCount} 次取数失败`,
    content:
      `<h2>工行积存金监控异常</h2>` +
      `<p>已连续 <b>${failureCount}</b> 次无法获取如意金积存价格。</p>` +
      `<p>最后错误：${error.message}</p>` +
      `<p>时间：${formatTime()}（北京时间），恢复后会再次通知。</p>`,
    url: PAGE_URL,
  };
}

module.exports = {
  formatYuan,
  buildChangeMessage,
  buildStartupMessage,
  buildRecoveryMessage,
  buildAlertMessage,
};
