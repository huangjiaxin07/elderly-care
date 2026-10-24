/* =========================================================
   手机课堂：课程、学习进度、反诈小测验
   ========================================================= */

(function () {
  "use strict";

  const NY = window.YinLing;
  const COMPLETED_KEY = "yinling.learning.v1";
  const QUIZ_BEST_KEY = "yinling.quizBest.v1";

  const CATEGORY_LABELS = {
    basic: "基础入门",
    safety: "安全防骗",
    life: "生活办事",
  };

  const LESSONS = [
    {
      id: "video",
      category: "basic",
      icon: "video",
      tone: "green",
      duration: "5 分钟",
      level: "入门",
      title: "视频通话，其实只要三步",
      summary: "从找到按钮，到看见家人的脸。",
      intro: "微信视频通话只需要点两下。学会以后，想孩子了就能看看他们的脸。",
      steps: [
        "打开微信，在聊天列表里找到家人，点进去。",
        "点右下角的“+”号，在弹出的菜单里点“视频通话”。",
        "等对方接听。如果听不见声音，点屏幕上的“扬声器”。",
        "想切换前后摄像头，点“切换摄像头”；聊完了，点红色的挂断按钮。",
        "如果画面卡住，挂断后换成语音通话，或过一会儿再试。",
      ],
      tip: "陌生人要求视频通话并让您共享屏幕、转账的，立刻挂断。",
    },
    {
      id: "voice",
      category: "basic",
      icon: "mic",
      tone: "gold",
      duration: "4 分钟",
      level: "入门",
      title: "用微信给家人发一条语音",
      summary: "不用打字，按住说话就好。",
      intro: "不习惯拼音打字，可以直接说话。声音发过去，家人马上就能听见。",
      steps: [
        "打开要说话的家人聊天窗口。",
        "在屏幕底部找到“按住说话”按钮，用手指按住不要松。",
        "对着手机底部的话筒，慢慢说想说的话。",
        "说完松开手指，语音就会发出去。",
        "如果说错了，松手后马上点“取消”，就可以重新录。",
      ],
      tip: "语音里不要说银行卡密码、验证码或身份证号，哪怕对方听起来像家人。",
    },
    {
      id: "font",
      category: "basic",
      icon: "type",
      tone: "plum",
      duration: "4 分钟",
      level: "入门",
      title: "把手机上的字调大一点",
      summary: "字大一点，眼睛就轻松一点。",
      intro: "手机字太小，不用硬撑。调大字号不会弄坏手机，随时可以调回来。",
      steps: [
        "在本网站，点右上角的“大字模式”，字会立刻变大；再点一下就能关闭。",
        "苹果手机：打开“设置” → “显示与亮度” → “文字大小”，向右拖动滑块。",
        "安卓手机：打开“设置” → “显示” → “字体大小”，选择大一号的字。",
        "微信里也能单独调：点“我” → “设置” → “通用” → “字体大小”。",
        "如果调得太大，按钮显示不全，就往回调小一档，舒服最重要。",
      ],
      tip: "如果子女帮您设置过，不要随便点“恢复默认”，以免原来的设置丢失。",
    },
    {
      id: "fake-link",
      category: "safety",
      icon: "link",
      tone: "clay",
      duration: "6 分钟",
      level: "防骗",
      title: "收到陌生链接，先别点",
      summary: "三步辨认，不让手指比脑子快。",
      intro: "短信、微信里突然出现的链接，可能是仿冒网站。点开之前，先想一想。",
      steps: [
        "先停一下：不认识的号码、群聊里突然发的链接，都不要点。",
        "看是谁发的。即使是熟人，也可能手机被盗，先打电话问一句。",
        "看链接说的是什么事。说您中奖、快递丢失、账户异常的，先不要信。",
        "要办理业务，关掉链接，从官方 App、官网或银行卡背面的电话进入。",
        "万一点开了，不要填写身份证、银行卡、验证码，立刻退出并告诉家人。",
      ],
      tip: "真正的中奖不会先让您交钱；真正的退款不会让您点陌生链接、给验证码。",
    },
    {
      id: "fake-customer",
      category: "safety",
      icon: "phone-call",
      tone: "red",
      duration: "7 分钟",
      level: "防骗",
      title: "客服来电说退款，先挂断",
      summary: "不跟着操作，就不会掉进圈套。",
      intro: "“您的百万保障要扣费”“快递丢了双倍理赔”，这些都是常见开头。记住几句关键的话。",
      steps: [
        "先不要按照对方说的做，尤其不要转账、不要给验证码。",
        "问自己：我最近真的买过、办过这个业务吗？想不起来，就先挂断。",
        "挂断后，从购物 App、银行 App 的官方客服入口重新核实。",
        "对方让您下载会议软件、共享屏幕的，立刻拒绝并挂断。",
        "拿不准就拨打 96110 反诈专线，或把电话内容告诉家人。",
      ],
      tip: "正规客服不会让您去没人的地方接电话，也不会让您瞒着家人。",
    },
    {
      id: "appointment",
      category: "life",
      icon: "calendar",
      tone: "blue",
      duration: "7 分钟",
      level: "生活",
      title: "用手机预约挂号",
      summary: "提前约好，少排队少跑空。",
      intro: "挂号不需要找熟人，也不需要找“代挂号”。认准医院官方入口，自己就能办。",
      steps: [
        "准备好身份证、医保卡或电子医保凭证，还有能收短信的手机。",
        "在微信顶部搜索“医院全称 + 预约挂号”，认准官方或医院认证标识。",
        "选择科室、医生和日期。不知道挂什么科，可以先打医院电话问。",
        "填写就诊人信息，确认医保支付，核对挂号费后再提交。",
        "截屏保存“预约成功”页面，按医院提示提前 15–30 分钟到院签到。",
      ],
      tip: "不要向私人账户转“挂号费”。正规医院不会通过个人微信收挂号费。",
    },
  ];

  const QUESTIONS = [
    {
      question: "接到自称“公安局”的电话，说您涉嫌洗钱，要求把钱转到“安全账户”，正确做法是？",
      options: [
        "按对方要求转账，配合调查",
        "挂断电话，告诉家人或拨打 96110 核实",
        "先加对方微信，聊清楚再说",
      ],
      correct: 1,
      explanation: "公安机关不会通过电话办案，也没有所谓的“安全账户”。遇到这种电话，直接挂断并核实。",
    },
    {
      question: "微信里收到一条“点击领取免费鸡蛋”的陌生链接，应该怎么办？",
      options: [
        "马上点开，反正是免费的",
        "先转发给朋友，一起领",
        "不点开，删掉或告诉家人",
      ],
      correct: 2,
      explanation: "“免费领”常常是骗取个人信息或诱导下载的入口。陌生链接不点，免费的东西也不要贪。",
    },
    {
      question: "家人突然用新号码发消息，说手机丢了、急需借钱，应该怎么办？",
      options: [
        "立刻转账，家人肯定有急事",
        "用原来保存的号码回拨，确认是不是本人",
        "先转一半，剩下的见面再说",
      ],
      correct: 1,
      explanation: "头像和声音都可能被冒充。涉及借钱，一定先用原来存的号码回拨，或问一个只有家人知道的问题。",
    },
    {
      question: "“客服”说您的百万保障要扣费，让您下载会议软件并共享屏幕关闭，应该怎么做？",
      options: [
        "按对方说的做，早点关闭扣费",
        "下载软件，但只共享一小会儿",
        "挂断，从官方 App 或电话核实",
      ],
      correct: 2,
      explanation: "屏幕共享会让对方看到验证码和银行页面。正规客服不会要求下载会议软件、共享屏幕。",
    },
  ];

  const state = {
    filter: "all",
    currentLesson: null,
    quizIndex: 0,
    quizScore: 0,
    quizAnswered: false,
    quizFinished: false,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function getCompleted() {
    const data = NY.getJSON(COMPLETED_KEY, []);
    if (!Array.isArray(data)) return [];
    return data.filter((id) => LESSONS.some((lesson) => lesson.id === id));
  }

  function isCompleted(id) {
    return getCompleted().includes(id);
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
  }

  function renderLessons() {
    const grid = $("#lessonGrid");
    if (!grid) return;
    const list = LESSONS.filter((lesson) => state.filter === "all" || lesson.category === state.filter);
    const completed = getCompleted();

    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = list
      .map((lesson, index) => {
        const done = completed.includes(lesson.id);
        return `
          <button class="learn-card${done ? " is-complete" : ""}" type="button" data-lesson="${lesson.id}" aria-label="${done ? "复习" : "学习"}课程：${lesson.title}">
            <span class="learn-cover cover-tone-${lesson.tone}">
              <span class="learn-cover-number">${String(index + 1).padStart(2, "0")}</span>
              <span class="learn-cover-icon"><span data-icon="${lesson.icon}"></span></span>
              <span class="learn-cover-label">${categoryLabel(lesson.category)}</span>
              ${done ? '<span class="learn-complete-badge"><span data-icon="check"></span>已学会</span>' : ""}
            </span>
            <span class="learn-card-body">
              <span class="learn-meta">
                <span><span data-icon="clock"></span>${lesson.duration}</span>
                <span>·</span>
                <span>${lesson.level}</span>
              </span>
              <h3>${lesson.title}</h3>
              <p>${lesson.summary}</p>
              <span class="learn-card-footer">
                ${done ? "再复习一遍" : "开始学习"}
                <span data-icon="arrow-right"></span>
              </span>
            </span>
          </button>`;
      })
      .join("");

    NY.icons(grid);
  }

  function updateProgress() {
    const completed = getCompleted();
    const total = LESSONS.length;
    const count = completed.length;
    const percent = Math.round((count / total) * 100);
    const ring = $("#progressRing");
    const countNode = $("#completedCount");
    const headline = $("#progressHeadline");
    const sub = $("#progressSub");
    const continueBtn = $("#continueLearning");

    if (ring) {
      ring.style.setProperty("--progress", String(percent));
      ring.setAttribute("aria-label", `已完成 ${count} 节课，共 ${total} 节`);
    }
    if (countNode) countNode.textContent = String(count);

    if (count === 0) {
      if (headline) headline.textContent = "从第一课开始吧";
      if (sub) sub.textContent = "每节课只要几分钟，慢慢来。";
    } else if (count >= total) {
      if (headline) headline.textContent = "六节课都学完了";
      if (sub) sub.textContent = "真了不起，随时可以回来复习。";
    } else {
      if (headline) headline.textContent = `已经学会 ${count} 课`;
      if (sub) sub.textContent = `还有 ${total - count} 课，不着急，慢慢学。`;
    }

    if (continueBtn) {
      const next = LESSONS.find((lesson) => !completed.includes(lesson.id)) || LESSONS[0];
      const label = count === 0 ? "开始第一课" : count >= total ? "再复习一遍" : "接着上次学";
      continueBtn.dataset.lesson = next.id;
      continueBtn.innerHTML = `${label}<span data-icon="arrow-right"></span>`;
      NY.icons(continueBtn);
    }
  }

  function openLesson(id) {
    const lesson = LESSONS.find((item) => item.id === id);
    if (!lesson) return;
    state.currentLesson = lesson;
    const dialog = $("#lessonDialog");
    const content = $("#lessonDialogContent");
    if (!dialog || !content) return;
    const done = isCompleted(lesson.id);

    content.innerHTML = `
      <div class="lesson-dialog-head tone-${lesson.tone}">
        <span class="lesson-dialog-icon"><span data-icon="${lesson.icon}"></span></span>
        <span class="lesson-dialog-category"><span data-icon="book-open"></span>${categoryLabel(lesson.category)} · 手机小课堂</span>
        <h2 id="lessonDialogTitle" tabindex="-1">${lesson.title}</h2>
        <p>${lesson.intro}</p>
        <div class="lesson-dialog-meta">
          <span><span data-icon="clock"></span>${lesson.duration}</span>
          <span><span data-icon="list"></span>${lesson.steps.length} 步</span>
          <span><span data-icon="user"></span>${lesson.level}</span>
        </div>
      </div>
      <div class="lesson-dialog-body">
        ${done ? '<div class="lesson-finished-banner"><span data-icon="check-circle"></span>这节课您已经学会啦，可以随时回来复习。</div>' : ""}
        <h3 class="lesson-block-title"><span data-icon="list"></span>一步一步来</h3>
        <ol class="lesson-steps">
          ${lesson.steps
            .map(
              (step, index) => `
            <li class="lesson-step">
              <span class="lesson-step-number">${index + 1}</span>
              <p>${step}</p>
            </li>`
            )
            .join("")}
        </ol>
        <div class="lesson-tip">
          <span data-icon="shield-check"></span>
          <p><strong>记住这一点：</strong>${lesson.tip}</p>
        </div>
        <div class="lesson-dialog-actions">
          <button class="btn btn-secondary" type="button" data-lesson-read>
            <span class="btn-icon" data-icon="volume"></span>读给我听
          </button>
          <button class="btn btn-secondary" type="button" data-lesson-copy>
            <span class="btn-icon" data-icon="copy"></span>复制步骤
          </button>
          <button class="btn btn-primary${done ? " is-complete" : ""}" type="button" data-lesson-complete ${done ? "disabled" : ""}>
            <span class="btn-icon" data-icon="check"></span>${done ? "已经学会" : "我学会了"}
          </button>
        </div>
      </div>`;

    NY.icons(content);

    content.querySelector("[data-lesson-read]").addEventListener("click", (event) => {
      NY.speakText(buildLessonSpeech(lesson), event.currentTarget);
    });

    content.querySelector("[data-lesson-copy]").addEventListener("click", () => {
      NY.copyText(buildLessonCopy(lesson));
    });

    const completeButton = content.querySelector("[data-lesson-complete]");
    if (completeButton) {
      completeButton.addEventListener("click", () => {
        if (isCompleted(lesson.id)) return;
        const completed = getCompleted();
        completed.push(lesson.id);
        NY.writeJSON(COMPLETED_KEY, completed);
        completeButton.disabled = true;
        completeButton.classList.add("is-complete");
        completeButton.innerHTML = '<span class="btn-icon" data-icon="check"></span>已经学会';
        NY.icons(completeButton);

        if (!content.querySelector(".lesson-finished-banner")) {
          const banner = document.createElement("div");
          banner.className = "lesson-finished-banner";
          banner.innerHTML = '<span data-icon="check-circle"></span>这节课您已经学会啦，可以随时回来复习。';
          const body = content.querySelector(".lesson-dialog-body");
          if (body) body.prepend(banner);
          NY.icons(banner);
        }

        renderLessons();
        updateProgress();
        NY.showToast("真棒，又学会一课。慢慢来，不着急。");
        if (NY.getSettings().autoRead) NY.speakText("这节课您已经学会了。");
      });
    }

    NY.openDialog(dialog);
    try {
      window.history.replaceState(null, "", `${window.location.pathname}?lesson=${lesson.id}`);
    } catch (error) {
      /* 忽略 */
    }

    window.setTimeout(() => {
      const heading = content.querySelector("#lessonDialogTitle");
      if (heading) heading.focus({ preventScroll: true });
    }, 80);
  }

  function buildLessonSpeech(lesson) {
    return `${lesson.title}。${lesson.intro}${lesson.steps
      .map((step, index) => `第${index + 1}步，${step}`)
      .join(" ")} 记住这一点：${lesson.tip}`;
  }

  function buildLessonCopy(lesson) {
    return `【银龄无诈 · 手机课堂】${lesson.title}\n\n${lesson.intro}\n\n${lesson.steps
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n")}\n\n温馨提示：${lesson.tip}`;
  }

  /* ---------- 反诈小测验 ---------- */

  function getBestQuiz() {
    const data = NY.getJSON(QUIZ_BEST_KEY, null);
    if (!data || typeof data.percent !== "number") return null;
    return data;
  }

  function updateBestDisplay(best) {
    const node = $("#quizBest");
    if (!node) return;
    node.textContent = best ? `${best.score} / ${QUESTIONS.length} 题` : "还没有作答";
  }

  function renderQuizQuestion() {
    const card = $("#quizCard");
    if (!card) return;
    const question = QUESTIONS[state.quizIndex];
    const letters = ["A", "B", "C", "D"];
    const progress = ((state.quizIndex + 1) / QUESTIONS.length) * 100;

    state.quizAnswered = false;

    card.innerHTML = `
      <div class="quiz-card-head">
        <span class="quiz-counter" id="quizCounter">第 ${state.quizIndex + 1} / ${QUESTIONS.length} 题</span>
        <div class="quiz-progress-track" aria-hidden="true"><span style="width:${progress}%"></span></div>
      </div>
      <h3 class="quiz-question" id="quizQuestion" tabindex="-1">${question.question}</h3>
      <div class="quiz-options" role="group" aria-labelledby="quizQuestion">
        ${question.options
          .map(
            (option, index) => `
          <button class="quiz-option" type="button" data-quiz-option="${index}">
            <span class="quiz-option-letter">${letters[index]}</span>
            <span>${option}</span>
          </button>`
          )
          .join("")}
      </div>
      <div class="quiz-feedback" id="quizFeedback" hidden>
        <span class="quiz-feedback-icon" id="quizFeedbackIcon"><span data-icon="check-circle"></span></span>
        <p id="quizFeedbackText"></p>
      </div>
      <div class="quiz-footer">
        <span class="quiz-hint" id="quizHint">请选择一个答案</span>
        <button class="btn btn-primary btn-sm" id="quizNext" type="button" hidden>
          下一题<span data-icon="arrow-right"></span>
        </button>
      </div>`;

    NY.icons(card);
  }

  function answerQuiz(optionIndex) {
    if (state.quizAnswered) return;
    const card = $("#quizCard");
    const question = QUESTIONS[state.quizIndex];
    if (!card || !question) return;

    state.quizAnswered = true;
    const correct = optionIndex === question.correct;
    if (correct) state.quizScore += 1;

    const buttons = card.querySelectorAll("[data-quiz-option]");
    buttons.forEach((button, index) => {
      button.disabled = true;
      if (index === question.correct) button.classList.add("is-correct");
      else if (index === optionIndex) button.classList.add("is-wrong");
      else button.classList.add("is-dimmed");
    });

    const feedback = card.querySelector("#quizFeedback");
    const feedbackText = card.querySelector("#quizFeedbackText");
    const feedbackIcon = card.querySelector("#quizFeedbackIcon");
    const hint = card.querySelector("#quizHint");
    const next = card.querySelector("#quizNext");

    if (feedback && feedbackText && feedbackIcon) {
      feedback.hidden = false;
      feedback.classList.toggle("is-wrong", !correct);
      feedbackIcon.innerHTML = `<span data-icon="${correct ? "check-circle" : "alert-circle"}"></span>`;
      NY.icons(feedbackIcon);

      const correctLetter = ["A", "B", "C", "D"][question.correct];
      feedbackText.innerHTML = correct
        ? `<strong>答对了。</strong>${question.explanation}`
        : `<strong>这次没选对，正确答案是 ${correctLetter}。</strong>${question.explanation}`;
    }

    if (hint) hint.textContent = correct ? "很好，继续保持。" : "别急，记住这个细节就好。";
    if (next) {
      next.hidden = false;
      next.innerHTML =
        state.quizIndex >= QUESTIONS.length - 1
          ? '看结果<span data-icon="arrow-right"></span>'
          : '下一题<span data-icon="arrow-right"></span>';
      NY.icons(next);
      next.focus({ preventScroll: true });
    }
  }

  function renderQuizResult() {
    const card = $("#quizCard");
    if (!card) return;
    state.quizFinished = true;
    const total = QUESTIONS.length;
    const percent = Math.round((state.quizScore / total) * 100);
    let title = "";
    let message = "";

    if (percent === 100) {
      title = "全部答对，真稳当！";
      message = "您已经记住了这些常见骗局。遇到拿不准的事，也别忘了先和家人或 96110 核实。";
    } else if (percent >= 75) {
      title = "答得不错，再记牢一个细节";
      message = "大部分情况您都能判断对。把答错的那道再看一遍，就更稳妥了。";
    } else if (percent >= 50) {
      title = "有进步，慢慢来";
      message = "有些骗局会故意绕弯子。记住一句话：让您转账、点链接、给验证码的，先停下来。";
    } else {
      title = "没关系，再学一遍就好";
      message = "骗子的话术会变，但目的都一样：让您着急转钱。回到安全课再看一遍，会更有把握。";
    }

    const previous = getBestQuiz();
    const isNewBest = !previous || percent > previous.percent;
    const bestToSave = isNewBest
      ? { score: state.quizScore, total, percent, date: new Date().toISOString() }
      : previous;
    NY.writeJSON(QUIZ_BEST_KEY, bestToSave);
    updateBestDisplay(bestToSave);

    card.innerHTML = `
      <div class="quiz-result">
        <div class="quiz-result-ring" style="--result:${percent}" role="img" aria-label="答对 ${state.quizScore} 题，共 ${total} 题">
          <div class="quiz-result-score"><strong>${state.quizScore}</strong><span>/ ${total} 题</span></div>
        </div>
        <h3 tabindex="-1">${title}</h3>
        <p>${message}</p>
        ${isNewBest ? '<span class="quiz-result-badge"><span data-icon="sparkles"></span>刷新了最好成绩</span>' : ""}
        <div class="quiz-result-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-quiz-restart>
            <span class="btn-icon" data-icon="refresh"></span>再做一遍
          </button>
          <a class="btn btn-primary btn-sm" href="#lesson-grid">
            回到课程<span data-icon="arrow-right"></span>
          </a>
        </div>
      </div>`;

    NY.icons(card);
    const heading = card.querySelector("h3");
    if (heading) heading.focus({ preventScroll: true });
  }

  function nextQuiz() {
    if (!state.quizAnswered) return;
    if (state.quizIndex >= QUESTIONS.length - 1) {
      renderQuizResult();
      return;
    }
    state.quizIndex += 1;
    renderQuizQuestion();
  }

  function restartQuiz() {
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    state.quizFinished = false;
    renderQuizQuestion();
  }

  function bindQuiz() {
    const card = $("#quizCard");
    if (!card) return;

    card.addEventListener("click", (event) => {
      const option = event.target.closest("[data-quiz-option]");
      if (option) {
        answerQuiz(Number(option.dataset.quizOption));
        return;
      }
      const next = event.target.closest("#quizNext");
      if (next) {
        nextQuiz();
        return;
      }
      const restart = event.target.closest("[data-quiz-restart]");
      if (restart) restartQuiz();
    });

    updateBestDisplay(getBestQuiz());
    renderQuizQuestion();
  }

  function init() {
    const grid = $("#lessonGrid");
    const filters = $("#lessonFilters");
    const continueBtn = $("#continueLearning");
    const dialog = $("#lessonDialog");

    grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-lesson]");
      if (card) openLesson(card.dataset.lesson);
    });

    filters.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      state.filter = button.dataset.filter;
      filters.querySelectorAll("[data-filter]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      renderLessons();
    });

    continueBtn.addEventListener("click", (event) => {
      event.preventDefault();
      const id = continueBtn.dataset.lesson;
      if (id) openLesson(id);
    });

    dialog.addEventListener("close", () => {
      state.currentLesson = null;
      try {
        window.history.replaceState(null, "", window.location.pathname);
      } catch (error) {
        /* 忽略 */
      }
    });

    renderLessons();
    updateProgress();
    bindQuiz();

    const params = new URLSearchParams(window.location.search);
    const requested = params.get("lesson");
    if (requested && LESSONS.some((lesson) => lesson.id === requested)) {
      window.setTimeout(() => openLesson(requested), 200);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
