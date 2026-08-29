import { MODULE_ID } from "../constants.mjs";

export class ResultDialog {
  static #normalizePhrase(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  }

  static #bringForward(dialog) {
    try { dialog?.bringToFront?.(); }
    catch (_) { /* foreground is best-effort */ }
    requestAnimationFrame(() => {
      try { dialog?.bringToFront?.(); }
      catch (_) { /* foreground is best-effort */ }
    });
    for (const delay of [60, 180]) setTimeout(() => {
      try { dialog?.bringToFront?.(); }
      catch (_) { /* foreground is best-effort */ }
    }, delay);
  }

  static #renderCallback(_event, dialog) {
    this.#bringForward(dialog);
  }

  static async show({ title="Crafting Result", message="", facts=[], tone="info", icon="fa-solid fa-hammer" }={}) {
    const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
    const safeFacts = (Array.isArray(facts) ? facts : []).filter(Boolean).map(fact => `<li>${escape(fact)}</li>`).join("");
    const content = `
      <section class="cc-result-dialog cc-result-${escape(tone)}">
        <div class="cc-result-dialog-icon"><i class="${escape(icon)}"></i></div>
        <div class="cc-result-dialog-copy">
          <span class="cc-kicker">Crafting Core</span>
          <h2>${escape(title)}</h2>
          ${message ? `<p>${escape(message)}</p>` : ""}
          ${safeFacts ? `<ul>${safeFacts}</ul>` : ""}
        </div>
      </section>`;

    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (!DialogV2?.wait) {
      const fallback = [title, message, ...(facts ?? [])].filter(Boolean).join(" — ");
      if (tone === "danger" || tone === "warning") ui.notifications.warn(fallback);
      else ui.notifications.info(fallback);
      return null;
    }

    try {
      return await DialogV2.wait({
        window: { title: `Crafting Core — ${title}` },
        content,
        modal: true,
        render: (event, dialog) => this.#renderCallback(event, dialog),
        buttons: [{ action: "ok", label: "OK", icon: "fa-solid fa-check", default: true }]
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Result dialog could not be displayed.`, error);
      return null;
    }
  }

  static async confirmPhrase({
    title="Confirm Action",
    message="",
    warning="",
    phrase="I AGREE",
    confirmLabel="Confirm",
    icon="fa-solid fa-triangle-exclamation"
  }={}) {
    const DialogV2 = foundry.applications?.api?.DialogV2;
    if (!DialogV2?.wait) return false;
    const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
    const normalizedExpected = this.#normalizePhrase(phrase);
    const content = `
      <section class="cc-confirm-dialog">
        <div class="cc-result-dialog cc-result-warning">
          <div class="cc-result-dialog-icon"><i class="${escape(icon)}"></i></div>
          <div class="cc-result-dialog-copy">
            <span class="cc-kicker">Crafting Core</span>
            <h2>${escape(title)}</h2>
            ${message ? `<p>${escape(message)}</p>` : ""}
            ${warning ? `<p class="cc-confirm-warning">${escape(warning)}</p>` : ""}
          </div>
        </div>
        <label class="cc-confirm-phrase-field">
          <span>Type <strong>${escape(phrase)}</strong> to confirm</span>
          <input type="text" name="confirmation" autocomplete="off" autofocus placeholder="${escape(phrase)}">
        </label>
      </section>`;

    try {
      const result = await DialogV2.wait({
        window: { title: `Crafting Core — ${title}` },
        content,
        modal: true,
        rejectClose: false,
        render: (event, dialog) => {
          this.#renderCallback(event, dialog);
          const root = dialog?.element;
          const input = root?.querySelector?.('input[name="confirmation"]');
          const confirmButton = root?.querySelector?.('[data-action="confirm"]');
          const refresh = () => {
            if (confirmButton) confirmButton.disabled = this.#normalizePhrase(input?.value) !== normalizedExpected;
          };
          input?.addEventListener?.("input", refresh);
          refresh();
        },
        buttons: [
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" },
          {
            action: "confirm",
            label: confirmLabel,
            icon: "fa-solid fa-check",
            callback: (_event, button) => this.#normalizePhrase(button?.form?.elements?.confirmation?.value) === normalizedExpected
          }
        ]
      });
      return result === true;
    } catch (error) {
      console.warn(`${MODULE_ID} | Confirmation dialog could not be displayed.`, error);
      return false;
    }
  }

  static error(message, title="Crafting Action Failed") {
    return this.show({ title, message, tone: "danger", icon: "fa-solid fa-triangle-exclamation" });
  }
}
