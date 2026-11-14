(payload => {
  try {
    if (window !== window.top || location.href !== payload.url || location.origin !== payload.origin) return "changed";
    const visible = el => !el.disabled && !el.readOnly && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    const inputs = Array.from(document.querySelectorAll("input")).filter(visible);
    if (inputs.some(el => el.autocomplete === "new-password")) return "missing";
    const passwords = inputs.filter(el => el.type === "password" && el.autocomplete !== "new-password");
    if (passwords.length > 1) return "ambiguous";
    const password = passwords[0];
    const candidates = inputs.filter(el => ["text", "email", "tel"].includes(el.type) && el.autocomplete !== "one-time-code" && (!password || el.form === password.form));
    const explicit = candidates.filter(el => el.autocomplete === "username" || el.type === "email");
    let username = explicit.length === 1 ? explicit[0] : undefined;
    if (!username && password) {
      const preceding = candidates.filter(el => el.form === password.form && (el.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING));
      username = preceding.at(-1);
    }
    if (!username && !password && candidates.length === 1 && /user|login|email|identifier/i.test(candidates[0].name + candidates[0].id)) username = candidates[0];
    if (!password && !username) return "missing";
    // Refuse forms that would submit credentials to another origin or insecure endpoint.
    for (const el of [username, password].filter(Boolean)) {
      if (el.form && new URL(el.form.action || location.href, location.href).origin !== payload.origin) return "unsafe-form";
    }
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const set = (el, value) => {
      if (!el) return;
      setter.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    set(username, payload.username);
    set(password, payload.password);
    return password ? "filled" : "username-only";
  } catch { return "failed"; }
})
