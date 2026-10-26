const https = require("https");
const { config } = require("./config");
const { log } = require("./log");

const API_URL = "https://wxpusher.zjiecode.com/api/send/message";
const RETRY_DELAYS = [1000, 5000, 30000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function postJson(url, payload, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request(
      url,
      {
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json;
          try {
            json = JSON.parse(text);
          } catch {
            reject(new Error(`推送接口返回非 JSON（HTTP ${res.statusCode}）`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(
              new Error(`推送接口 HTTP ${res.statusCode}：${json.msg || text.slice(0, 120)}`)
            );
            return;
          }
          resolve(json);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`推送请求超时（${timeoutMs}ms）`)));
    req.on("error", reject);
    req.end(body);
  });
}

function plainText(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function sendMessage(message) {
  if (config.dryRun) {
    log(`[DRY-RUN] 将推送：${message.summary}`);
    console.log(plainText(message.content));
    return true;
  }

  const { appToken, uids, topicIds } = config.wxpusher;
  if (!appToken) throw new Error("缺少 WXPUSHER_APP_TOKEN");
  if (!uids.length && !topicIds.length) {
    throw new Error("缺少接收人配置（WXPUSHER_UIDS 或 WXPUSHER_TOPIC_IDS）");
  }

  const body = {
    appToken,
    content: message.content,
    summary: message.summary,
    contentType: 2,
    url: message.url,
  };
  if (uids.length) body.uids = uids;
  if (topicIds.length) body.topicIds = topicIds;

  let lastError;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt += 1) {
    try {
      const result = await postJson(API_URL, body);
      if (result.code !== 1000) {
        throw new Error(`业务码 ${result.code}：${result.msg || "未知错误"}`);
      }
      return true;
    } catch (error) {
      lastError = error;
      log(`推送失败（第 ${attempt + 1} 次）：${error.message}`);
      if (attempt < RETRY_DELAYS.length) await sleep(RETRY_DELAYS[attempt]);
    }
  }
  throw lastError;
}

module.exports = { sendMessage, API_URL };
