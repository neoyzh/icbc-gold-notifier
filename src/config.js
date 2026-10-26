const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function loadEnv(file) {
  let content;
  try {
    content = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(path.join(ROOT, ".env"));

const truthy = (value) => /^(1|true|yes)$/i.test(String(value || ""));

const config = {
  pollMs: Math.max(1000, Number(process.env.POLL_MS) || 60000),
  requestTimeoutMs: Math.max(5000, Number(process.env.REQUEST_TIMEOUT_MS) || 80000),
  dryRun: truthy(process.env.DRY_RUN),
  runOnce: truthy(process.env.RUN_ONCE),
  pushOnStart: truthy(process.env.PUSH_ON_START),
  watch: ["buy", "sell", "both"].includes(process.env.WATCH_PRICE)
    ? process.env.WATCH_PRICE
    : "both",
  minDeltaFen: Math.max(0, Number(process.env.MIN_DELTA_FEN) || 0),
  failureThreshold: Math.max(1, Number(process.env.ALERT_AFTER_FAILURES) || 5),
  stateFile: path.resolve(ROOT, process.env.STATE_FILE || ".icbc-watch-state.json"),
  wxpusher: {
    appToken: (process.env.WXPUSHER_APP_TOKEN || "").trim(),
    uids: (process.env.WXPUSHER_UIDS || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    topicIds: (process.env.WXPUSHER_TOPIC_IDS || "")
      .split(",")
      .map((item) => Number(item.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  },
};

module.exports = { config, ROOT, truthy };
