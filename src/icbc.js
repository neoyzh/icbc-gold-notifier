const https = require("https");
const crypto = require("crypto");
const zlib = require("zlib");

// 工行服务器要求 legacy renegotiation，OpenSSL 3 默认禁用，需显式放行
const LEGACY_SERVER_CONNECT = crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT;

const REQUEST_URL = "https://mybank.icbc.com.cn/servlet/AsynGetDataServlet";
const PAGE_URL =
  "https://mybank.icbc.com.cn/icbc/newperbank/perbank3/gold/goldaccrual_query_out.jsp";

function decodeBody(buffer, encoding) {
  const value = String(encoding || "").toLowerCase();
  if (value.includes("gzip")) return zlib.gunzipSync(buffer);
  if (value.includes("br")) return zlib.brotliDecompressSync(buffer);
  if (value.includes("deflate")) return zlib.inflateSync(buffer);
  return buffer;
}

function requestQuote(timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = "tranCode=A00505";
    const req = https.request(
      REQUEST_URL,
      {
        method: "POST",
        secureOptions: LEGACY_SERVER_CONNECT,
        timeout: timeoutMs,
        headers: {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "content-length": Buffer.byteLength(body),
          accept: "application/json, text/javascript, */*; q=0.01",
          "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
          "accept-encoding": "gzip, deflate, br",
          "x-requested-with": "XMLHttpRequest",
          origin: "https://mybank.icbc.com.cn",
          referer: PAGE_URL,
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("error", reject);
        res.on("end", () => {
          try {
            const text = decodeBody(
              Buffer.concat(chunks),
              res.headers["content-encoding"]
            ).toString("utf8");
            if (res.statusCode !== 200) {
              throw new Error(`HTTP ${res.statusCode}：${text.slice(0, 120)}`);
            }
            resolve(text);
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)));
    req.on("error", reject);
    req.end(body);
  });
}

function toFen(value) {
  const numeric = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
}

function parseQuote(text) {
  const data = JSON.parse(text);
  if (data.ErrorCode) {
    throw new Error(`工行接口返回 ${data.ErrorCode}：${data.ErrorMsg || "未知错误"}`);
  }
  const product = data.ryinfo?.find((item) => item.productName?.includes("如意金"));
  if (!product) throw new Error("未找到如意金积存产品");
  const price = data.pronoinfo?.find((item) => item.prodcode === product.productId);
  if (!price) throw new Error("未找到如意金积存报价");
  const activeFen = toFen(price.buyprice);
  const redeemFen = toFen(price.sellprice);
  if (activeFen === null || redeemFen === null) {
    throw new Error("如意金报价解析失败");
  }
  return {
    product: product.productName,
    activeFen,
    redeemFen,
    activePrice: activeFen / 100,
    redeemPrice: redeemFen / 100,
  };
}

async function fetchIcbcQuote({ timeoutMs = 80000 } = {}) {
  const text = await requestQuote(timeoutMs);
  return {
    ...parseQuote(text),
    fetchedAt: new Date().toISOString(),
    sourceUrl: PAGE_URL,
  };
}

module.exports = { fetchIcbcQuote, REQUEST_URL, PAGE_URL };
