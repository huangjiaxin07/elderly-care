/* =========================================================
   银龄无诈 · 共享交互
   大字模式、高对比度、语音朗读、弹窗、提示与本地存储
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "yinling.settings.v1";
  const SETTINGS_EVENT = "yinling:settings";
  const CONTACT_EVENT = "yinling:contact";

  const DEFAULT_SETTINGS = {
    font: "large",
    contrast: false,
    reduceMotion: false,
    autoRead: false,
    name: "",
    contactName: "",
    contactRelation: "子女",
    contactPhone: "",
  };

  const ICONS = {
    "sun": '<circle cx="12" cy="12" r="3.6"/><path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.4 1.4M18.3 18.3l1.4 1.4M2.5 12h2M19.5 12h2M4.3 19.7l1.4-1.4M18.3 5.7l1.4-1.4"/>',
    "shield": '<path d="M12 22s8-3.8 8-10V5.4L12 2.5 4 5.4V12c0 6.2 8 10 8 10Z"/>',
    "shield-check": '<path d="M12 22s8-3.8 8-10V5.4L12 2.5 4 5.4V12c0 6.2 8 10 8 10Z"/><path d="m8.8 11.7 2.1 2.1 4.5-4.5"/>',
    "shield-alert": '<path d="M12 22s8-3.8 8-10V5.4L12 2.5 4 5.4V12c0 6.2 8 10 8 10Z"/><path d="M12 7.5v5.2"/><path d="M12 16.8h.01"/>',
    "message": '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9.2 9.2 0 0 1-3.8-.8L3 21l1.7-5.2a8.2 8.2 0 0 1-.7-3.4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/><path d="M8.5 10.5h7M8.5 14h4.5"/>',
    "link": '<path d="M10.2 13.8a4.5 4.5 0 0 0 6.4 0l2.1-2.1a4.5 4.5 0 0 0-6.4-6.4L11 6.6"/><path d="M13.8 10.2a4.5 4.5 0 0 0-6.4 0l-2.1 2.1a4.5 4.5 0 0 0 6.4 6.4l1.3-1.3"/>',
    "phone": '<path d="M21 15.5v2.4a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 1.1 2.2 2 2 0 0 1 3.1 0h2.4a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L6.5 7.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" transform="translate(1 1) scale(.92)"/>',
    "phone-call": '<path d="M14 4a6 6 0 0 1 6 6M14 8a2 2 0 0 1 2 2"/><path d="M21 15.5v2.4a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.7 19.7 0 0 1 1.1 2.2 2 2 0 0 1 3.1 0h2.4a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L6.5 7.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" transform="translate(1 1) scale(.92)"/>',
    "video": '<rect x="2.5" y="6.5" width="13" height="11" rx="2.5"/><path d="m15.5 10 5-3v10l-5-3"/>',
    "calendar": '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M16 3v4M8 3v4M3 10h18"/><path d="M8 14h3M8 17.5h6"/>',
    "id-card": '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><circle cx="8.5" cy="11" r="2"/><path d="M5.5 16c.4-1.4 1.5-2.2 3-2.2s2.6.8 3 2.2M14 10h4M14 14h4"/>',
    "wallet": '<path d="M20 8V6.5a2 2 0 0 0-2-2H4.5A2.5 2.5 0 0 0 2 7v11a2.5 2.5 0 0 0 2.5 2.5h15a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2H5"/><path d="M16.5 13.5h.01"/>',
    "bolt": '<path d="M13.5 2.5 4 14h6.5l-1 7.5L20 10h-6.5l1-7.5Z"/>',
    "siren": '<path d="M6 18v-5a6 6 0 0 1 12 0v5"/><path d="M4 21h16M12 2v2M4.5 5.5l1.4 1.4M19.5 5.5l-1.4 1.4"/><path d="M9 18h6"/>',
    "hospital": '<path d="M4 21V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 21h20M9 9h6M12 6v6M9.5 16h5"/>',
    "bus": '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v2M16 18v2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/><path d="M8 3v4M16 3v4"/>',
    "book": '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5v13Z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M8 8h8M8 11.5h5"/>',
    "book-open": '<path d="M12 6.5C10.5 5 8.5 4.5 5 4.5v14c3.5 0 5.5.6 7 2 1.5-1.4 3.5-2 7-2v-14c-3.5 0-5.5.5-7 2Z"/><path d="M12 6.5v14"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5a6.5 6.5 0 0 1 3.5 5.8"/>',
    "heart": '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
    "heart-hand": '<path d="M11 14 9.5 12.5a2.1 2.1 0 0 1 3-3l1.5 1.5 1.5-1.5a2.1 2.1 0 0 1 3 3L15 16"/><path d="M3 13v6a2 2 0 0 0 2 2h4l8-4.5a2 2 0 0 0-2.7-2.9L10 16"/>',
    "volume": '<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    "volume-off": '<path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="m16 9 5 5M21 9l-5 5"/>',
    "message-circle": '<path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 9.2 9.2 0 0 1-3.8-.8L3 21l1.7-5.2a8.2 8.2 0 0 1-.7-3.4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/>',
    "search": '<circle cx="10.5" cy="10.5" r="6.8"/><path d="m16 16 5 5"/>',
    "search-shield": '<circle cx="10.5" cy="10.5" r="6.8"/><path d="m16 16 5 5"/><path d="M10.5 5.7s3.3 1.8 3.3 4.2c0 2.1-1.9 4-3.3 4.8-1.4-.8-3.3-2.7-3.3-4.8 0-2.4 3.3-4.2 3.3-4.2Z"/>',
    "menu": '<path d="M4 7h16M4 12h16M4 17h16"/>',
    "close": '<path d="m6 6 12 12M18 6 6 18"/>',
    "check": '<path d="m5 12 4.5 4.5L19 7"/>',
    "check-circle": '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16.5 9"/>',
    "alert": '<path d="M10.3 3.5 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.5a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5M12 17h.01"/>',
    "alert-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V13M12 16.8h.01"/>',
    "info": '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    "help": '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5.1.8c0 1.7-2.6 2-2.6 3.8M12 17h.01"/>',
    "lock": '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
    "eye": '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="m3 3 18 18"/><path d="M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.3 6.4A17 17 0 0 0 2.5 12S6 18 12 18a9.5 9.5 0 0 0 3.6-.7"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    "arrow-right": '<path d="M4 12h16M14 6l6 6-6 6"/>',
    "arrow-left": '<path d="M20 12H4M10 6l-6 6 6 6"/>',
    "chevron-right": '<path d="m9 5 7 7-7 7"/>',
    "chevron-down": '<path d="m5 9 7 7 7-7"/>',
    "external": '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    "copy": '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    "share": '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
    "mic": '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7"/>',
    "trash": '<path d="M4 7h16M9 7V4h6v3M6.5 7l.8 13h9.4l.8-13"/><path d="M10 11v5M14 11v5"/>',
    "edit": '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "minus": '<path d="M5 12h14"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    "accessibility": '<circle cx="12" cy="4.5" r="2"/><path d="M4 8h16M12 8v5M12 13l-3 8M12 13l3 8"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.5 2"/>',
    "copy-check": '<path d="M20 6 9 17l-5-5"/>',
    "sparkles": '<path d="m12 3 1.2 3.6a5.4 5.4 0 0 0 3.2 3.2L20 11l-3.6 1.2a5.4 5.4 0 0 0-3.2 3.2L12 19l-1.2-3.6a5.4 5.4 0 0 0-3.2-3.2L4 11l3.6-1.2a5.4 5.4 0 0 0 3.2-3.2L12 3Z"/><path d="M19 17.5 19.5 19l1.5.5-1.5.5-.5 1.5-.5-1.5L17 19l1.5-.5.5-1.5Z"/>',
    "cpu": '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    "clipboard": '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2.8A1.8 1.8 0 0 1 10.8 1h2.4A1.8 1.8 0 0 1 15 2.8V4M9 9h6M9 13h6M9 17h4"/>',
    "home": '<path d="m3 10.5 9-7.5 9 7.5V20a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 20v-9.5Z"/><path d="M9.5 21.5v-6h5v6"/>',
    "gift": '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8C8 8 7 6.8 7 5a2.2 2.2 0 0 1 4-1.2L12 5l1-1.2A2.2 2.2 0 0 1 17 5c0 1.8-1 3-5 3Z"/>',
    "bank": '<path d="m3 9 9-5 9 5M5 10.5V19M9.5 10.5V19M14.5 10.5V19M19 10.5V19M2.5 21.5h19"/>',
    "refresh": '<path d="M20.5 8A8.5 8.5 0 1 0 21 14"/><path d="M21 3.5V8h-4.5"/>',
    "download": '<path d="M12 3v12M7.5 10.5 12 15l4.5-4.5M4 20h16"/>',
    "mail": '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3 7 9 6 9-6"/>',
    "list": '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    "chart": '<path d="M3 20.5h18"/><path d="M6 17V9M11 17V4M16 17v-6M21 17V7"/>',
    "play": '<path d="M7 4.5v15l13-7.5-13-7.5Z"/>',
    "pause": '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    "send": '<path d="m21 3-7.2 18-4.1-7.7L2 9.2 21 3Z"/><path d="m21 3-11.3 10.3"/>',
    "map-pin": '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.8"/>',
    "type": '<path d="M4 6V4h16v2M12 4v16M8.5 20h7"/>',
    "contrast": '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" stroke="none"/>',
  };

  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      if (el.dataset.iconReady === "true") return;
      const name = el.getAttribute("data-icon");
      if (!name || !ICONS[name]) return;
      el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
      el.dataset.iconReady = "true";
      el.setAttribute("aria-hidden", "true");
    });
  }

  /* ---------- 本地存储 ---------- */

  function readJSON(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (error) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function loadSettings() {
    const saved = readJSON(STORAGE_KEY, {});
    const merged = { ...DEFAULT_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
    if (!["normal", "large", "xlarge"].includes(merged.font)) merged.font = "large";
    return merged;
  }

  let settings = loadSettings();

  function applySettings() {
    const root = document.documentElement;
    root.dataset.font = settings.font;
    root.dataset.contrast = settings.contrast ? "high" : "normal";
    root.dataset.motion = settings.reduceMotion ? "off" : "on";
    updateFontControls();
    updatePersonalization();
  }

  function saveSettings(patch, options = {}) {
    settings = { ...settings, ...patch };
    writeJSON(STORAGE_KEY, settings);
    applySettings();
    document.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
    if (options.toast) {
      showToast(options.toast);
    }
    return settings;
  }

  function getSettings() {
    return { ...settings };
  }

  /* ---------- 字体控件 ---------- */

  function updateFontControls() {
    const quickToggle = document.getElementById("quickFontToggle");
    if (quickToggle) {
      const isLarge = settings.font !== "normal";
      quickToggle.setAttribute("aria-pressed", String(isLarge));
      quickToggle.setAttribute(
        "aria-label",
        isLarge ? "大字模式，当前已开启，点击关闭" : "大字模式，当前已关闭，点击开启"
      );
    }

    const radio = document.querySelector(
      `input[name="siteFontSize"][value="${settings.font}"]`
    );
    if (radio) radio.checked = true;

    const contrast = document.getElementById("settingContrast");
    if (contrast) contrast.checked = Boolean(settings.contrast);

    const motion = document.getElementById("settingMotion");
    if (motion) motion.checked = Boolean(settings.reduceMotion);

    const autoRead = document.getElementById("settingAutoRead");
    if (autoRead) autoRead.checked = Boolean(settings.autoRead);

    const font = document.getElementById("fontPreview");
    if (font) font.dataset.font = settings.font;
  }

  function updatePersonalization() {
    document.querySelectorAll("[data-profile-name]").forEach((node) => {
      node.textContent = settings.name || "长辈朋友";
    });
    document.querySelectorAll("[data-contact-name]").forEach((node) => {
      node.textContent = settings.contactName || "家人";
    });
    document.querySelectorAll("[data-contact-phone]").forEach((node) => {
      node.textContent = settings.contactPhone || "尚未设置号码";
    });

    document.querySelectorAll("[data-contact-call]").forEach((el) => {
      const href = settings.contactPhone
        ? `tel:${settings.contactPhone.replace(/[^\d+]/g, "")}`
        : "#contact";
      el.setAttribute("href", href);
      if (!settings.contactPhone) {
        el.dataset.openDialog = "contactDialog";
        el.removeAttribute("href");
      } else {
        delete el.dataset.openDialog;
      }
    });
  }

  /* ---------- 弹窗 ---------- */

  function openDialog(id) {
    const dialog = typeof id === "string" ? document.getElementById(id) : id;
    if (!dialog || typeof dialog.showModal !== "function") return;
    if (!dialog.open) dialog.showModal();
    document.body.classList.remove("nav-open");
    const menu = document.getElementById("menuToggle");
    if (menu) menu.setAttribute("aria-expanded", "false");
    const nav = document.getElementById("siteNav");
    if (nav) nav.classList.remove("is-open");
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function bindDialogs() {
    document.addEventListener("click", (event) => {
      const opener = event.target.closest("[data-open-dialog]");
      if (opener) {
        event.preventDefault();
        openDialog(opener.dataset.openDialog);
        return;
      }

      const closer = event.target.closest("[data-close-dialog]");
      if (closer) {
        event.preventDefault();
        closeDialog(closer.closest("dialog"));
      }
    });

    document.querySelectorAll("dialog.modal").forEach((dialog) => {
      dialog.addEventListener("click", (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  /* ---------- 显示设置弹窗 ---------- */

  function injectDisplayDialog() {
    if (document.getElementById("displayDialog")) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <dialog class="modal display-dialog" id="displayDialog" aria-labelledby="displayDialogTitle">
        <div class="modal-shell">
          <button class="modal-close" type="button" data-close-dialog aria-label="关闭显示设置">
            <span data-icon="close"></span>
          </button>
          <div class="display-scroll">
            <div class="modal-heading">
              <p class="eyebrow">显示与阅读</p>
              <h2 id="displayDialogTitle">看得清楚，心里也轻松</h2>
              <p>调整后会一直保存在这台设备上，下次打开还是您习惯的样子。</p>
            </div>

            <fieldset class="font-picker">
              <legend>字体大小</legend>
              <div class="font-options">
                <label class="font-option">
                  <input type="radio" name="siteFontSize" value="normal" />
                  <span class="font-option-body">
                    <span class="font-sample" aria-hidden="true">Aa</span>
                    <span class="font-option-label">标准</span>
                    <small>字小一点</small>
                  </span>
                </label>
                <label class="font-option">
                  <input type="radio" name="siteFontSize" value="large" />
                  <span class="font-option-body">
                    <span class="font-recommend">推荐</span>
                    <span class="font-sample" aria-hidden="true">Aa</span>
                    <span class="font-option-label">大字</span>
                    <small>舒服好读</small>
                  </span>
                </label>
                <label class="font-option">
                  <input type="radio" name="siteFontSize" value="xlarge" />
                  <span class="font-option-body">
                    <span class="font-sample" aria-hidden="true">Aa</span>
                    <span class="font-option-label">特大</span>
                    <small>看得更清楚</small>
                  </span>
                </label>
              </div>
            </fieldset>

            <div class="settings-list">
              <label class="switch-row" for="settingContrast">
                <span class="switch-copy">
                  <strong>高对比度</strong>
                  <small>文字更黑、边界更清楚，适合光线较亮时阅读。</small>
                </span>
                <span class="switch">
                  <input type="checkbox" id="settingContrast" />
                  <span class="switch-track" aria-hidden="true"></span>
                </span>
              </label>
              <label class="switch-row" for="settingMotion">
                <span class="switch-copy">
                  <strong>减少动画</strong>
                  <small>关闭弹窗和页面的多余动效，阅读更安稳。</small>
                </span>
                <span class="switch">
                  <input type="checkbox" id="settingMotion" />
                  <span class="switch-track" aria-hidden="true"></span>
                </span>
              </label>
              <label class="switch-row" for="settingAutoRead">
                <span class="switch-copy">
                  <strong>自动朗读识别结果</strong>
                  <small>反诈识别完成后，自动为您读出结果。</small>
                </span>
                <span class="switch">
                  <input type="checkbox" id="settingAutoRead" />
                  <span class="switch-track" aria-hidden="true"></span>
                </span>
              </label>
            </div>

            <div class="preview-card" id="fontPreview">
              <span class="preview-label">效果预览</span>
              <p>陌生来电不要急，先挂断，再和家人或 96110 核实。</p>
            </div>
          </div>

          <div class="display-footer">
            <div class="modal-actions">
              <button class="btn btn-primary" type="button" data-read-page>
                <span class="btn-icon" data-icon="volume"></span>朗读本页
              </button>
              <button class="btn btn-secondary" type="button" data-close-dialog>完成</button>
              <button class="btn btn-ghost" type="button" id="resetDisplaySettings">恢复默认</button>
            </div>
            <p class="modal-footnote"><span data-icon="lock"></span>设置只保存在这台设备，不会上传。</p>
          </div>
        </div>
      </dialog>`;
    document.body.appendChild(wrapper.firstElementChild);

    const radios = document.querySelectorAll('input[name="siteFontSize"]');
    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.checked) {
          saveSettings({ font: radio.value }, {
            toast: radio.value === "normal" ? "已切换为标准字号" : `已切换为${radio.value === "xlarge" ? "特大" : "大字"}字号`,
          });
          if (settings.autoRead) speakText("字体大小已经调整好了。");
        }
      });
    });

    document.getElementById("settingContrast").addEventListener("change", (event) => {
      saveSettings({ contrast: event.target.checked }, {
        toast: event.target.checked ? "已开启高对比度" : "已恢复普通对比度",
      });
    });

    document.getElementById("settingMotion").addEventListener("change", (event) => {
      saveSettings({ reduceMotion: event.target.checked }, {
        toast: event.target.checked ? "已减少动画效果" : "已恢复页面动效",
      });
    });

    document.getElementById("settingAutoRead").addEventListener("change", (event) => {
      saveSettings({ autoRead: event.target.checked }, {
        toast: event.target.checked ? "识别完成后会自动朗读" : "已关闭自动朗读",
      });
    });

    document.getElementById("resetDisplaySettings").addEventListener("click", () => {
      saveSettings(
        {
          font: DEFAULT_SETTINGS.font,
          contrast: DEFAULT_SETTINGS.contrast,
          reduceMotion: DEFAULT_SETTINGS.reduceMotion,
          autoRead: DEFAULT_SETTINGS.autoRead,
        },
        { toast: "显示设置已恢复默认" }
      );
    });
  }

  /* ---------- 亲情联系人弹窗 ---------- */

  function injectContactDialog() {
    if (document.getElementById("contactDialog")) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <dialog class="modal" id="contactDialog" aria-labelledby="contactDialogTitle">
        <div class="modal-shell">
          <button class="modal-close" type="button" data-close-dialog aria-label="关闭联系人设置">
            <span data-icon="close"></span>
          </button>
          <div class="modal-heading">
            <p class="eyebrow">亲情联系</p>
            <h2 id="contactDialogTitle">设置一位可以随时联系的家人</h2>
            <p>遇到拿不准的事，先给家人打个电话。号码只保存在这台设备上。</p>
          </div>
          <form id="contactForm" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="contactNameInput">家人称呼</label>
                <input class="input" id="contactNameInput" name="contactName" autocomplete="name" placeholder="例如：女儿小敏" maxlength="20" required />
              </div>
              <div class="field">
                <label for="contactRelationInput">和您的关系</label>
                <select class="select" id="contactRelationInput" name="contactRelation">
                  <option>子女</option>
                  <option>老伴</option>
                  <option>兄弟姐妹</option>
                  <option>孙辈</option>
                  <option>亲友</option>
                  <option>社区工作人员</option>
                </select>
              </div>
              <div class="field field-full">
                <label for="contactPhoneInput">电话号码</label>
                <input class="input" id="contactPhoneInput" name="contactPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="例如：138 0000 0000" maxlength="20" required />
                <span class="field-hint">建议填写手机号。保存后，紧急求助区会显示“一键联系”。</span>
              </div>
            </div>
            <p class="form-message" id="contactError" role="alert" hidden></p>
            <div class="modal-actions">
              <button class="btn btn-primary" type="submit">
                <span class="btn-icon" data-icon="check"></span>保存联系人
              </button>
              <button class="btn btn-secondary" type="button" data-close-dialog>取消</button>
            </div>
          </form>
        </div>
      </dialog>`;
    document.body.appendChild(wrapper.firstElementChild);

    const dialog = document.getElementById("contactDialog");
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });

    const form = document.getElementById("contactForm");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = form.contactName.value.trim();
      const relation = form.contactRelation.value;
      const phone = form.contactPhone.value.trim();
      const error = document.getElementById("contactError");

      if (!name) {
        error.textContent = "请填写家人的称呼。";
        error.hidden = false;
        form.contactName.focus();
        return;
      }

      const digits = phone.replace(/[^\d]/g, "");
      if (!/^[0-9+\-\s]{5,20}$/.test(phone) || digits.length < 5) {
        error.textContent = "电话号码好像不太完整，请检查后再保存。";
        error.hidden = false;
        form.contactPhone.focus();
        return;
      }

      error.hidden = true;
      saveSettings({ contactName: name, contactRelation: relation, contactPhone: phone });
      document.dispatchEvent(new CustomEvent(CONTACT_EVENT, { detail: getSettings() }));
      closeDialog(dialog);
      showToast(`已保存 ${name} 的电话`);
    });
  }

  function fillContactForm() {
    const dialog = document.getElementById("contactDialog");
    if (!dialog) return;
    const form = dialog.querySelector("#contactForm");
    if (!form) return;
    form.contactName.value = settings.contactName || "";
    form.contactRelation.value = settings.contactRelation || "子女";
    form.contactPhone.value = settings.contactPhone || "";
    const error = dialog.querySelector("#contactError");
    if (error) error.hidden = true;
  }

  /* ---------- 语音朗读 ---------- */

  let activeUtterance = null;
  let activeSpeakButton = null;

  function canSpeak() {
    return "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
  }

  function resetSpeakButton() {
    if (activeSpeakButton) {
      activeSpeakButton.classList.remove("is-speaking");
      if (activeSpeakButton.dataset.originalLabel) {
        activeSpeakButton.dataset.speaking = "false";
      }
    }
    activeSpeakButton = null;
  }

  function stopSpeaking() {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    activeUtterance = null;
    resetSpeakButton();
  }

  function speakText(text, button) {
    if (!canSpeak()) {
      showToast("当前浏览器不支持语音朗读，建议使用最新版 Edge 或 Chrome。", "error");
      return false;
    }
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) {
      showToast("这里还没有可以朗读的内容。");
      return false;
    }

    if (activeUtterance && activeSpeakButton === button) {
      stopSpeaking();
      return true;
    }

    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(clean.slice(0, 8000));
    utterance.lang = "zh-CN";
    utterance.rate = 0.88;
    utterance.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find((voice) => /zh[-_]CN/i.test(voice.lang));
    if (zhVoice) utterance.voice = zhVoice;

    activeUtterance = utterance;
    activeSpeakButton = button || null;
    if (activeSpeakButton) {
      activeSpeakButton.classList.add("is-speaking");
      activeSpeakButton.dataset.speaking = "true";
    }

    utterance.onend = () => {
      activeUtterance = null;
      resetSpeakButton();
    };
    utterance.onerror = () => {
      activeUtterance = null;
      resetSpeakButton();
    };

    window.speechSynthesis.speak(utterance);
    return true;
  }

  function speakPage() {
    const main = document.getElementById("main") || document.body;
    const text = main.innerText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join("。");
    speakText(text);
  }

  function bindSpeechButtons() {
    document.addEventListener("click", (event) => {
      const pageButton = event.target.closest("[data-read-page]");
      if (pageButton) {
        event.preventDefault();
        speakPage();
        return;
      }

      const targetButton = event.target.closest("[data-read-target]");
      if (targetButton) {
        event.preventDefault();
        const target = document.querySelector(targetButton.dataset.readTarget);
        if (target) speakText(target.innerText, targetButton);
        return;
      }

      const textButton = event.target.closest("[data-read-text]");
      if (textButton) {
        event.preventDefault();
        speakText(textButton.dataset.readText, textButton);
      }
    });
  }

  /* ---------- Toast ---------- */

  let toastTimer = null;

  function showToast(message, type = "") {
    let region = document.querySelector(".toast-region");
    if (!region) {
      region = document.createElement("div");
      region.className = "toast-region";
      region.setAttribute("aria-live", "polite");
      region.setAttribute("aria-atomic", "true");
      document.body.appendChild(region);
    }
    region.innerHTML = "";
    const toast = document.createElement("div");
    toast.className = `toast${type ? ` toast-${type}` : ""}`;
    toast.innerHTML = `<span data-icon="${type === "error" ? "alert-circle" : "check-circle"}"></span><span></span>`;
    toast.lastElementChild.textContent = message;
    region.appendChild(toast);
    hydrateIcons(toast);

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3200);
  }

  /* ---------- 复制与分享 ---------- */

  async function copyText(text) {
    const value = String(text || "");
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        showToast("已复制，可以发给家人看看");
        return true;
      }
    } catch (error) {
      /* 使用下方兼容方案 */
    }

    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (ok) {
        showToast("已复制，可以发给家人看看");
        return true;
      }
    } catch (error) {
      /* 提示失败 */
    }

    showToast("复制没有成功，请手动选择文字复制。", "error");
    return false;
  }

  async function shareText(data) {
    const payload =
      typeof data === "string"
        ? { title: "银龄无诈", text: data }
        : { title: data.title || "银龄无诈", text: data.text || "", url: data.url || "" };

    if (navigator.share) {
      try {
        await navigator.share(payload);
        return true;
      } catch (error) {
        if (error && error.name === "AbortError") return false;
      }
    }
    return copyText(payload.text);
  }

  /* ---------- 格式化 ---------- */

  function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        ...(sameYear ? {} : { year: "numeric" }),
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(date);
    } catch (error) {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function greetingByHour(date = new Date()) {
    const hour = date.getHours();
    if (hour < 6) return "夜深了";
    if (hour < 11) return "早上好";
    if (hour < 13) return "中午好";
    if (hour < 18) return "下午好";
    return "晚上好";
  }

  /* ---------- 导航与初始化 ---------- */

  function bindNavigation() {
    const toggle = document.getElementById("menuToggle");
    const nav = document.getElementById("siteNav");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      document.body.classList.toggle("nav-open", open);
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-open");
      }
    });

    document.addEventListener("click", (event) => {
      if (!nav.classList.contains("is-open")) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.classList.remove("nav-open");
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        document.body.classList.remove("nav-open");
        toggle.focus();
      }
    });
  }

  function bindQuickFontToggle() {
    const toggle = document.getElementById("quickFontToggle");
    if (!toggle) return;
    toggle.addEventListener("click", () => {
      const next = settings.font === "normal" ? "large" : "normal";
      saveSettings({ font: next }, {
        toast: next === "normal" ? "已关闭大字模式" : "大字模式已开启，字更大更清楚",
      });
      if (settings.autoRead && next === "large") {
        speakText("大字模式已经开启。");
      }
    });
  }

  function init() {
    applySettings();
    hydrateIcons();
    injectDisplayDialog();
    injectContactDialog();
    hydrateIcons();
    bindDialogs();
    bindSpeechButtons();
    bindNavigation();
    bindQuickFontToggle();
    updateFontControls();
    updatePersonalization();

    document.addEventListener("click", (event) => {
      if (event.target.closest('[data-open-dialog="contactDialog"]')) {
        window.setTimeout(fillContactForm, 0);
      }
    });

    const year = document.getElementById("footerYear");
    if (year) year.textContent = String(new Date().getFullYear());

    document.querySelectorAll("img[data-fallback]").forEach((image) => {
      image.addEventListener("error", () => {
        image.hidden = true;
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.YinLing = {
    icons: hydrateIcons,
    getSettings,
    saveSettings,
    openDialog,
    closeDialog,
    showToast,
    speakText,
    stopSpeaking,
    speakPage,
    copyText,
    shareText,
    formatTime,
    escapeHTML,
    greetingByHour,
    readJSON,
    writeJSON,
    setJSON: writeJSON,
    getJSON: readJSON,
  };
})();
