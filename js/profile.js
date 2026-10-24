/* =========================================================
   我的设置：显示偏好、亲情联系人、安全记录与学习档案
   ========================================================= */

(function () {
  "use strict";

  const NY = window.YinLing;
  const HISTORY_KEY = "yinling.fraudHistory.v1";
  const LEARNING_KEY = "yinling.learning.v1";
  const QUIZ_KEY = "yinling.quizBest.v1";
  const TOTAL_LESSONS = 6;

  const FONT_LABELS = {
    normal: "标准",
    large: "大字",
    xlarge: "特大",
  };

  let clearHistoryArmed = false;
  let clearHistoryTimer = null;
  let resetArmed = false;
  let resetTimer = null;

  function $(selector) {
    return document.querySelector(selector);
  }

  function firstChar(value, fallback) {
    const text = String(value || "").trim();
    return text ? Array.from(text)[0] : fallback;
  }

  function syncDisplayControls() {
    const settings = NY.getSettings();

    document.querySelectorAll('input[name="profileFont"]').forEach((radio) => {
      radio.checked = radio.value === settings.font;
    });

    const contrast = $("#profileContrast");
    if (contrast) contrast.checked = Boolean(settings.contrast);
    const motion = $("#profileMotion");
    if (motion) motion.checked = Boolean(settings.reduceMotion);
    const autoRead = $("#profileAutoRead");
    if (autoRead) autoRead.checked = Boolean(settings.autoRead);

    const fontLabel = $("#profileFontLabel");
    if (fontLabel) fontLabel.textContent = FONT_LABELS[settings.font] || "大字";

    const nameInput = $("#profileNameInput");
    if (nameInput && document.activeElement !== nameInput) {
      nameInput.value = settings.name || "";
    }

    const avatar = $("#profileAvatar");
    if (avatar) avatar.textContent = firstChar(settings.name, "暖");
  }

  function bindDisplayControls() {
    document.querySelectorAll('input[name="profileFont"]').forEach((radio) => {
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        NY.saveSettings(
          { font: radio.value },
          { toast: `字号已调整为${FONT_LABELS[radio.value]}` }
        );
      });
    });

    const contrast = $("#profileContrast");
    if (contrast) {
      contrast.addEventListener("change", () => {
        NY.saveSettings(
          { contrast: contrast.checked },
          { toast: contrast.checked ? "已开启高对比度" : "已恢复普通对比度" }
        );
      });
    }

    const motion = $("#profileMotion");
    if (motion) {
      motion.addEventListener("change", () => {
        NY.saveSettings(
          { reduceMotion: motion.checked },
          { toast: motion.checked ? "已减少动画效果" : "已恢复页面动效" }
        );
      });
    }

    const autoRead = $("#profileAutoRead");
    if (autoRead) {
      autoRead.addEventListener("change", () => {
        NY.saveSettings(
          { autoRead: autoRead.checked },
          { toast: autoRead.checked ? "识别完成后会自动朗读" : "已关闭自动朗读" }
        );
      });
    }

    const form = $("#profileNameForm");
    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const input = $("#profileNameInput");
        const name = input ? input.value.trim() : "";
        NY.saveSettings(
          { name },
          { toast: name ? `好的，以后就叫您${name}` : "已恢复默认称呼" }
        );
        const avatar = $("#profileAvatar");
        if (avatar) avatar.textContent = firstChar(name, "暖");
      });
    }
  }

  function updateContact() {
    const settings = NY.getSettings();
    const name = $("#contactDisplayName");
    const relation = $("#contactDisplayRelation");
    const phone = $("#contactDisplayPhone");
    const avatar = $("#contactAvatar");
    const call = $("#profileContactCall");

    if (name) name.textContent = settings.contactName || "还没有设置";
    if (relation) {
      relation.textContent = settings.contactName
        ? settings.contactRelation || "亲友"
        : "建议设置一位子女或亲友";
    }
    if (phone) {
      phone.textContent = settings.contactPhone || "号码只保存在本机";
    }
    if (avatar) avatar.textContent = firstChar(settings.contactName, "家");
    if (call) {
      call.setAttribute(
        "aria-label",
        settings.contactPhone ? `拨打 ${settings.contactName || "家人"} 的电话` : "设置亲情联系人电话"
      );
      call.innerHTML = settings.contactPhone
        ? '<span class="btn-icon" data-icon="phone"></span>拨打电话'
        : '<span class="btn-icon" data-icon="edit"></span>设置电话';
      NY.icons(call);
    }
  }

  function getHistory() {
    const data = NY.getJSON(HISTORY_KEY, []);
    if (!Array.isArray(data)) return [];
    return data.filter((item) => item && item.result);
  }

  function updateCounts() {
    const history = getHistory();
    const completed = NY.getJSON(LEARNING_KEY, []);
    const completedCount = Array.isArray(completed) ? Math.min(completed.length, TOTAL_LESSONS) : 0;
    const lessonCount = $("#profileLessonCount");
    const checkCount = $("#profileCheckCount");
    if (lessonCount) lessonCount.textContent = String(completedCount);
    if (checkCount) checkCount.textContent = String(history.length);
    updateLearningSummary(completedCount);
  }

  function updateLearningSummary(completedCount) {
    const percent = Math.round((completedCount / TOTAL_LESSONS) * 100);
    const ring = $("#profileProgressRing");
    const percentNode = $("#profileProgressPercent");
    const text = $("#profileLearningText");
    const quizBest = $("#profileQuizBest");
    const savedBest = NY.getJSON(QUIZ_KEY, null);

    if (ring) ring.style.setProperty("--progress", String(percent));
    if (percentNode) percentNode.textContent = `${percent}%`;

    if (text) {
      if (completedCount === 0) text.textContent = "还没有开始学习";
      else if (completedCount >= TOTAL_LESSONS) text.textContent = "六节课都学会了，真棒";
      else text.textContent = `已学会 ${completedCount} 课，继续保持`;
    }

    if (quizBest) {
      quizBest.textContent =
        savedBest && savedBest.total
          ? `小测验：${savedBest.score} / ${savedBest.total} 题`
          : "小测验：还没有作答";
    }
  }

  function renderHistory() {
    const list = $("#profileHistoryList");
    const empty = $("#profileHistoryEmpty");
    const foot = $("#profileHistoryFoot");
    if (!list || !empty || !foot) return;

    const history = getHistory();
    if (!history.length) {
      list.innerHTML = "";
      list.hidden = true;
      empty.hidden = false;
      foot.hidden = true;
      return;
    }

    list.hidden = false;
    empty.hidden = true;
    foot.hidden = false;

    list.innerHTML = history
      .slice(0, 6)
      .map(
        (item) => `
        <a class="profile-history-item" href="fraud.html">
          <span class="profile-history-risk risk-${item.result.level || "none"}">${NY.escapeHTML(
            item.result.label || "识别记录"
          )}</span>
          <span class="profile-history-main">
            <strong>${NY.escapeHTML(item.preview || "识别记录")}</strong>
            <span>${NY.escapeHTML(item.timeLabel || NY.formatTime(item.time))} · 风险分 ${
              Number(item.result.score) || 0
            }</span>
          </span>
          <span data-icon="chevron-right"></span>
        </a>`
      )
      .join("");

    NY.icons(list);
  }

  function bindHistoryActions() {
    const clearButton = $("#profileClearHistory");
    if (!clearButton) return;
    const original = clearButton.innerHTML;

    clearButton.addEventListener("click", () => {
      if (!clearHistoryArmed) {
        clearHistoryArmed = true;
        clearButton.innerHTML = '<span data-icon="alert-circle"></span>再点一次确认清空';
        NY.icons(clearButton);
        NY.showToast("再点一次，就会清空所有识别记录。", "warm");
        clearHistoryTimer = window.setTimeout(() => {
          clearHistoryArmed = false;
          clearButton.innerHTML = original;
          NY.icons(clearButton);
        }, 5000);
        return;
      }

      window.clearTimeout(clearHistoryTimer);
      clearHistoryArmed = false;
      clearButton.innerHTML = original;
      NY.icons(clearButton);
      NY.writeJSON(HISTORY_KEY, []);
      renderHistory();
      updateCounts();
      NY.showToast("识别记录已清空");
    });
  }

  function bindResetAll() {
    const button = $("#profileResetAll");
    if (!button) return;
    const original = button.innerHTML;

    button.addEventListener("click", () => {
      if (!resetArmed) {
        resetArmed = true;
        button.innerHTML = '<span data-icon="alert-circle"></span>再点一次，清除全部数据';
        NY.icons(button);
        NY.showToast("再点一次，字号、称呼和全部记录都会恢复初始状态。", "warm");
        resetTimer = window.setTimeout(() => {
          resetArmed = false;
          button.innerHTML = original;
          NY.icons(button);
        }, 5000);
        return;
      }

      window.clearTimeout(resetTimer);
      resetArmed = false;
      try {
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith("yinling."))
          .forEach((key) => window.localStorage.removeItem(key));
      } catch (error) {
        /* 忽略存储异常 */
      }
      NY.showToast("全部本机数据已清除，正在恢复初始设置…");
      window.setTimeout(() => window.location.reload(), 700);
    });
  }

  function init() {
    syncDisplayControls();
    bindDisplayControls();
    updateContact();
    bindHistoryActions();
    bindResetAll();
    renderHistory();
    updateCounts();

    document.addEventListener("yinling:settings", () => {
      syncDisplayControls();
      updateContact();
    });

    document.addEventListener("yinling:contact", updateContact);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
