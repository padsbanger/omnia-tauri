// Adapted from Omnia 4c76ff5, MIT; source attribution in LICENSE.

(() => {
  if (window.top !== window) return;
  const maxUnreadCount = 9999;
  const titleCountPattern = "\\((\\d+(?:[.,]\\d+)?\\s*k|\\d[\\d\\s,.]*)\\+?\\)";
  const isTelegramHost = /(^|\.)telegram\.(?:org|me)$/i.test(location.hostname);

  if (window.__omniaUnreadTrackerInstalled) {
    return;
  }

  window.__omniaUnreadTrackerInstalled = true;

  const parseCount = (value) => {
    if (!value) {
      return null;
    }

    const normalized = String(value).replace(/\u00a0/g, " ");
    const compactMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*k\+?/i);

    if (compactMatch) {
      return Math.min(maxUnreadCount, Math.floor(Number(compactMatch[1].replace(",", ".")) * 1000));
    }

    const numberMatch = normalized.match(/\b(\d[\d\s,.]*)\+?\b/);

    if (!numberMatch) {
      return null;
    }

    const digitsOnly = numberMatch[1].replace(/\D/g, "");
    const count = Number.parseInt(digitsOnly, 10);

    if (!Number.isFinite(count)) {
      return null;
    }

    return Math.min(maxUnreadCount, count);
  };

  const parseUnreadText = (value) => {
    if (!value) {
      return null;
    }

    const text = String(value).replace(/\s+/g, " ").trim();
    const unreadPhrase = text.match(/(\d[\d\s,.]*|\d+(?:[.,]\d+)?\s*k)\+?\s+(?:new|unread|notification|notifications?|messages?)\b/i);

    if (unreadPhrase) {
      return parseCount(unreadPhrase[1]);
    }

    const inboxPhrase = text.match(/\bInbox\b[^\d]{0,40}(\d[\d\s,.]*|\d+(?:[.,]\d+)?\s*k)\+?/i);

    if (inboxPhrase) {
      return parseCount(inboxPhrase[1]);
    }

    return null;
  };

  const parseTelegramTitleCount = (value) => {
    if (!isTelegramHost) {
      return null;
    }

    const text = String(value).replace(/\s+/g, " ").trim();

    const telegramParenthesized = text.match(/telegram[^\d]{0,35}\((\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?\)/i);

    if (telegramParenthesized) {
      return parseCount(telegramParenthesized[1]);
    }

    const telegramSuffix = text.match(/(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?\s+messages?\b/i);
    if (telegramSuffix) {
      return parseCount(telegramSuffix[1]);
    }

    return null;
  };

  const readElementValues = (element) =>
    [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-tooltip"),
      element.textContent,
    ]
      .filter(Boolean);

  const readElementText = (element) =>
    readElementValues(element).join(" ");

  const isElementVisible = (element) => {
    if (element.closest('[hidden], [aria-hidden="true"]')) {
      return false;
    }

    if (typeof window.getComputedStyle === "function") {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
    }

    return (
      typeof element.getClientRects !== "function" ||
      element.getClientRects().length > 0
    );
  };

  const parseExactCount = (value) => {
    if (!value) {
      return null;
    }

    const match = String(value)
      .replace(/ /g, " ")
      .trim()
      .match(/^(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?$/i);

    return match ? parseCount(match[1]) : null;
  };

  const findSiblingBadgeCount = (row, inboxElement) => {
    const visibleLinks = Array.from(row.querySelectorAll('a[href]'))
      .filter(isElementVisible);

    // An ancestor with several links is the mailbox navigation container,
    // not the Inbox row. Scanning it can steal another label's badge.
    if (visibleLinks.length > 1) {
      return { count: null, reachedNavigationContainer: true };
    }

    const candidates = Array.from(
      row.querySelectorAll('[aria-label], [title], [data-tooltip], span, div'),
    );

    for (const candidate of candidates) {
      if (
        candidate === row ||
        candidate === inboxElement ||
        candidate.contains(inboxElement) ||
        inboxElement.contains(candidate) ||
        !isElementVisible(candidate)
      ) {
        continue;
      }

      for (const value of readElementValues(candidate)) {
        const count = parseExactCount(value);
        if (count !== null) {
          return { count, reachedNavigationContainer: false };
        }
      }
    }

    return { count: null, reachedNavigationContainer: false };
  };

  const findFromElements = (selector) => {
    const elements = Array.from(document.querySelectorAll(selector));

    for (const element of elements) {
      if (!isElementVisible(element)) {
        continue;
      }

      const directText = readElementText(element);
      const directCount = parseUnreadText(directText) ?? parseCount(directText);

      if (directCount !== null) {
        return directCount;
      }

      // Gmail renders the unread badge next to the Inbox link rather than
      // inside it in some layouts. Inspect exact numeric badge elements in
      // the nearest row, then stop before reaching the full mailbox nav.
      let row = element.parentElement;
      let depth = 0;

      while (row && depth < 4) {
        const { count, reachedNavigationContainer } = findSiblingBadgeCount(
          row,
          element,
        );

        if (count !== null) {
          return count;
        }

        if (reachedNavigationContainer) {
          break;
        }

        row = row.parentElement;
        depth += 1;
      }
    }

    return null;
  };

  const readGmail = () => {
    if (!/(^|\.)mail\.google\./i.test(location.hostname)) {
      return null;
    }

    const inboxSelector = [
      'a[href="#inbox"]',
      'a[href$="#inbox"]',
      'a[href*="#inbox"]',
      'a[href*="/#inbox"]',
      '[aria-label*="Inbox" i]',
      '[data-tooltip="Inbox"]',
      '[title="Inbox"]',
    ].join(",");

    const count = findFromElements(inboxSelector);

    if (count !== null) {
      return count;
    }

    // The Inbox link can be present before Gmail has rendered its badge. Do
    // not turn "badge not found" into a false zero; the title is the fallback.
    return null;
  };

  // AnimatedCounter briefly contains current, outgoing and incoming digits.
  // Read its sizing/current digit once, independent of hashed CSS modules.
  const telegramCounterText = (node) => {
    if (node.nodeType === 3) return node.textContent;
    const children = Array.from(node.childNodes);
    if (children.length === 3 && children.every(child => child.nodeName === 'DIV')) {
      return telegramCounterText(children[0]);
    }
    return children.map(telegramCounterText).join('');
  };

  const readTelegramA = () => {
    const rows = Array.from(document.querySelectorAll('#LeftColumn .chat-list .Chat'))
      .filter(isElementVisible);
    if (rows.length === 0) return null;
    const counts = new Map();
    for (const row of rows) {
      let count = 0;
      // Web A's current badge classes are hashed. Its transition class and
      // numeric AnimatedCounter span are stable; bot buttons/icons are excluded.
      const counters = row.querySelectorAll(
        '.subtitle .chat-badge-transition.open div > span, .subtitle .Badge.unread',
      );
      for (const counter of counters) {
        if (!isElementVisible(counter)) continue;
        count = Math.max(count, parseExactCount(counter.getAttribute('aria-label'))
          ?? parseExactCount(telegramCounterText(counter)) ?? 0);
      }
      const peer = row.querySelector('a.ListItem-button[href]')?.getAttribute('href') || row;
      counts.set(peer, Math.max(counts.get(peer) || 0, count));
    }
    return Math.min(maxUnreadCount, Array.from(counts.values()).reduce((a, b) => a + b, 0));
  };

  // Telegram can leave both document.title and the page Badging API unchanged
  // while its chat list has unread items. Read only the dedicated counters,
  // never message text, dates, bot buttons, pinned icons or archive summaries.
  const readTelegram = () => {
    if (!isTelegramHost) return null;
    const webA = readTelegramA();
    if (webA !== null) return webA;
    const rows = Array.from(document.querySelectorAll(
      '#column-left .chatlist .chatlist-chat[data-peer-id], #column-left .chatlist .rp[data-peer-id]',
    )).filter(isElementVisible);
    if (rows.length === 0) return null;
    const counts = new Map();
    for (const row of rows) {
      const badges = row.querySelectorAll(
        '.dialog-subtitle-badge-unread, .dialog-subtitle-badge.unread:not(.avatar-badge)',
      );
      let count = 0;
      for (const badge of badges) {
        if (!isElementVisible(badge)) continue;
        // Rolling digits can contain outgoing and incoming text at once;
        // Telegram's accessible label contains the actual current count.
        const value = parseExactCount(badge.getAttribute('aria-label'))
          ?? parseExactCount(badge.textContent)
          ?? (badge.classList.contains('is-badge-empty') || badge.classList.contains('mention') ? 1 : 0);
        count = Math.max(count, value);
      }
      const peer = row.getAttribute('data-peer-id');
      counts.set(peer, Math.max(counts.get(peer) || 0, count));
    }
    return Math.min(maxUnreadCount, Array.from(counts.values()).reduce((a, b) => a + b, 0));
  };

  const readTitle = () => {
    const titleText = String(document.title || "");
    const unreadTextCount = parseUnreadText(titleText);
    if (unreadTextCount !== null) {
      return unreadTextCount;
    }

    const telegramTitleCount = parseTelegramTitleCount(titleText);
    if (telegramTitleCount !== null) {
      return telegramTitleCount;
    }

    const titleMatch = titleText.match(new RegExp(titleCountPattern, "i"));
    return titleMatch ? parseCount(titleMatch[1]) : null;
  };

  // A hint is delivered only after native acknowledgement. Startup may precede
  // bridge readiness, and the native rate limit can reject an otherwise valid
  // update. Keep only the latest pending value per source and retry failures.
  const acknowledged = new Map();
  const pending = new Map();
  let sending = false;
  let deliveryTimer = null;
  let retryDelay = 250;
  const scheduleDelivery = (delay) => {
    if (deliveryTimer !== null) return;
    deliveryTimer = window.setTimeout(() => {
      deliveryTimer = null;
      deliver();
    }, delay);
  };
  const deliver = () => {
    if (sending || deliveryTimer !== null || pending.size === 0) return;
    const bridge = window.__TAURI_INTERNALS__;
    if (typeof bridge?.invoke !== "function") {
      scheduleDelivery(retryDelay);
      retryDelay = Math.min(5000, retryDelay * 2);
      return;
    }
    const [key, value] = pending.entries().next().value;
    const { source, count } = value;
    pending.delete(key);
    sending = true;
    Promise.resolve().then(() => bridge.invoke("page_signal", { count, source }))
      .then(() => {
        acknowledged.set(key, value);
        retryDelay = 250;
      }, () => {
        if (!pending.has(key)) pending.set(key, value);
        retryDelay = Math.min(5000, retryDelay * 2);
      })
      .finally(() => {
        sending = false;
        if (pending.size > 0) scheduleDelivery(retryDelay);
      });
  };
  const emit = (count, source) => {
    const normalizedCount = Math.max(0, Math.min(maxUnreadCount, Math.floor(count)));
    // Gmail DOM and title are alternate readings of the same count. A title
    // zero must be delivered again after a DOM count, even if that same zero
    // was acknowledged before. Coalesce retries across both readings too.
    const key = source.startsWith("gmail-") ? "gmail" : source;
    const previous = acknowledged.get(key);
    if (previous?.count === normalizedCount && previous.source === source && !pending.has(key) && !sending) return;
    pending.set(key, { source, count: normalizedCount });
    deliver();
  };

  const installTelegramAppBadgeBridge = () => {
    if (!isTelegramHost || window.__omniaTelegramAppBadgeBridgeInstalled) {
      return;
    }

    window.__omniaTelegramAppBadgeBridgeInstalled = true;

    const setAppBadge = (value = 0) => {
      const numericValue = Number(value);
      emit(Number.isFinite(numericValue) ? numericValue : 0, "telegram-app-badge");
      return Promise.resolve();
    };

    const clearAppBadge = () => {
      emit(0, "telegram-app-badge");
      return Promise.resolve();
    };

    // Web A detects Tauri and bypasses navigator.setAppBadge in favour of
    // this host callback. Expose only the same bounded, untrusted count hint.
    const telegramHost = window.tauri || {};
    if (typeof telegramHost.setNotificationsCount !== 'function') {
      telegramHost.setNotificationsCount = setAppBadge;
    }
    if (!window.tauri) window.tauri = telegramHost;

    try {
      Object.defineProperties(window.navigator, {
        setAppBadge: {
          configurable: true,
          value: setAppBadge,
        },
        clearAppBadge: {
          configurable: true,
          value: clearAppBadge,
        },
      });
    } catch {
      window.navigator.setAppBadge = setAppBadge;
      window.navigator.clearAppBadge = clearAppBadge;
    }
  };

  installTelegramAppBadgeBridge();

  const read = () => {
    const isGmail = /(^|\.)mail\.google\./i.test(location.hostname);

    if (isGmail) {
      const gmailCount = readGmail();

      if (gmailCount !== null) {
        emit(gmailCount, "gmail-dom");
        return;
      }

      // Gmail removes the numeric marker when the unread count reaches zero.
      // The pattern supports both "(12) Inbox" and localized/suffix formats
      // such as "Odebrane (12)".
      const gmailTitleCount = readTitle();
      emit(gmailTitleCount ?? 0, "gmail-title");
      return;
    }

    const telegramCount = readTelegram();
    if (telegramCount !== null) {
      emit(telegramCount, "telegram-dom");
      return;
    }
    const titleCount = readTitle();
    emit(titleCount ?? 0, "title");
  };

  let readTimer = null;
  const scheduleRead = () => {
    if (readTimer) {
      return;
    }

    readTimer = window.setTimeout(() => {
      readTimer = null;
      read();
    }, 250);
  };

  const observer = new MutationObserver(scheduleRead);

  const startObserver = () => {
    const target = document.documentElement || document.body;

    if (!target) {
      return;
    }

    observer.observe(target, {
      attributes: true,
      attributeFilter: ["aria-label", "title", "data-tooltip", "class", "hidden", "aria-hidden"],
      childList: true,
      characterData: true,
      subtree: true,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      startObserver();
      read();
    }, { once: true });
  } else {
    startObserver();
    read();
  }

  window.setInterval(read, 5000);
})();

(() => {
  if (window.top !== window) return;
  const discover = () => { const icon = document.querySelector('link[rel~="icon"]'); const url = icon?.href || new URL('/favicon.ico', location.href).href; window.__TAURI_INTERNALS__?.invoke('page_favicon', { url }).catch(() => {}); };
  addEventListener('DOMContentLoaded', discover, { once: true });
})();
