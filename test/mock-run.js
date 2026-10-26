const path = require("path");

const icbcPath = require.resolve(path.join(__dirname, "..", "src", "icbc.js"));
const realIcbc = require(icbcPath);

const SEQUENCE = [
  [87436, 85394],
  [87500, 85420],
  [87480, 85400],
  [87480, 85400],
  [87600, 85510],
];

let index = 0;

require.cache[icbcPath].exports = {
  ...realIcbc,
  fetchIcbcQuote: async () => {
    const [activeFen, redeemFen] = SEQUENCE[Math.min(index, SEQUENCE.length - 1)];
    index += 1;
    return {
      product: "如意金积存",
      activeFen,
      redeemFen,
      activePrice: activeFen / 100,
      redeemPrice: redeemFen / 100,
      fetchedAt: new Date().toISOString(),
      sourceUrl: realIcbc.PAGE_URL,
    };
  },
};

require(path.join(__dirname, "..", "src", "index.js"));
