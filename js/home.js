/* 首页：根据时间与设置生成问候语 */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    if (!window.YinLing) return;
    const settings = window.YinLing.getSettings();
    const node = document.querySelector("#heroGreeting > span:last-child");
    if (!node) return;

    const hour = new Date().getHours();
    let greeting = "";
    let wish = "";

    if (hour < 6) {
      greeting = "夜深了";
      wish = "早点休息，明天再看也不迟。";
    } else if (hour < 11) {
      greeting = "早上好";
      wish = "今天也慢慢来，不着急。";
    } else if (hour < 13) {
      greeting = "中午好";
      wish = "记得好好吃饭，歇一会儿。";
    } else if (hour < 18) {
      greeting = "下午好";
      wish = "有拿不准的事，随时来问我。";
    } else {
      greeting = "晚上好";
      wish = "今天辛苦了，愿您安心顺意。";
    }

    const name = settings.name ? `，${settings.name}` : "";
    node.textContent = `${greeting}${name}。${wish}`;
  });
})();
