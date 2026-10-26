const TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const formatTime = (date = new Date()) => TIME_FORMAT.format(date);
const log = (message) => console.log(`[${formatTime()}] ${message}`);

module.exports = { formatTime, log };
