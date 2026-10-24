/* =========================================================
   银龄无诈 · 本地反诈识别引擎
   基于常见骗术特征的本地规则分析，不上传任何内容。
   识别结果仅作提醒，不替代警方判断。
   ========================================================= */

(function () {
  "use strict";

  const RULES = [
    {
      id: "authority",
      icon: "shield-alert",
      title: "疑似冒充公检法等机关",
      weight: 21,
      explain:
        "对方自称公安、检察院或法院，并用“涉嫌案件”来制造压力。真正的公安机关不会通过电话、短信办案，更不会让您转账。",
      patterns: [
        {
          re: /(?:我是|自称|这里是|我们这边是)[^。！？\n]{0,12}(?:公安|派出所|检察院|法院|警察|民警|反诈中心)/g,
          label: "自称公检法",
        },
        {
          re: /(?:公安局|派出所|检察院|法院|通管局|国家安全局)[^。！？\n]{0,18}(?:办案|调查|传唤|核实|通知)/g,
          label: "冒充机关办案",
        },
        {
          re: /(?:涉嫌|卷入|涉及)[^。！？\n]{0,10}(?:洗钱|诈骗|犯罪|非法入境|贩毒|案件)/g,
          label: "声称您涉案",
        },
      ],
    },
    {
      id: "safe-account",
      icon: "wallet",
      title: "提到“安全账户”或资金清查",
      weight: 25,
      explain:
        "公检法机关没有“安全账户”，也不会要求把存款转去接受审查。凡是让您把钱转到指定账户的，基本都是诈骗。",
      patterns: [
        {
          re: /安全账户|资金清查|资金审查|验资账户|监管账户|清查账户/g,
          label: "安全账户话术",
        },
        {
          re: /(?:把钱|将资金|将存款|把存款)[^。！？\n]{0,12}(?:转|汇|存)(?:到|入|至)/g,
          label: "要求转移资金",
        },
      ],
    },
    {
      id: "transfer",
      icon: "arrow-right",
      title: "要求转账、汇款或先交钱",
      weight: 17,
      explain:
        "无论理由听起来多合理，只要陌生人让您先转账、交保证金或支付手续费，都要立即停下来核实。",
      patterns: [
        {
          re: /转账|汇款|打款|转过去|转给|保证金|解冻费|手续费|刷流水|垫付/g,
          label: "涉及转账汇款",
        },
        {
          re: /(?:转|汇)(?:账|款)?\s*[0-9０-９一二三四五六七八九十百千万]{2,}/g,
          label: "要求转账具体金额",
        },
      ],
    },
    {
      id: "credentials",
      icon: "lock",
      title: "索要验证码、密码或身份证信息",
      weight: 22,
      explain:
        "短信验证码、银行卡密码相当于您家的钥匙。任何人以任何理由索要，都应立即拒绝。",
      patterns: [
        {
          re: /验证码|短信码|动态码|支付密码|银行卡密码|银行卡号|身份证号|U盾|人脸识别/g,
          label: "索要敏感信息",
        },
      ],
    },
    {
      id: "screen-share",
      icon: "eye",
      title: "要求共享屏幕或远程控制",
      weight: 22,
      explain:
        "一旦开启屏幕共享，对方可能看到您的验证码和银行页面，甚至直接操作您的手机。陌生人提出这个要求，一定要拒绝。",
      patterns: [
        {
          re: /屏幕共享|共享屏幕|远程控制|远程协助|远程操作|投屏/g,
          label: "要求屏幕共享",
        },
      ],
    },
    {
      id: "urgency",
      icon: "clock",
      title: "用“马上、否则、冻结”催您做决定",
      weight: 13,
      minHits: 2,
      explain:
        "骗子常用时间压力让您来不及思考。越是被催着马上操作，越要先停下来。",
      patterns: [
        {
          re: /立即|马上|立刻|限时|今日内|今天内|24小时内|尽快|抓紧/g,
          label: "催促马上处理",
        },
        {
          re: /否则|逾期|冻结|停用|失效|关闭|扣款|上门|逮捕/g,
          label: "用后果施压",
        },
      ],
    },
    {
      id: "secrecy",
      icon: "user",
      title: "要求保密，不让告诉家人",
      weight: 16,
      explain:
        "正常的办事不需要“保密”，更不会阻止您联系家人。让您瞒着家人的，往往就是骗局。",
      patterns: [
        {
          re: /保密|不要告诉|别告诉|不能告诉|不要声张|只有我们|别挂电话|不要挂断|别打电话|不要打电话|先别联系/g,
          label: "要求保密或别挂断",
        },
      ],
    },
    {
      id: "fake-service",
      icon: "phone-call",
      title: "疑似冒充客服、快递或银行",
      weight: 17,
      minHits: 2,
      explain:
        "正规客服不会用私人号码联系您，也不会让您通过陌生链接办理退款、理赔或关闭扣费。",
      patterns: [
        {
          re: /客服|快递|物流|保险公司|银行|平台工作人员/g,
          label: "自称客服或机构",
        },
        {
          re: /理赔|退款|订单异常|商品质量|百万保障|备用金|关闭扣费|账户异常|积分兑换/g,
          label: "以退款理赔为由",
        },
      ],
    },
    {
      id: "refund",
      icon: "refresh",
      title: "以“退款理赔”为由引导操作",
      weight: 18,
      explain:
        "退款、理赔通常原路返回，不需要您提供验证码、点陌生链接或先交钱。",
      patterns: [
        {
          re: /(?:双倍|三倍|全额|高额)(?:赔偿|赔付|退款|返利)|退款[^。！？\n]{0,16}(?:链接|银行卡|验证码|手续费)/g,
          label: "异常退款理赔",
        },
      ],
    },
    {
      id: "lure",
      icon: "gift",
      title: "用中奖、免费领取等好处吸引您",
      weight: 13,
      minHits: 2,
      explain:
        "“免费领”“中大奖”常常是诱导点击或骗取费用的开头。真正的中奖不会先让您交钱。",
      patterns: [
        {
          re: /中奖|抽中|幸运用户|免费领取|免费送|红包|返利|返现|补贴|退税|优惠名额/g,
          label: "用好处吸引",
        },
        {
          re: /领取|名额有限|先到先得|点击|填写|加微信|加我微信|加QQ|加我QQ/g,
          label: "引导进一步操作",
        },
      ],
    },
    {
      id: "prize-fee",
      icon: "bank",
      title: "领奖前先让您交费",
      weight: 23,
      explain:
        "任何在领奖、解冻、退款前要求先支付税费、保证金或手续费的说法，都值得高度警惕。",
      patterns: [
        {
          re: /(?:先|需要|请)(?:缴纳|支付|交|付)[^。！？\n]{0,12}(?:保证金|解冻费|手续费|税费|工本费|公证费|押金)/g,
          label: "先交钱再办理",
        },
      ],
    },
    {
      id: "family",
      icon: "users",
      title: "疑似冒充亲友或领导借钱",
      weight: 24,
      explain:
        "骗子可能盗用头像、模仿声音，甚至用 AI 换脸。凡是亲友借钱，请先用您平时保存的号码回拨确认。",
      patterns: [
        {
          re: /(?:我是|猜猜我是谁|换号了|新号码)[^。！？\n]{0,16}(?:儿子|女儿|女婿|儿媳|孙子|孙女|外甥|领导|同学|朋友)/g,
          label: "冒充亲友或领导",
        },
        {
          re: /(?:手机|电话)(?:丢了|坏了|没电)|(?:急需|着急)(?:用钱|借钱)|帮我(?:付|转|垫)/g,
          label: "以急事为由借钱",
        },
      ],
    },
    {
      id: "investment",
      icon: "chart",
      title: "承诺高收益、稳赚不赔",
      weight: 20,
      explain:
        "保本保息、稳赚不赔的高收益投资，多数是骗局。养老钱尤其要放在正规、看得懂的渠道里。",
      patterns: [
        {
          re: /(?:高收益|高回报|稳赚不赔|保本保息|一本万利|年化收益|内部渠道|老师带单|翻倍)/g,
          label: "承诺高额收益",
        },
        {
          re: /(?:养老项目|养老床位|原始股|虚拟货币|数字货币|USDT|外汇投资|炒黄金)/g,
          label: "投资养老等名义",
        },
      ],
    },
    {
      id: "health",
      icon: "heart",
      title: "保健品或“神药”夸大宣传",
      weight: 14,
      minHits: 2,
      explain:
        "号称能根治慢性病、替代药物的保健品，通常不可信。身体不舒服，请到正规医院就诊。",
      patterns: [
        {
          re: /神药|特效药|包治百病|根治|药到病除|祖传秘方/g,
          label: "夸大疗效",
        },
        {
          re: /保健品|理疗仪|养生课|免费体检|专家义诊|养老床位/g,
          label: "保健品或养生名义",
        },
      ],
    },
    {
      id: "privacy",
      icon: "id-card",
      title: "要求填写个人或银行卡信息",
      weight: 15,
      explain:
        "通过陌生链接填写身份证、银行卡、住址等信息，容易被用于盗刷或精准诈骗。",
      patterns: [
        {
          re: /(?:填写|提供|发送|上报)[^。！？\n]{0,14}(?:身份证|银行卡|家庭住址|个人信息|手机号)/g,
          label: "索要个人信息",
        },
      ],
    },
    {
      id: "remote-app",
      icon: "download",
      title: "要求下载陌生 App 或安装软件",
      weight: 16,
      explain:
        "对方发来的安装包可能是木马程序。请只在手机自带的应用商店下载软件，不要安装陌生文件。",
      patterns: [
        {
          re: /(?:下载|安装|点开)[^。！？\n]{0,16}(?:APP|App|app|软件|安装包|助手|会议)/g,
          label: "要求下载软件",
        },
        {
          re: /(?:腾讯会议|钉钉|Zoom|zoom|会议号)[^。！？\n]{0,12}(?:沟通|办理|核实|配合)/g,
          label: "引导到会议软件",
        },
      ],
    },
    {
      id: "contact-channel",
      icon: "message-circle",
      title: "引导到微信、QQ 或陌生链接继续聊",
      weight: 11,
      explain:
        "正规机构通常不会要求您加私人微信、QQ 办理业务。离开官方渠道，风险会明显增加。",
      patterns: [
        {
          re: /(?:添加|加)(?:我)?(?:微信|QQ|WhatsApp)|扫描[^。！？\n]{0,8}二维码|点击[^。！？\n]{0,8}(?:链接|网址)/g,
          label: "引导私下联系",
        },
      ],
    },
    {
      id: "threat",
      icon: "siren",
      title: "用坐牢、征信等后果吓唬您",
      weight: 17,
      explain:
        "骗子会故意把后果说得很严重，让您慌乱。真正的执法或征信处理都有正式书面程序，不会只在电话里催。",
      patterns: [
        {
          re: /抓人|坐牢|判刑|影响子女|纳入征信|黑名单|法院传票|上门抓|逮捕令/g,
          label: "用严重后果威胁",
        },
      ],
    },
    {
      id: "ai-face",
      icon: "video",
      title: "涉及 AI 换脸或模仿声音",
      weight: 24,
      explain:
        "视频里的人不一定是真的。涉及借钱、转账时，请挂断后用自己的号码回拨，或问一个只有家人知道的问题。",
      patterns: [
        {
          re: /AI换脸|换脸|模拟声音|克隆声音|人工智能合成|视频里[^。！？\n]{0,15}(?:借钱|转账)/g,
          label: "AI 换脸或拟声",
        },
      ],
    },
  ];

  const SHORT_DOMAINS = [
    "t.cn",
    "url.cn",
    "dwz.cn",
    "bit.ly",
    "tinyurl.com",
    "goo.gl",
    "suo.im",
    "sourl.cn",
    "w.url.cn",
  ];

  const SUSPICIOUS_TLDS = [
    ".top",
    ".xyz",
    ".cc",
    ".vip",
    ".icu",
    ".shop",
    ".win",
    ".loan",
    ".work",
    ".link",
    ".click",
    ".live",
  ];

  const SAFE_ACTIONS = [
    "继续保持：凡是涉及转账、汇款、验证码和陌生链接，都先停一停。",
    "拿不准时，把消息发给家人看看，或者拨打 96110 反诈专线核实。",
    "不要因为对方说“时间紧、名额少”就仓促做决定，真正的事都等得起。",
  ];

  function cloneGlobal(re) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    return new RegExp(re.source, flags);
  }

  function uniquePush(list, value) {
    const normalized = value.trim();
    if (!normalized) return;
    if (!list.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
      list.push(normalized);
    }
  }

  function makeHighlights(text) {
    const ranges = [];
    const regex = /(?:https?:\/\/|www\.)[^\s<>"'，。！？；：、）】》]+/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const cleaned = match[0].replace(/[.,;!?)\]}>，。！？；：、）】》"'…]+$/g, "");
      if (!cleaned) continue;
      ranges.push({
        start: match.index,
        end: match.index + cleaned.length,
        text: cleaned,
        type: "link",
      });
    }
    return ranges;
  }

  function mergeRanges(ranges) {
    if (!ranges.length) return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
    const merged = [];
    for (const range of sorted) {
      const last = merged[merged.length - 1];
      if (last && range.start < last.end) {
        last.end = Math.max(last.end, range.end);
        last.text = last.text;
        if (!last.types.includes(range.type)) last.types.push(range.type);
      } else {
        merged.push({
          start: range.start,
          end: range.end,
          text: range.text,
          types: [range.type],
        });
      }
    }
    return merged.slice(0, 22).map(({ start, end, text, types }) => ({
      start,
      end,
      text,
      type: types[0],
    }));
  }

  function extractUrls(text) {
    const regex = /(?:https?:\/\/|www\.)[^\s<>"'，。！？；：、）】》]+/gi;
    const found = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const cleaned = match[0].replace(/[.,;!?)\]}>，。！？；：、）】》"'…]+$/g, "");
      if (!cleaned) continue;
      if (!found.some((item) => item.url === cleaned)) {
        found.push({ url: cleaned, index: match.index });
      }
    }
    return found;
  }

  function inspectUrl(rawUrl) {
    const full = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    let parsed;
    try {
      parsed = new URL(full);
    } catch (error) {
      return {
        url: rawUrl,
        host: rawUrl,
        issues: ["网址格式不常见"],
        weight: 12,
        suspicious: true,
      };
    }

    const host = parsed.hostname.toLowerCase();
    const issues = [];
    let weight = 0;

    if (parsed.protocol === "http:") {
      issues.push("使用的是不加密的 http 链接");
      weight += 6;
    }

    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      issues.push("直接使用 IP 地址，正规平台很少这样");
      weight += 14;
    }

    if (host.includes("xn--")) {
      issues.push("网址含有容易被伪装的特殊字符");
      weight += 16;
    }

    if (SHORT_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      issues.push("短链接会隐藏真正的网站地址");
      weight += 16;
    }

    if (SUSPICIOUS_TLDS.some((tld) => host.endsWith(tld))) {
      issues.push("使用了不常见的网址后缀");
      weight += 10;
    }

    if (host.split(".").length >= 5) {
      issues.push("网址层级过多，可能在模仿正规网站");
      weight += 8;
    }

    if (host.length > 32) {
      issues.push("网址名称很长，不太像常用网站");
      weight += 6;
    }

    if (/[@]/.test(parsed.href)) {
      issues.push("网址中含有 @ 符号，可能借助它隐藏真实地址");
      weight += 12;
    }

    if (!issues.length) {
      issues.push("含有一条外部网址，来源不明时不要点击");
      weight = 6;
    }

    return {
      url: rawUrl,
      host,
      issues,
      weight: Math.min(weight, 34),
      suspicious: weight >= 10,
    };
  }

  function findingSeverity(weight) {
    if (weight >= 19) return "high";
    if (weight >= 12) return "medium";
    return "low";
  }

  function analyzeText(rawText) {
    const text = String(rawText || "");
    const trimmed = text.trim();
    if (trimmed.length < 6) {
      return {
        valid: false,
        reason: "请至少输入 6 个字，这样判断会更准确。",
      };
    }

    let score = 0;
    const findings = [];
    const allRanges = makeHighlights(text);
    const matchedLabels = [];

    for (const rule of RULES) {
      const evidence = [];
      const ruleRanges = [];
      const labels = [];
      let rawHits = 0;

      for (const pattern of rule.patterns) {
        const regex = cloneGlobal(pattern.re);
        let match;
        let localCount = 0;
        while ((match = regex.exec(text)) !== null) {
          if (match[0].length === 0) {
            regex.lastIndex += 1;
            continue;
          }
          rawHits += 1;
          localCount += 1;
          uniquePush(evidence, match[0]);
          uniquePush(labels, pattern.label);
          if (ruleRanges.length < 7) {
            ruleRanges.push({
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
              type: rule.id,
            });
          }
          if (localCount >= 5) break;
        }
      }

      const minHits = rule.minHits || 1;
      if (rawHits < minHits) continue;

      const weight = Math.min(rule.weight + Math.max(0, rawHits - minHits) * 2, rule.weight + 8);
      score += weight;
      findings.push({
        id: rule.id,
        icon: rule.icon,
        title: rule.title,
        explain: rule.explain,
        evidence: evidence.slice(0, 4),
        labels: labels.slice(0, 3),
        weight,
        severity: findingSeverity(weight),
        ranges: ruleRanges,
      });

      for (const range of ruleRanges) allRanges.push(range);
      for (const label of labels) uniquePush(matchedLabels, label);
    }

    const urls = extractUrls(text);
    const linkDetails = urls.map((item) => inspectUrl(item.url));
    if (linkDetails.length) {
      const worst = [...linkDetails].sort((a, b) => b.weight - a.weight)[0];
      const totalLinkWeight = Math.min(
        38,
        linkDetails.reduce((sum, detail) => sum + Math.max(4, detail.weight), 0)
      );
      score += totalLinkWeight;
      findings.push({
        id: "link",
        icon: "link",
        title: worst.suspicious ? "含有可疑的陌生链接" : "包含一条外部链接",
        explain: worst.suspicious
          ? "这条网址有一些不常见的特征，可能把您带到仿冒网站。不要直接点击，最好从官方 App 或官网进入。"
          : "消息中包含外部网址。即使看起来像正规网站，也建议从官方 App 或手动输入官网地址进入。",
        evidence: linkDetails.map((detail) => detail.host).slice(0, 4),
        labels: worst.issues.slice(0, 3),
        weight: totalLinkWeight,
        severity: worst.suspicious ? "high" : "low",
        ranges: [],
        links: linkDetails,
      });
      for (const detail of linkDetails) {
        if (detail.url) {
          const index = text.indexOf(detail.url);
          if (index >= 0) {
            allRanges.push({
              start: index,
              end: index + detail.url.length,
              text: detail.url,
              type: "link",
            });
          }
        }
      }
    }

    if (findings.length >= 3) score += 5;
    if (findings.length >= 5) score += 5;
    score = Math.max(0, Math.min(100, Math.round(score)));

    let level = "none";
    if (score >= 65) level = "high";
    else if (score >= 32) level = "medium";
    else if (score > 0) level = "low";

    const levelMeta = {
      high: {
        label: "高风险",
        headline: "这很像诈骗，请先停下来。",
        short: "高度疑似诈骗，请立即停止操作。",
      },
      medium: {
        label: "中风险",
        headline: "有几处不太对劲，建议先核实。",
        short: "发现多个可疑点，先不要着急操作。",
      },
      low: {
        label: "需要留意",
        headline: "发现一点可疑之处，别急着操作。",
        short: "有少量可疑特征，建议谨慎核实。",
      },
      none: {
        label: "暂未见明显风险",
        headline: "暂时没有发现明显的骗术特征。",
        short: "未匹配到常见骗术特征，但仍需保持警惕。",
      },
    };

    findings.sort((a, b) => b.weight - a.weight);
    const topFinding = findings[0];
    const topTitle = topFinding ? topFinding.title : "";

    let summary = "";
    if (level === "high") {
      summary = `AI 找到了 ${findings.length} 处常见诈骗信号，最明显的是“${topTitle}”。对方可能在催您做决定，请先停止转账、点击链接或提供验证码。`;
    } else if (level === "medium") {
      summary = `这条消息里有 ${findings.length} 处需要留意的地方，例如“${topTitle}”。先别按对方说的做，通过官方渠道或家人核实一下。`;
    } else if (level === "low") {
      summary = `这条消息里有少量可疑特征，例如“${topTitle}”。不一定是诈骗，但涉及钱和验证码时，最好先核实。`;
    } else {
      summary =
        "没有匹配到常见的诈骗话术。不过，AI 识别不能代替您的判断：只要涉及转账、验证码或陌生链接，都请先和家人或 96110 核实。";
    }

    const actions = buildActions(level, findings);
    const mantra = buildMantra(level, findings);
    const highlights = mergeRanges(allRanges);

    return {
      valid: true,
      text,
      score,
      level,
      label: levelMeta[level].label,
      headline: levelMeta[level].headline,
      short: levelMeta[level].short,
      summary,
      findings: findings.slice(0, 8),
      actions,
      mantra,
      highlights,
      links: linkDetails,
      matchedLabels: matchedLabels.slice(0, 12),
      meta: {
        characterCount: trimmed.length,
        findingCount: findings.length,
        urlCount: linkDetails.length,
        checkedRules: RULES.length,
      },
    };
  }

  function buildActions(level, findings) {
    if (level === "none") return SAFE_ACTIONS;

    const specific = [];
    const ids = new Set(findings.map((finding) => finding.id));

    if (ids.has("safe-account") || ids.has("transfer")) {
      specific.push("记住：公安机关没有“安全账户”，任何要求您转账接受审查的，都是诈骗。");
    }
    if (ids.has("credentials")) {
      specific.push("验证码和密码谁要都不能给，也不要让陌生人看您的手机屏幕。");
    }
    if (ids.has("screen-share") || ids.has("remote-app")) {
      specific.push("立刻拒绝屏幕共享和陌生 App，已经开启的话，马上关闭并断开网络。");
    }
    if (ids.has("link")) {
      specific.push("不要点击这条链接，也不要下载对方发来的软件，请从官方 App 或官网进入。");
    }
    if (ids.has("investment")) {
      specific.push("号称保本高收益的投资多半是陷阱，养老钱不要转给陌生平台。");
    }
    if (ids.has("family") || ids.has("ai-face")) {
      specific.push("先挂断，用您平时保存的号码给家人回拨，或问一个只有家人知道的问题。");
    }
    if (ids.has("authority")) {
      specific.push("可以拨打 96110 核实，或直接到附近派出所当面咨询。");
    }

    const base =
      level === "high"
        ? [
            "现在先停下来：不转账、不汇款、不点链接，也不要把验证码告诉任何人。",
            specific[0] || "通过官方 App、官网或银行卡背面的电话核实，不要用对方给的号码。",
          ]
        : [
            "先别按照对方说的操作，也别急着提供个人信息。",
            specific[0] || "通过官方渠道或家人核实，不要只凭这一条消息做决定。",
          ];

    const tail =
      level === "high"
        ? [
            "把消息转发给家人，或拨打 96110 反诈专线，让身边的人一起帮您看看。",
            "如果已经转账或泄露密码，立即拨打 110 报警，并联系银行止付。",
          ]
        : [
            "拿不准就发给家人看看，或者拨打 96110 咨询。",
            "涉及转账、验证码、陌生链接时，慢一点总没有错。",
          ];

    return [...base, ...specific.slice(1, 2), ...tail].slice(0, 4);
  }

  function buildMantra(level, findings) {
    if (level === "none") return "拿不准就先问家人，或者拨打 96110。";
    const ids = new Set(findings.map((finding) => finding.id));
    if (ids.has("safe-account") || ids.has("authority")) {
      return "公安办案不会电话要钱，也没有所谓的“安全账户”。";
    }
    if (ids.has("credentials")) return "验证码就是钱，谁要都不能给。";
    if (ids.has("family")) return "家人借钱，先用原来的号码回拨确认。";
    if (ids.has("ai-face")) return "视频里的人也可能是假的，转账前一定回拨核实。";
    if (ids.has("investment")) return "保本高收益，多半是骗局。";
    if (ids.has("link")) return "陌生链接不乱点，陌生软件不乱装。";
    if (ids.has("fake-service") || ids.has("refund")) {
      return "退款理赔不用先转账，更不用点陌生链接。";
    }
    return "让您急着转账、点链接、给验证码的，先停一停。";
  }

  window.FraudEngine = {
    analyze: analyzeText,
    ruleCount: RULES.length,
  };
})();
