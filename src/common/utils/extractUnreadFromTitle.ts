export const MAX_UNREAD_COUNT = 9999;

// Gmail uses both "(12) Inbox" and "Inbox (12)" title formats depending on
// locale and rollout. Keep this source shared with the injected DOM tracker so
// the main process and the page never disagree about the same title.
export const UNREAD_TITLE_COUNT_PATTERN_SOURCE = String.raw`\((\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?\)`;
const UNREAD_TITLE_KEYWORD_PATTERN = String.raw`(?:new|unread|notification|notifications?|messages?|mentions?)`;
const UNREAD_TITLE_TRAILING_KEYWORD_PATTERN_SOURCE = String.raw`(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?\s*(?:${UNREAD_TITLE_KEYWORD_PATTERN})\b`;
const UNREAD_TITLE_LEADING_KEYWORD_PATTERN_SOURCE = String.raw`(?:${UNREAD_TITLE_KEYWORD_PATTERN})\D{0,40}(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?`;
const UNREAD_TITLE_TELEGRAM_LEADING_PATTERN_SOURCE = String.raw`Telegram[^\\d]{0,35}(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?`;
const UNREAD_TITLE_TELEGRAM_TRAILING_PATTERN_SOURCE = String.raw`(\d+(?:[.,]\d+)?\s*k|\d[\d\s,.]*)\+?[^\\d]{0,35}Telegram`;

const UNREAD_TITLE_COUNT_PATTERNS = [
  UNREAD_TITLE_COUNT_PATTERN_SOURCE,
  UNREAD_TITLE_TRAILING_KEYWORD_PATTERN_SOURCE,
  UNREAD_TITLE_LEADING_KEYWORD_PATTERN_SOURCE,
  UNREAD_TITLE_TELEGRAM_LEADING_PATTERN_SOURCE,
  UNREAD_TITLE_TELEGRAM_TRAILING_PATTERN_SOURCE,
];

export const parseUnreadCount = (value: string): number | null => {
  const normalized = value.replace(/\u00a0/g, " ").trim();
  const compactMatch = normalized.match(/^(\d+(?:[.,]\d+)?)\s*k$/i);

  if (compactMatch) {
    const compactCount = Number(compactMatch[1].replace(",", ".")) * 1000;
    return Number.isFinite(compactCount)
      ? Math.min(MAX_UNREAD_COUNT, Math.floor(compactCount))
      : null;
  }

  const digitsOnly = normalized.replace(/\D/g, "");
  if (!digitsOnly) return null;

  const count = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(count) ? Math.min(MAX_UNREAD_COUNT, count) : null;
};

export const findUnreadInTitle = (title: string): number | null => {
  for (const pattern of UNREAD_TITLE_COUNT_PATTERNS) {
    const match = title.match(new RegExp(pattern, "i"));
    if (!match) continue;

    const rawCandidate = match[1] ?? match[0];
    const count = parseUnreadCount(rawCandidate);
    if (count !== null) return count;
  }

  return null;
};

function extractUnreadFromTitle(title: string): number {
  return findUnreadInTitle(title) ?? 0;
}

export default extractUnreadFromTitle;
