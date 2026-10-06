import { MODULE_ID } from "../constants.mjs";

export class ResultDialog {
  static #queue = Promise.resolve();

  static show(options={}) {
    const task = this.#queue.then(() => this.#showNow(options));
    // A display failure must never poison later crafting feedback.
    this.#queue = task.catch(() => null);
    return task;
  }

  static async #showNow({ title="Crafting Result", message="", facts=[], tone="info", icon="fa-solid fa-hammer" }={}) {
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
        modal: false,
        rejectClose: false,
        render: (_event, dialog) => {
          // Keep crafting feedback above ordinary sheets without repeatedly focusing or
          // blocking the rest of Foundry. The queue ensures there is only one at a time.
          const root = dialog?.element;
          if (root?.style) root.style.setProperty("z-index", "2147483000", "important");
        },
        buttons: [{ action: "ok", label: "OK", icon: "fa-solid fa-check", default: true }]
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | Result dialog could not be displayed.`, error);
      return null;
    }
  }

  static error(message, title="Crafting Action Failed") {
    return this.show({ title, message, tone: "danger", icon: "fa-solid fa-triangle-exclamation" });
  }
}
