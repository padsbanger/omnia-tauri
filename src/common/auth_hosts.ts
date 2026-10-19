const GOOGLE_HOSTS = [
  "mail.google.com",
  "accounts.google.com",
  "google.com",
  "googleapis.com",
  "googleusercontent.com",
  "gstatic.com",
];

const FACEBOOK_HOSTS = [
  "facebook.com",
  "messenger.com",
  "fbcdn.net",
  "fbsbx.com",
];

const TWITTER_HOSTS = ["twitter.com", "x.com", "t.co", "twimg.com"];

const SLACK_HOSTS = [
  "slack.com",
  "app.slack.com",
  "slack-edge.com",
  "slack-imgs.com",
  "slackb.com",
  "slack-files.com",
];

const TELEGRAM_HOSTS = ["telegram.org", "telegram.me", "t.me", "telegra.ph"];

const WHATSAPP_HOSTS = [
  "whatsapp.com",
  "web.whatsapp.com",
  "wa.me",
  "whatsapp.net",
  "static.whatsapp.net",
];

const MICROSOFT_TEAMS_HOSTS = [
  "teams.microsoft.com",
  "teams.live.com",
  "login.microsoftonline.com",
  "login.live.com",
  "office.com",
  "office.net",
  "office365.com",
  "microsoft.com",
  "microsoftonline.com",
  "msauth.net",
  "msftauth.net",
  "microsoft365.com",
];

const TRADINGVIEW_HOSTS = [
  "tradingview.com",
  "sso.tradingview.com",
  ...FACEBOOK_HOSTS,
  ...TWITTER_HOSTS,
  ...GOOGLE_HOSTS,
];

const SPOTIFY_HOSTS = [
  "open.spotify.com",
  "spotify.com",
  "spotifycdn.com",
  "spotifyads.com",
  ...FACEBOOK_HOSTS,
  ...TWITTER_HOSTS,
  ...GOOGLE_HOSTS,
];

const CHATGPT_HOSTS = [
  "chatgpt.com",
  "chat.openai.com",
  "auth.openai.com",
  "openai.com",
  "oaistatic.com",
  "oaiusercontent.com",
];

const CLAUDE_HOSTS = ["claude.ai", "anthropic.com"];

export {
  CHATGPT_HOSTS,
  CLAUDE_HOSTS,
  GOOGLE_HOSTS,
  FACEBOOK_HOSTS,
  TWITTER_HOSTS,
  SLACK_HOSTS,
  TELEGRAM_HOSTS,
  WHATSAPP_HOSTS,
  MICROSOFT_TEAMS_HOSTS,
  TRADINGVIEW_HOSTS,
  SPOTIFY_HOSTS,
};
