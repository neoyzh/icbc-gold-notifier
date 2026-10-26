const fs = require("fs");
const { config } = require("./config");
const { fetchIcbcQuote } = require("./icbc");
const { sendMessage } = require("./wxpusher");
const { log } = require("./log");
const {
  formatYuan,
  buildChangeMessage,
  buildStartupMessage,
  buildRecoveryMessage,
  buildAlertMessage,
} = require("./messages");

const WATCH_LABEL = {
  buy: "仅主动积存价",
  sell: "仅赎回价",
  both: "主动积存+赎回报价",
};

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(config.stateFile, "utf8"));
  } catch {
    return {};
  }
}

function saveState(state) {
  const temp = `${config.stateFile}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  fs.renameSync(temp, config.stateFile);
}

function isValidBaseline(value) {
  return (
    value &&
    Number.isFinite(value.activeFen) &&
    Number.isFinite(value.redeemFen)
  );
}

const state = loadState();
let failureCount = Number.isFinite(Number(state.failureCount))
  ? Number(state.failureCount)
  : 0;
let alerted = Boolean(state.alerted);
let running = false;
let timer = null;

function shouldNotify(newFen, oldFen) {
  const delta = Math.abs(newFen - oldFen);
  return delta !== 0 && delta >= config.minDeltaFen;
}

function hasChange(lastPushed, quote) {
  const activeChanged =
    config.watch !== "sell" && shouldNotify(quote.activeFen, lastPushed.activeFen);
  const redeemChanged =
    config.watch !== "buy" && shouldNotify(quote.redeemFen, lastPushed.redeemFen);
  return activeChanged || redeemChanged;
}

async function safeSend(message, label) {
  try {
    await sendMessage(message);
    log(
      config.dryRun
        ? `${label}内容已生成（DRY-RUN，未实际发送）`
        : `${label}已推送`
    );
    return true;
  } catch (error) {
    log(`${label}推送最终失败：${error.message}`);
    return false;
  }
}

async function tick() {
  if (running) {
    log("上一轮尚未结束，跳过本次轮询");
    return;
  }
  running = true;
  try {
    const quote = await fetchIcbcQuote({ timeoutMs: config.requestTimeoutMs });
    log(
      `取数成功：主动积存 ${formatYuan(quote.activeFen)} 元/克，赎回 ${formatYuan(
        quote.redeemFen
      )} 元/克`
    );

    failureCount = 0;
    state.failureCount = 0;
    state.lastSeen = { activeFen: quote.activeFen, redeemFen: quote.redeemFen };
    state.lastSuccessAt = quote.fetchedAt;

    if (alerted) {
      alerted = false;
      state.alerted = false;
      await safeSend(buildRecoveryMessage(quote), "恢复通知");
    }

    if (!isValidBaseline(state.lastPushed)) {
      state.lastPushed = { activeFen: quote.activeFen, redeemFen: quote.redeemFen };
      saveState(state);
      log("已记录初始价格，作为后续变化比较基准（本次不推送）");
      if (config.pushOnStart) {
        await safeSend(buildStartupMessage(quote), "启动通知");
      }
      return;
    }

    if (hasChange(state.lastPushed, quote)) {
      const sent = await safeSend(
        buildChangeMessage(quote, state.lastPushed),
        "价格变动"
      );
      if (sent) {
        state.lastPushed = { activeFen: quote.activeFen, redeemFen: quote.redeemFen };
        state.lastPushAt = new Date().toISOString();
      }
    }
    saveState(state);
  } catch (error) {
    failureCount += 1;
    state.failureCount = failureCount;
    log(`取数失败（连续 ${failureCount} 次）：${error.message}`);
    if (failureCount >= config.failureThreshold && !alerted) {
      alerted = true;
      state.alerted = true;
      await safeSend(buildAlertMessage(error, failureCount), "异常通知");
    }
    saveState(state);
  } finally {
    running = false;
  }
}

async function main() {
  if (!config.dryRun) {
    if (!config.wxpusher.appToken) {
      throw new Error("缺少 WXPUSHER_APP_TOKEN（可先设 DRY_RUN=1 试运行）");
    }
    if (!config.wxpusher.uids.length && !config.wxpusher.topicIds.length) {
      throw new Error("缺少接收人配置 WXPUSHER_UIDS 或 WXPUSHER_TOPIC_IDS");
    }
  }

  const mode = config.dryRun ? "DRY-RUN（只打印不推送）" : "WxPusher 标准推送";
  const target = config.dryRun
    ? ""
    : `，接收人 ${config.wxpusher.uids.length} 个 UID / ${config.wxpusher.topicIds.length} 个主题`;
  log(
    `监控启动：${mode}，轮询间隔 ${config.pollMs}ms，监控${WATCH_LABEL[config.watch]}${target}`
  );
  log(`状态文件：${config.stateFile}`);

  await tick();
  if (config.runOnce) return;

  const schedule = () => {
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, config.pollMs);
  };
  schedule();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (timer) clearTimeout(timer);
    log("监控已停止");
    process.exit(0);
  });
}

main().catch((error) => {
  log(`启动失败：${error.message}`);
  process.exit(1);
});
