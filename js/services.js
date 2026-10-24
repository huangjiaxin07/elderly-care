/* =========================================================
   便民服务页：服务检索、步骤弹窗与亲情电话
   ========================================================= */

(function () {
  "use strict";

  const NY = window.YinLing;

  const CATEGORY_LABELS = {
    medical: "看病就医",
    social: "社保医保",
    life: "生活缴费",
    travel: "出行联系",
  };

  const SERVICES = [
    {
      id: "appointment",
      category: "medical",
      icon: "calendar",
      tone: "green",
      title: "预约医院挂号",
      summary: "提前约好时间，少排队、少跑空。",
      intro: "用手机提前挂号，到了医院直接签到就诊。第一次操作，最好让家人陪在旁边。",
      duration: "约 3 分钟",
      level: "第一次做，建议家人陪同",
      keywords: ["挂号", "医院", "看病", "预约", "科室", "门诊"],
      needs: ["身份证", "医保卡或电子医保凭证", "能收短信的手机"],
      steps: [
        "先想好要去哪家医院、看哪个科。拿不准挂什么科，可以打医院咨询电话，或到导诊台问。",
        "打开微信，点右上角搜索，输入“医院全称 + 预约挂号”。认准带有“官方”或医院认证标识的公众号、小程序。",
        "进入后点“预约挂号”，选择科室和医生。第一次去可以先挂普通号，复诊按医生建议选择。",
        "选好日期和时间，看清“有号”再点。添加就诊人信息时，身份证号和手机号要填对。",
        "确认挂号费和医保支付方式，核对金额后再提交。不要向任何私人账户转“挂号费”。",
        "把预约成功页面截屏保存。按医院提示提前 15–30 分钟到院签到；去不了要提前取消，以免影响以后预约。",
      ],
      tip: "任何说能“内部留号”“代挂号”并让您私下转账的，都不要相信。所有挂号请走医院官方入口。",
    },
    {
      id: "medical-insurance",
      category: "social",
      icon: "id-card",
      tone: "blue",
      title: "查医保余额和消费记录",
      summary: "看病买药花了多少，心里有个数。",
      intro: "通过国家医保服务平台或医保电子凭证，查看自己的医保余额和近期消费。",
      duration: "约 4 分钟",
      level: "需要进行人脸认证",
      keywords: ["医保", "余额", "消费记录", "医保卡", "电子凭证", "买药"],
      needs: ["本人身份证", "手机", "本人人脸识别"],
      steps: [
        "打开手机应用商店，搜索“国家医保服务平台”，认准国家医保局官方 App；也可以在微信或支付宝搜索“医保电子凭证”。",
        "按提示完成登录和实名认证。需要人脸识别时，找光线明亮的地方，按提示眨眼、张嘴。",
        "在首页找到“个人参保信息”或“医保账户”，就能看到医保余额和参保状态。",
        "点“消费记录”或“就医记录”，可以查看近期看病、买药的明细。",
        "金额有疑问，拨打参保地医保服务热线 12393，或带上身份证、医保卡到医保大厅咨询。",
      ],
      tip: "不要通过陌生人发来的“医保补贴”“账户异常”链接登录，也不要透露短信验证码。",
    },
    {
      id: "social-security",
      category: "social",
      icon: "bank",
      tone: "gold",
      title: "社保待遇资格认证",
      summary: "每年一次，在家刷脸就能办。",
      intro: "领取养老金的老人，有的地区需要定期做待遇资格认证。不会操作可以去社区请工作人员帮忙。",
      duration: "约 5 分钟",
      level: "需要本人刷脸",
      keywords: ["社保", "养老金", "资格认证", "认证", "人脸", "12333"],
      needs: ["本人身份证", "手机", "本人人脸识别"],
      steps: [
        "先确认是否需要认证。可以拨打 12333 人社服务热线，或直接问社区工作人员。",
        "在应用商店搜索当地人社 App，或在微信、支付宝搜索“电子社保卡”小程序，认准官方标识。",
        "登录后找到“待遇资格认证”或“社保待遇领取资格认证”，按提示填写姓名、身份证号。",
        "按屏幕提示进行人脸识别，可能需要眨眼、张嘴。找光线均匀的地方，不要戴帽子或口罩。",
        "看到“认证成功”后截屏保存。行动不便的老人，可以联系社区申请上门认证。",
      ],
      tip: "资格认证不需要交费。任何收费“代办认证”、索要银行卡密码的，都不要相信。",
    },
    {
      id: "utilities",
      category: "life",
      icon: "bolt",
      tone: "clay",
      title: "交水费、电费、燃气费",
      summary: "不出门，也不用去排队。",
      intro: "用微信或支付宝的生活缴费功能，输入户号，就能在家交水电燃气费。",
      duration: "约 4 分钟",
      level: "第一次建议家人陪同",
      keywords: ["水费", "电费", "燃气费", "缴费", "户号", "生活缴费"],
      needs: ["最近一期账单或户号", "手机", "支付密码"],
      steps: [
        "找出最近一期的水费、电费或燃气费账单，看清“户号”和户名。户号通常在账单上方，是一串数字。",
        "打开微信，点“我” → “服务” → “生活缴费”；也可以在支付宝搜索“生活缴费”。",
        "选择“水费”“电费”或“燃气费”，再确认所在城市和缴费单位。",
        "输入户号，先核对页面上显示的户名和地址，确认是自家账户再继续。",
        "核对欠费金额，点支付并输入支付密码。第一次使用可以让家人陪在身边。",
        "缴费成功后截屏保存。若显示“暂无欠费”，说明已经结清，不用重复交。",
      ],
      tip: "不要向陌生人提供的个人收款码缴费。公共事业费不会要求您转到个人账户。",
    },
    {
      id: "mobile-recharge",
      category: "life",
      icon: "phone",
      tone: "green",
      title: "手机话费充值",
      summary: "号码别输错，几步就能到账。",
      intro: "话费快用完时，用微信或支付宝充值。充值前一定多核对一遍手机号码。",
      duration: "约 2 分钟",
      level: "操作简单",
      keywords: ["话费", "充值", "手机号", "移动", "联通", "电信"],
      needs: ["手机号码", "支付密码"],
      steps: [
        "打开微信“我 → 服务 → 手机充值”，或在支付宝搜索“充值中心”。",
        "输入要充值的手机号码，仔细核对一遍，别输错一个数字。",
        "选择充值金额，例如 50 元或 100 元，看清到账时间。",
        "确认运营商和号码，点“立即充值”并支付。",
        "充值成功后会收到短信。如果没有到账，联系运营商官方客服：移动 10086、联通 10010、电信 10000。",
      ],
      tip: "不要相信“充 100 送 200”的陌生链接，话费优惠请以运营商官方 App 为准。",
    },
    {
      id: "taxi",
      category: "travel",
      icon: "bus",
      tone: "gold",
      title: "用手机叫出租车",
      summary: "在楼下等车，不用站在路边招手。",
      intro: "用微信、支付宝或地图 App 叫车。上车前核对车牌，比什么都重要。",
      duration: "约 5 分钟",
      level: "第一次建议家人陪同",
      keywords: ["打车", "出租车", "网约车", "出行", "高德", "叫车"],
      needs: ["手机和网络", "准确的上下车地点", "可以付款的账户"],
      steps: [
        "打开微信或支付宝，搜索“打车”；也可以打开高德地图，点“打车”。",
        "允许使用定位，地图上会出现一个上车点。拖动地图，把上车点定在小区门口或具体楼栋旁。",
        "在上方输入目的地，例如“某某医院门诊楼”，从列表里选准确地址。",
        "看看预估价格，选择“出租车”或“快车”，再点“呼叫”。",
        "车到了先核对车牌号、车型和司机姓名，和手机上一致再上车。",
        "上车后可以把行程分享给家人；到达后按手机显示的金额付款，不需要给司机现金“加价”。",
      ],
      tip: "不要上私下揽客、没有平台订单的车。夜间出门，尽量让家人陪同。",
    },
    {
      id: "video-call",
      category: "travel",
      icon: "video",
      tone: "blue",
      title: "和家人视频通话",
      summary: "不用打字，看看家人的脸。",
      intro: "微信视频通话只需要点两下。听不见就开扬声器，不想聊了就点红色按钮。",
      duration: "约 4 分钟",
      level: "操作简单",
      keywords: ["视频通话", "微信", "家人", "语音", "打电话"],
      needs: ["手机和网络", "已经添加的家人微信"],
      steps: [
        "打开微信，在聊天列表里找到家人，点进去。",
        "点右下角的“+”号，再点“视频通话”。",
        "等对方接听。如果听不见，点屏幕上的“扬声器”。",
        "想换前后摄像头，点“切换摄像头”；想挂断，点红色的挂断按钮。",
        "如果网络不好，先挂断，换成语音通话，或过一会儿再试。",
      ],
      tip: "陌生人要求视频通话并让您共享屏幕、转账的，立刻挂断。家人借钱，也要先回拨原来的号码确认。",
    },
    {
      id: "courier",
      category: "life",
      icon: "message",
      tone: "clay",
      title: "查快递到哪儿了",
      summary: "输入单号，就知道到哪一站。",
      intro: "在快递公司官方小程序或购物 App 里查看物流，不用点陌生短信里的链接。",
      duration: "约 3 分钟",
      level: "操作简单",
      keywords: ["快递", "物流", "取件码", "运单号", "驿站", "包裹"],
      needs: ["快递单号或取件码", "手机"],
      steps: [
        "先找到快递单号，或看短信里的取件码。",
        "打开微信搜索快递公司名称加“小程序”，例如“顺丰”“中通”，认准官方小程序；也可以在购物 App 里查看物流。",
        "输入运单号，点查询，就能看到快递到了哪里。",
        "如果快递放在驿站，带上取件码和手机去取。取件码不要告诉陌生人。",
        "接到“快递丢失理赔”的电话或短信，先在购物 App 里联系官方客服核实，不要点陌生链接。",
      ],
      tip: "正规快递理赔不会让您先转账，也不会索要银行卡密码和短信验证码。",
    },
  ];

  const state = {
    category: "all",
    query: "",
    currentService: null,
  };

  function $(selector) {
    return document.querySelector(selector);
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
  }

  function filteredServices() {
    const query = state.query.trim().toLowerCase();
    return SERVICES.filter((service) => {
      const categoryMatch = state.category === "all" || service.category === state.category;
      if (!categoryMatch) return false;
      if (!query) return true;
      const haystack = [
        service.title,
        service.summary,
        service.intro,
        categoryLabel(service.category),
        ...(service.keywords || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }

  function renderServices() {
    const grid = $("#serviceGrid");
    const empty = $("#servicesEmpty");
    const count = $("#serviceCount");
    if (!grid || !empty || !count) return;

    const list = filteredServices();
    grid.setAttribute("aria-busy", "false");

    if (!list.length) {
      grid.innerHTML = "";
      grid.hidden = true;
      empty.hidden = false;
      count.textContent = "没有找到相关服务";
      return;
    }

    grid.hidden = false;
    empty.hidden = true;
    count.textContent =
      state.category === "all" && !state.query ? `共 ${SERVICES.length} 项服务` : `找到 ${list.length} 项服务`;

    grid.innerHTML = list
      .map(
        (service) => `
        <button class="service-card" type="button" data-service="${service.id}" aria-label="查看${service.title}的办理步骤">
          <span class="service-card-top">
            <span class="service-icon tone-${service.tone}"><span data-icon="${service.icon}"></span></span>
            <span class="service-category">${categoryLabel(service.category)}</span>
          </span>
          <span class="service-title">${service.title}</span>
          <span class="service-desc">${service.summary}</span>
          <span class="service-card-footer">
            <span><span data-icon="clock"></span>${service.duration}</span>
            <span class="service-open">查看步骤<span data-icon="arrow-right"></span></span>
          </span>
        </button>`
      )
      .join("");

    NY.icons(grid);
  }

  function serviceSpeech(service) {
    return `${service.title}。先准备：${service.needs.join("、")}。${service.steps
      .map((step, index) => `第${index + 1}步，${step}`)
      .join(" ")} 温馨提示：${service.tip}`;
  }

  function serviceCopyText(service) {
    return `【银龄无诈 · ${service.title}】\n\n需要准备：${service.needs.join("、")}\n\n步骤：\n${service.steps
      .map((step, index) => `${index + 1}. ${step}`)
      .join("\n")}\n\n温馨提醒：${service.tip}`;
  }

  function openService(id) {
    const service = SERVICES.find((item) => item.id === id);
    if (!service) return;

    state.currentService = service;
    const dialog = $("#serviceDialog");
    const content = $("#serviceDialogContent");
    if (!dialog || !content) return;

    content.innerHTML = `
      <div class="service-dialog-head">
        <span class="service-dialog-icon"><span data-icon="${service.icon}"></span></span>
        <div>
          <p class="eyebrow">${categoryLabel(service.category)} · 办事指南</p>
          <h2 id="serviceDialogTitle">${service.title}</h2>
          <p>${service.intro}</p>
        </div>
      </div>
      <div class="service-dialog-body">
        <div class="service-meta-row">
          <span class="service-meta-chip"><span data-icon="clock"></span>${service.duration}</span>
          <span class="service-meta-chip"><span data-icon="user"></span>${service.level}</span>
          <span class="service-meta-chip"><span data-icon="list"></span>共 ${service.steps.length} 步</span>
        </div>

        <div class="service-block">
          <h3 class="service-block-title"><span>1</span>先准备这些</h3>
          <ul class="need-list">${service.needs.map((need) => `<li>${need}</li>`).join("")}</ul>
        </div>

        <div class="service-block">
          <h3 class="service-block-title"><span>2</span>跟着做</h3>
          <ol class="service-steps">
            ${service.steps
              .map(
                (step, index) => `
              <li>
                <span class="step-number">${index + 1}</span>
                <p>${step}</p>
              </li>`
              )
              .join("")}
          </ol>
        </div>

        <div class="service-tip">
          <span data-icon="alert-circle"></span>
          <p><strong>防骗提醒：</strong>${service.tip}</p>
        </div>

        <div class="service-dialog-actions">
          <button class="btn btn-secondary" type="button" data-service-read>
            <span class="btn-icon" data-icon="volume"></span>读给我听
          </button>
          <button class="btn btn-secondary" type="button" data-service-copy>
            <span class="btn-icon" data-icon="copy"></span>复制步骤给家人
          </button>
          <button class="btn btn-primary" type="button" data-close-dialog>
            <span class="btn-icon" data-icon="check"></span>我看明白了
          </button>
        </div>
        <p class="service-helper-note"><span data-icon="info"></span>手机页面可能和这里略有不同，这是正常的。找不到按钮时，可以请家人或工作人员帮忙。</p>
      </div>`;

    NY.icons(content);

    content.querySelector("[data-service-read]").addEventListener("click", (event) => {
      NY.speakText(serviceSpeech(service), event.currentTarget);
    });

    content.querySelector("[data-service-copy]").addEventListener("click", () => {
      NY.copyText(serviceCopyText(service));
    });

    NY.openDialog(dialog);

    try {
      window.history.replaceState(null, "", `#${service.id}`);
    } catch (error) {
      /* 某些本地环境不允许修改历史记录，不影响使用 */
    }
  }

  function updateUrlWithoutHash() {
    try {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    } catch (error) {
      /* 忽略 */
    }
  }

  function refreshFamilyCard() {
    if (!NY) return;
    const settings = NY.getSettings();
    const label = $("#familyPhoneLabel");
    const name = $("#familyNameLabel");
    const sub = $("#familyPhoneSub");
    if (!label || !name || !sub) return;

    if (settings.contactPhone) {
      label.textContent = settings.contactName || "家人电话";
      name.textContent = `${settings.contactRelation || "家人"} · 点击拨打`;
      sub.textContent = settings.contactPhone;
    } else {
      label.textContent = "家人电话";
      name.textContent = "设置后一键联系";
      sub.textContent = "还没有填写号码";
    }
  }

  function bindFilters() {
    const search = $("#serviceSearch");
    const clear = $("#searchClear");
    const chips = $("#categoryChips");
    const reset = $("#resetFilters");

    search.addEventListener("input", () => {
      state.query = search.value;
      clear.hidden = !search.value;
      renderServices();
    });

    clear.addEventListener("click", () => {
      search.value = "";
      state.query = "";
      clear.hidden = true;
      search.focus();
      renderServices();
    });

    chips.addEventListener("click", (event) => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.category = button.dataset.category;
      chips.querySelectorAll("[data-category]").forEach((chip) => {
        const active = chip === button;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      });
      renderServices();
    });

    reset.addEventListener("click", () => {
      state.category = "all";
      state.query = "";
      search.value = "";
      clear.hidden = true;
      chips.querySelectorAll("[data-category]").forEach((chip) => {
        const active = chip.dataset.category === "all";
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", String(active));
      });
      renderServices();
    });
  }

  function init() {
    const grid = $("#serviceGrid");
    const dialog = $("#serviceDialog");

    grid.addEventListener("click", (event) => {
      const card = event.target.closest("[data-service]");
      if (card) openService(card.dataset.service);
    });

    dialog.addEventListener("close", () => {
      state.currentService = null;
      if (window.location.hash) updateUrlWithoutHash();
    });

    bindFilters();
    renderServices();
    refreshFamilyCard();

    document.addEventListener("yinling:contact", refreshFamilyCard);
    document.addEventListener("yinling:settings", refreshFamilyCard);

    const hash = window.location.hash.replace("#", "");
    if (hash && SERVICES.some((service) => service.id === hash)) {
      window.setTimeout(() => openService(hash), 180);
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
