/* =========================================================
   AI 反诈识别页
   ========================================================= */
(function () {
  "use strict";
  const NY = window.YinLing;
  const HISTORY_KEY = "yinling.fraudHistory.v1";
  const SAMPLES = {
    package:
      "【快递客服】您好，您的快递在运输中丢失，我们将为您办理双倍理赔。请点击 http://kf-claim.top/verify 填写银行卡号和短信验证码，客服会尽快处理。今日内有效，超时无法理赔。",
    authority:
      "我是市公安局民警，您的银行卡涉嫌洗钱，请立即将存款转入安全账户接受资金清查，否则将冻结账户。这件事要保密，不要告诉家人，也别挂电话。",
    prize:
      "恭喜您成为幸运用户，获得 20000 元大奖！领奖前请先支付 800 元手续费，名额有限，点击链接填写身份证号领取。",
    investment:
      "叔叔您好，我是养老项目顾问。现在有一个内部养老理财项目，年化收益 18%，保本保息，稳赚不赔。只要下载我们的 App，跟着老师带单操作，三个月就能翻倍。名额有限，先到先得，想参加就加我微信。",
    family:
      "妈，我换号了，这是我新号码。我手机掉了，现在急需用钱，你马上转 5000 到朋友账户，别打电话给我，晚点解释。",
    safe:
      "张老师您好，明天上午九点社区活动中心有一场健康讲座，讲怎么科学控制血压。您有空就来，不用带东西，也不收费。",
  };
  const RISK_ICONS = {
    high: "alert",
    medium: "alert-circle",
    low: "info",
    none: "shield-check",
  };
  const TYPE_LABELS = {
    link: "可疑网址",
    authority: "冒充机关",
    "safe-account": "安全账户",
    transfer: "要求转账",
    credentials: "索要验证码",
    "screen-share": "屏幕共享",
    urgency: "催促施压",
    secrecy: "要求保密",
    "fake-service": "冒充客服",
    refund: "退款理赔",
    lure: "利益诱惑",
    "prize-fee": "先交费",
    family: "冒充亲友",
    investment: "高收益投资",
    health: "夸大疗效",
    privacy: "索要信息",
    "remote-app": "陌生软件",
    "contact-channel": "私下联系",
    threat: "言语威胁",
    "ai-face": "AI 换脸",
  };
  let currentResult = null;
  let analyzing = false;
  let speechRecognition = null;
  let isListening = false;
  let voiceBaseText = "";
  let clearHistoryArmed = false;
  let clearHistoryTimer = null;

  function adaptAiResult(ai, text) {
    const levelMap = {
      high: "高度可疑",
      medium: "值得留意",
      low: "轻微异常",
      none: "暂未见明显风险"
    };
    // AI返回 reasons[] → 前端 findings[]
    const severity = ai.level === "none" ? "low" : ai.level;
    const findings = (ai.reasons || []).map(reason => ({
      title: reason,
      icon: "alert",
      severity: severity,
      explain: "",
      evidence: []
    }));

    return {
      headline: ai.hint,
      summary: ai.hint,
      level: ai.level,
      label: levelMap[ai.level] ?? "未知风险",
      score: ai.score,
      findings: findings,
      actions: ai.advice ? [ai.advice] : [],
      text: text,
      highlights: [],
      mantra: "凡是要求转账的，先挂断再核实。"
    };
  }
  // ====================================================================

  function $(selector) {
    return document.querySelector(selector);
  }
  function updateCharCount() {
    const input = $("#messageInput");
    const count = $("#charCount");
    if (!input || !count) return;
    count.textContent = `${input.value.length} / 4000 字`;
  }
  function setInputError(message) {
    const error = $("#inputError");
    if (!error) return;
    if (message) {
      error.textContent = message;
      error.hidden = false;
    } else {
      error.hidden = true;
      error.textContent = "";
    }
  }
  function setAnalyzing(value) {
    analyzing = value;
    const button = $("#analyzeBtn");
    if (!button) return;
    button.disabled = value;
    button.classList.toggle("is-loading", value);
    button.setAttribute("aria-busy", String(value));
    const strong = button.querySelector("strong");
    const small = button.querySelector("small");
    if (strong) strong.textContent = value ? "正在仔细看…" : "开始 AI 识别";
    if (small) small.textContent = value ? "请稍等几秒钟" : "大约需要几秒钟";
  }

  // =====================【异步 + 真实流式请求 + 打点动画】=====================
  async function analyzeNow() {
    const input = $("#messageInput");
    if (!input) return;
    const text = input.value.trim();
    if (text.length < 6) {
      setInputError("再多写一点吧，至少需要 6 个字才能判断。");
      input.focus();
      NY.showToast("内容太短了，请再多粘贴一点。", "warm");
      return;
    }
    setInputError("");
    setAnalyzing(true);
    const status = $("#analysisStatus");
    const streamDom = $("#streamResult");
    if (status) status.textContent = "正在请求AI分析，请稍候…";
    if (streamDom) streamDom.textContent = "";

    let dotTimer = null;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 25000);
    try {
      // 等待动画
      dotTimer = setInterval(() => {
        if (streamDom) streamDom.innerText += "·";
      }, 300);

      const res = await fetch("/api/analyze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("后端接口异常 " + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let aiRaw = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (dotTimer) {
          clearInterval(dotTimer);
          dotTimer = null;
          if (streamDom) streamDom.textContent = "";
        }
        buffer += decoder.decode(value, { stream: true });
        // SSE：每帧是 "data: <json>" + 空行，逐帧解析，不能整体 JSON.parse
        // 兼容 \n\n 与 \r\n\r\n 两种换行
        let match;
        while ((match = buffer.match(/\r?\n\r?\n/)) !== null) {
          const frame = buffer.slice(0, match.index).trim();
          buffer = buffer.slice(match.index + match[0].length);
          if (!frame.startsWith("data:")) continue;
          let evt;
          try {
            evt = JSON.parse(frame.slice(5).trim());
          } catch (error) {
            continue;
          }
          if (evt.type === "hint") {
            if (streamDom) streamDom.textContent += evt.text;
          } else if (evt.type === "result") {
            aiRaw = evt.detail;
          } else if (evt.type === "fallback") {
            aiRaw = null;
          }
        }
      }
      if (!aiRaw) throw new Error("AI 没有返回可用结果");
      const result = adaptAiResult(aiRaw, text);

      currentResult = result;
      renderResult(result);
      saveHistory(result);
      renderHistory();

      if (status) {
        status.textContent = `识别完成，结果是${result.label}，风险评分 ${result.score} 分。`;
      }
      if (streamDom) streamDom.textContent = "";

      const section = $("#resultSection");
      if (section) {
        section.hidden = false;
        window.setTimeout(() => {
          const heading = $("#resultHeading");
          if (heading) heading.focus({ preventScroll: true });
          section.scrollIntoView({
            behavior: NY.getSettings().reduceMotion ? "auto" : "smooth",
            block: "start",
          });
        }, 60);
      }
      if (NY.getSettings().autoRead) {
        window.setTimeout(() => NY.speakText(buildSpeechText(result)), 800);
      }
    } catch (err) {
      console.error(err);
      // AI 不可用时回退本地规则引擎：断网、后端异常、超时都还能出结果
      let local = null;
      try {
        local = window.FraudEngine && window.FraudEngine.analyze(text);
      } catch (fallbackError) {
        local = null;
      }
      if (local && local.valid) {
        currentResult = local;
        renderResult(local);
        saveHistory(local);
        renderHistory();
        if (status) {
          status.textContent = `AI 暂不可用，已用本地规则判断，结果${local.label}，风险评分 ${local.score} 分。`;
        }
        const localSection = $("#resultSection");
        if (localSection) localSection.hidden = false;
        NY.showToast("AI 暂不可用，已用本地规则判断", "warm");
      } else {
        NY.showToast("识别时出了一点小问题，请再试一次。", "error");
      }
    } finally {
      // 无论成功失败，清除定时器，恢复按钮
      if (dotTimer) clearInterval(dotTimer);
      window.clearTimeout(timeoutId);
      if (streamDom) streamDom.textContent = "";
      setAnalyzing(false);
    }
  }
  // =============================================================================

  function renderResult(result) {
    const card = $("#resultCard");
    if (!card) return;
    const findingCount = result.findings.length;
    const severityText = {
      high: "高度可疑",
      medium: "值得留意",
      low: "轻微异常",
    };
    const findingsHtml = result.findings.length
      ? result.findings
        .map((finding) => {
          const evidence = finding.evidence && finding.evidence.length
            ? `<div class="finding-evidence"><span>原文涉及</span>${finding.evidence
              .map((item) => `<mark>${NY.escapeHTML(item)}</mark>`)
              .join("")}</div>`
            : "";
          const linksHtml =
            finding.links && finding.links.length
              ? `<div class="finding-links">${finding.links
                .map(
                  (link) =>
                    `<span class="finding-link"><span data-icon="link"></span><span>${NY.escapeHTML(
                      link.host
                    )}</span><small>${NY.escapeHTML(link.issues[0] || "")}</small></span>`
                )
                .join("")}</div>`
              : "";
          return `
              <article class="finding-card finding-${finding.severity}">
                <span class="finding-card-icon"><span data-icon="${finding.icon || "alert"}"></span></span>
                <div class="finding-card-content">
                  <div class="finding-title-row">
                    <h4>${NY.escapeHTML(finding.title)}</h4>
                    <span class="finding-severity ${finding.severity}">${severityText[finding.severity] || "值得留意"}</span>
                  </div>
                  <p>${NY.escapeHTML(finding.explain)}</p>
                  ${evidence}
                  ${linksHtml}
                </div>
              </article>`;
        })
        .join("")
      : `
        <div class="safe-finding-panel">
          <span class="safe-finding-icon"><span data-icon="shield-check"></span></span>
          <div>
            <h4>没有发现常见的诈骗话术</h4>
            <p>这是一条好消息，但并不代表可以完全放心。请继续确认对方身份，不要因为“看起来正常”就转账。</p>
          </div>
          <ul class="safe-checklist">
            <li><span data-icon="check"></span>没有出现冒充公检法、客服或亲友的话术</li>
            <li><span data-icon="check"></span>没有要求转账、汇款或先交费用</li>
            <li><span data-icon="check"></span>没有索要验证码、密码或屏幕共享</li>
          </ul>
        </div>`;
    const actionsHtml = result.actions
      .map(
        (action, index) =>
          `<li><span class="action-number">${index + 1}</span><p>${NY.escapeHTML(action)}</p></li>`
      )
      .join("");
    const marked = buildMarkedHTML(result.text, result.highlights);
    const hasHighlights = result.highlights && result.highlights.length > 0;
    const openAttribute = result.level === "high" ? " open" : "";
    card.innerHTML = `
      <div class="result-summary risk-${result.level}" style="--score:${result.score}">
        <div class="result-gauge" role="img" aria-label="风险评分 ${result.score} 分，满分 100 分，${result.label}">
          <div class="gauge-inner">
            <strong>${result.score}</strong>
            <span>风险分</span>
          </div>
        </div>
        <div class="result-intro">
          <div class="result-label-row">
            <span class="risk-badge risk-${result.level}">
              <span data-icon="${RISK_ICONS[result.level]}"></span>${result.label}
            </span>
            <span class="result-complete"><span data-icon="check-circle"></span>AI 分析完成</span>
          </div>
          <h2 class="result-heading" id="resultHeading" tabindex="-1">${NY.escapeHTML(result.headline)}</h2>
          <p class="result-summary-text">${NY.escapeHTML(result.summary)}</p>
          <div class="result-actions">
            <button class="btn btn-primary btn-sm" type="button" data-result-read>
              <span class="btn-icon" data-icon="volume"></span>读给我听
            </button>
            <button class="btn btn-secondary btn-sm" type="button" data-result-share>
              <span class="btn-icon" data-icon="share"></span>告诉家人
            </button>
            <button class="btn btn-ghost btn-sm" type="button" data-result-again>
              <span class="btn-icon" data-icon="refresh"></span>重新识别
            </button>
          </div>
        </div>
      </div>
      <div class="result-mantra">
        <span class="result-mantra-icon"><span data-icon="shield-check"></span></span>
        <p><span>记住一句话</span><strong>${NY.escapeHTML(result.mantra)}</strong></p>
      </div>
      <div class="result-columns">
        <aside class="actions-column">
          <div class="actions-panel">
            <div class="actions-head">
              <span class="result-step">02</span>
              <div><h3>现在请这样做</h3><p>先做眼前这几步，别急着回复对方。</p></div>
            </div>
            <ol class="action-steps">${actionsHtml}</ol>
            <div class="hotline-card">
              <div class="hotline-copy">
                <span class="hotline-icon"><span data-icon="phone-call"></span></span>
                <div><strong>96110 反诈专线</strong><span>免费接听，可帮您一起判断</span></div>
              </div>
              <a class="hotline-call" href="tel:96110" aria-label="拨打 96110 反诈专线">拨打</a>
            </div>
            <p class="actions-note"><span data-icon="info"></span>如果已经转账，请立即拨打 110 报警，并联系银行止付。</p>
          </div>
        </aside>
        <div class="findings-column">
          <div class="findings-panel">
            <div class="findings-head">
              <span class="result-step">01</span>
              <div>
                <h3>${findingCount ? "AI 发现的可疑点" : "AI 检查了什么"}</h3>
                <p>${findingCount ? `一共发现 ${findingCount} 处，按重要程度排列。` : "没有匹配到常见骗术特征，请仍保持谨慎。"}</p>
              </div>
            </div>
            <div class="findings-list">${findingsHtml}</div>
          </div>
          <details class="source-review"${openAttribute}>
            <summary>
              <span class="source-review-title"><span data-icon="message"></span>${hasHighlights ? "原文里这些话要当心" : "再看一眼原文"}</span>
              <span class="source-review-hint">${hasHighlights ? "共标记 " + result.highlights.length + " 处" : "暂无标记"}<span data-icon="chevron-down"></span></span>
            </summary>
            <div class="source-review-body">
              <p class="marked-text">${marked}</p>
              ${hasHighlights
        ? `<div class="marked-legend"><span class="legend-mark"></span>带底色的文字是 AI 找到的可疑内容</div>`
        : `<div class="marked-legend safe"><span data-icon="check-circle"></span>未发现需要特别标记的语句</div>`
      }
            </div>
          </details>
        </div>
      </div>`;
    NY.icons(card);
  }
  function buildMarkedHTML(text, highlights) {
    if (!text) return "";
    if (!highlights || !highlights.length) {
      return NY.escapeHTML(text);
    }
    const safeRanges = highlights
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end))
      .map((item) => ({ ...item, start: Math.max(0, item.start), end: Math.min(text.length, item.end) }))
      .filter((item) => item.end > item.start)
      .sort((a, b) => a.start - b.start);
    let html = "";
    let cursor = 0;
    for (const item of safeRanges) {
      if (item.start < cursor) continue;
      html += NY.escapeHTML(text.slice(cursor, item.start));
      const label = item.type === "link" ? "可疑网址" : TYPE_LABELS[item.type] || "可疑内容";
      html += `<mark class="risk-mark${item.type === "link" ? " risk-mark-link" : ""}" title="${label}">${NY.escapeHTML(
        text.slice(item.start, item.end)
      )}</mark>`;
      cursor = item.end;
    }
    html += NY.escapeHTML(text.slice(cursor));
    return html;
  }
  function buildSpeechText(result) {
    const findings = result.findings.length
      ? `发现${result.findings.length}个可疑点：${result.findings
        .slice(0, 3)
        .map((finding) => finding.title)
        .join(";")}。`
      : "没有发现常见的诈骗话术。";
    const actions = result.actions.map((action, index) => `第${index + 1},${action}`).join(" ");
    return `识别结果是${result.label}，风险评分${result.score}分。${result.summary}${findings}${actions} 记住一句话：${result.mantra}`;
  }
  function buildShareText(result) {
    const findings = result.findings.length
      ? `\n可疑点:${result.findings.map((finding) => finding.title).join("、")}`
      : "\n可疑点:暂未发现常见骗术特征";
    const actions = result.actions.map((action, index) => `${index + 1}. ${action}`).join("\n");
    return `【银龄无诈 · AI 反诈识别】\n风险:${result.label}（风险分 ${result.score}/100)\n${result.summary}${findings}\n\n建议这样做：\n${actions}\n\n${result.mantra}\n\n（识别结果仅供参考，遇到转账请先核实或拨打 96110。）`;
  }
  function renderHistory() {
    const section = $("#historySection");
    const list = $("#historyList");
    if (!section || !list) return;
    const history = NY.getJSON(HISTORY_KEY, []);
    const valid = Array.isArray(history) ? history.filter((item) => item && item.result) : [];
    if (!valid.length) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }
    section.hidden = false;
    list.innerHTML = valid
      .slice(0, 6)
      .map(
        (item, index) => `
        <button class="history-item" type="button" data-history-index="${index}">
          <span class="history-risk risk-${item.result.level}">${NY.escapeHTML(item.result.label)}</span>
          <span class="history-main">
            <strong>${NY.escapeHTML(item.preview || "识别记录")}</strong>
            <span>${NY.escapeHTML(item.timeLabel || NY.formatTime(item.time))}</span>
          </span>
          <span class="history-score"><strong>${Number(item.result.score) || 0}</strong><small>风险分</small></span>
          <span class="history-open">再看看<span data-icon="chevron-right"></span></span>
        </button>`
      )
      .join("");
    NY.icons(list);
  }
  function saveHistory(result) {
    const history = NY.getJSON(HISTORY_KEY, []);
    const list = Array.isArray(history) ? history : [];
    const preview = result.text.replace(/\s+/g, " ").trim().slice(0, 80);
    const entry = {
      time: new Date().toISOString(),
      timeLabel: NY.formatTime(new Date()),
      preview: preview + (result.text.trim().length > 80 ? "…" : ""),
      result,
    };
    const deduped = list.filter((item) => item && item.result && item.result.text !== result.text);
    deduped.unshift(entry);
    NY.writeJSON(HISTORY_KEY, deduped.slice(0, 6));
  }
  function loadHistoryItem(index) {
    const history = NY.getJSON(HISTORY_KEY, []);
    if (!Array.isArray(history) || !history[index] || !history[index].result) return;
    const result = history[index].result;
    const input = $("#messageInput");
    if (input) input.value = result.text;
    updateCharCount();
    setInputError("");
    currentResult = result;
    renderResult(result);
    const section = $("#resultSection");
    if (section) {
      section.hidden = false;
      window.setTimeout(() => {
        const heading = $("#resultHeading");
        if (heading) heading.focus({ preventScroll: true });
        section.scrollIntoView({
          behavior: NY.getSettings().reduceMotion ? "auto" : "smooth",
          block: "start",
        });
      }, 60);
    }
  }
  function clearInput() {
    const input = $("#messageInput");
    if (!input) return;
    input.value = "";
    updateCharCount();
    setInputError("");
    const section = $("#resultSection");
    if (section) section.hidden = true;
    const status = $("#analysisStatus");
    if (status) status.textContent = "输入内容已清空。";
    input.focus();
  }
  function fillSample(key) {
    const input = $("#messageInput");
    if (!input || !SAMPLES[key]) return;
    input.value = SAMPLES[key];
    updateCharCount();
    setInputError("");
    const section = $("#resultSection");
    if (section) section.hidden = true;
    const status = $("#analysisStatus");
    if (status) status.textContent = "示例内容已填入，可以开始识别。";
    NY.showToast("示例已经填好了，点“开始 AI 识别”试试。", "warm");
    const button = $("#analyzeBtn");
    if (button) {
      window.setTimeout(() => {
        button.scrollIntoView({
          behavior: NY.getSettings().reduceMotion ? "auto" : "smooth",
          block: "center",
        });
      }, 120);
    }
  }
  function initVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const button = $("#voiceInputBtn");
    const label = $("#voiceBtnLabel");
    const status = $("#voiceStatus");
    if (!SpeechRecognition) {
      if (button) {
        button.classList.add("is-unavailable");
        button.setAttribute("title", "当前浏览器不支持语音输入");
      }
      if (label) label.textContent = "语音输入（不可用）";
      return;
    }
    const resetVoice = () => {
      isListening = false;
      if (button) {
        button.classList.remove("is-listening");
        button.setAttribute("aria-pressed", "false");
      }
      if (label) label.textContent = "语音输入";
      if (status) status.textContent = "";
    };
    button.addEventListener("click", () => {
      if (isListening) {
        try {
          speechRecognition.stop();
        } catch (error) {
          /* 已停止 */
        }
        return;
      }
      voiceBaseText = $("#messageInput").value.trim();
      speechRecognition = new SpeechRecognition();
      speechRecognition.lang = "zh-CN";
      speechRecognition.continuous = false;
      speechRecognition.interimResults = true;
      speechRecognition.maxAlternatives = 1;
      speechRecognition.onstart = () => {
        isListening = true;
        button.classList.add("is-listening");
        button.setAttribute("aria-pressed", "true");
        label.textContent = "正在听…点击停止";
        status.textContent = "请慢慢说，说完会自动停止。";
      };
      speechRecognition.onresult = (event) => {
        let finalText = "";
        let interimText = "";
        for (let index = 0; index < event.results.length; index += 1) {
          const transcript = event.results[index][0].transcript;
          if (event.results[index].isFinal) finalText += transcript;
          else interimText += transcript;
        }
        const transcript = (finalText + interimText).trim();
        const input = $("#messageInput");
        if (input) {
          input.value = `${voiceBaseText}${voiceBaseText && transcript ? "\n" : ""}${transcript}`;
          updateCharCount();
        }
      };
      speechRecognition.onerror = (event) => {
        const message =
          event.error === "not-allowed"
            ? "没有获得麦克风权限，请在浏览器里允许后重试。"
            : event.error === "no-speech"
              ? "没有听见声音，请靠近一点再说。"
              : "语音输入没有成功，请再试一次。";
        status.textContent = message;
        NY.showToast(message, "error");
      };
      speechRecognition.onend = () => {
        resetVoice();
      };
      try {
        speechRecognition.start();
      } catch (error) {
        resetVoice();
        NY.showToast("语音输入暂时无法启动，请稍后再试。", "error");
      }
    });
  }
  function bindResultActions() {
    const card = $("#resultCard");
    if (!card) return;
    card.addEventListener("click", (event) => {
      const readButton = event.target.closest("[data-result-read]");
      if (readButton) {
        if (currentResult) NY.speakText(buildSpeechText(currentResult), readButton);
        return;
      }
      const shareButton = event.target.closest("[data-result-share]");
      if (shareButton) {
        if (currentResult) {
          NY.shareText({
            title: "银龄无诈 · AI 反诈识别结果",
            text: buildShareText(currentResult),
          });
        }
        return;
      }
      const againButton = event.target.closest("[data-result-again]");
      if (againButton) {
        const input = $("#messageInput");
        const section = $("#resultSection");
        if (section) section.hidden = true;
        if (input) {
          input.focus();
          input.scrollIntoView({
            behavior: NY.getSettings().reduceMotion ? "auto" : "smooth",
            block: "center",
          });
        }
      }
    });
  }
  function init() {
    const input = $("#messageInput");
    const analyzeBtn = $("#analyzeBtn");
    const clearBtn = $("#clearInputBtn");
    const readBtn = $("#readInputBtn");
    const pasteBtn = $("#pasteInputBtn");
    const chips = $("#exampleChips");
    const historyList = $("#historyList");
    const clearHistory = $("#clearHistoryBtn");
    const status = $("#analysisStatus");

    input.addEventListener("input", updateCharCount);
    input.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        analyzeNow();
      }
    });
    analyzeBtn.addEventListener("click", analyzeNow);
    clearBtn.addEventListener("click", clearInput);
    readBtn.addEventListener("click", () => {
      const text = input.value.trim();
      if (!text) {
        NY.showToast("还没有可以朗读的内容。", "warm");
        return;
      }
      NY.speakText(text, readBtn);
    });
    pasteBtn.addEventListener("click", async () => {
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== "function") {
        NY.showToast("这个浏览器不能直接读取剪贴板。请长按输入框，选择“粘贴”。", "warm");
        return;
      }
      try {
        const clipboardText = (await navigator.clipboard.readText()).trim();
        if (!clipboardText) {
          NY.showToast("剪贴板里没有文字，请先复制要识别的内容。", "warm");
          return;
        }
        input.value = input.value.trim()
          ? `${input.value.trim()}\n${clipboardText}`
          : clipboardText;
        updateCharCount();
        setInputError("");
        const status = $("#analysisStatus");
        if (status) status.textContent = "已经从剪贴板粘贴内容，可以开始识别。";
        NY.showToast("已经粘贴好了，点“开始 AI 识别”试试。", "warm");
      } catch (error) {
        NY.showToast("浏览器没有允许读取剪贴板。请长按输入框，选择“粘贴”。", "warm");
      }
    });
    chips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-sample]");
      if (button) fillSample(button.dataset.sample);
    });
    historyList.addEventListener("click", (event) => {
      const item = event.target.closest("[data-history-index]");
      if (item) loadHistoryItem(Number(item.dataset.historyIndex));
    });
    const originalClearLabel = clearHistory.innerHTML;
    clearHistory.addEventListener("click", () => {
      if (!clearHistoryArmed) {
        clearHistoryArmed = true;
        clearHistory.innerHTML = `<span data-icon="alert-circle"></span>再点一次确认清空`;
        NY.icons(clearHistory);
        NY.showToast("再点一次，就会清空所有识别记录。", "warm");
        clearHistoryTimer = window.setTimeout(() => {
          clearHistoryArmed = false;
          clearHistory.innerHTML = originalClearLabel;
          NY.icons(clearHistory);
        }, 5000);
        return;
      }
      window.clearTimeout(clearHistoryTimer);
      clearHistoryArmed = false;
      clearHistory.innerHTML = originalClearLabel;
      NY.icons(clearHistory);
      NY.writeJSON(HISTORY_KEY, []);
      renderHistory();
      NY.showToast("识别记录已清空");
    });
    bindResultActions();
    initVoiceInput();
    renderHistory();
    updateCharCount();
    const demoKey = new URLSearchParams(window.location.search).get("demo");
    if (demoKey && SAMPLES[demoKey]) {
      input.value = SAMPLES[demoKey];
      updateCharCount();
      window.setTimeout(analyzeNow, 320);
    }
  }
  document.addEventListener("DOMContentLoaded", init);
})();