import { MODULE_ID } from "../constants.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const clampPercent = value => Math.max(0, Math.min(100, Number.isFinite(Number(value)) ? Number(value) : 0));

export class OperationProgressApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static #active = null;
  static #last = null;
  #elapsedTimer = null;
  #progressState = {};
  #startedAt = 0;
  #endedAt = null;
  #running = false;

  static DEFAULT_OPTIONS = {
    id: "crafting-core-operation-progress",
    classes: ["crafting-core", "crafting-core-operation-progress"],
    tag: "section",
    position: { width: 520, height: 390 },
    window: { title: "Crafting Core — Working", resizable: false, minimizable: false }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/operation-progress.hbs` }
  };

  static get busy() {
    return Boolean(this.#active?.#running);
  }

  static async run({ title="Crafting Core — Working", initial={}, task, summarize=null }={}) {
    if (this.busy) {
      this.#active?.bringToFront?.();
      ui.notifications.warn("Crafting Core is already running another maintenance operation.");
      return null;
    }
    if (typeof task !== "function") throw new Error("Crafting Core progress operation requires a task.");

    if (this.#last && !this.#last.#running) {
      try { await this.#last.close({ force: true }); }
      catch (_) { /* The previous result window may already be closed. */ }
    }

    const app = new this({ window: { title } });
    app.#progressState = {
      phase: String(initial.phase ?? "Preparing…"),
      label: String(initial.label ?? ""),
      detail: String(initial.detail ?? ""),
      current: Number(initial.current ?? 0),
      total: Number(initial.total ?? 0),
      overallCurrent: Number(initial.overallCurrent ?? 0),
      overallTotal: Number(initial.overallTotal ?? 0),
      stats: { ...(initial.stats ?? {}) },
      status: "running",
      message: "",
      summary: []
    };
    app.#startedAt = performance.now();
    app.#endedAt = null;
    app.#running = true;
    this.#active = app;
    this.#last = app;

    await app.render({ force: true });
    await new Promise(resolve => requestAnimationFrame(() => resolve()));

    const report = update => app.updateProgress(update);
    try {
      const result = await task(report);
      const completion = typeof summarize === "function" ? (summarize(result) ?? {}) : {};
      app.complete(completion);
      return result;
    } catch (error) {
      app.fail(error);
      throw error;
    } finally {
      app.#running = false;
      if (this.#active === app) this.#active = null;
      app.#paint();
    }
  }

  async _prepareContext() {
    return this.#context();
  }

  _onRender() {
    this.element.querySelector('[data-action="close-progress"]')?.addEventListener("click", event => {
      event.preventDefault();
      this.close();
    });
    this.#paint();
    this.#elapsedTimer ??= setInterval(() => this.#paintElapsed(), 500);
  }

  async close(options={}) {
    if (this.#running && !options?.force) {
      ui.notifications.warn("Wait for the current Crafting Core maintenance operation to finish.");
      return this;
    }
    if (this.#elapsedTimer) clearInterval(this.#elapsedTimer);
    this.#elapsedTimer = null;
    return super.close(options);
  }

  updateProgress(update={}) {
    const next = { ...update };
    if (next.stats) next.stats = { ...(this.#progressState.stats ?? {}), ...next.stats };
    this.#progressState = { ...this.#progressState, ...next };
    this.#paint();
  }

  complete({ message="Operation complete.", summary=[], stats=null }={}) {
    this.#endedAt = performance.now();
    if (this.#elapsedTimer) clearInterval(this.#elapsedTimer);
    this.#elapsedTimer = null;
    this.#progressState = {
      ...this.#progressState,
      status: "complete",
      message: String(message ?? "Operation complete."),
      summary: Array.isArray(summary) ? summary : [],
      stats: stats ? { ...(this.#progressState.stats ?? {}), ...stats } : (this.#progressState.stats ?? {})
    };
    this.#paint();
  }

  fail(error) {
    this.#endedAt = performance.now();
    if (this.#elapsedTimer) clearInterval(this.#elapsedTimer);
    this.#elapsedTimer = null;
    this.#progressState = {
      ...this.#progressState,
      status: "error",
      message: String(error?.message ?? error ?? "The operation failed."),
      summary: []
    };
    this.#paint();
  }

  #context() {
    const state = this.#progressState ?? {};
    const total = Number(state.overallTotal ?? 0) > 0 ? Number(state.overallTotal) : Number(state.total ?? 0);
    const current = Number(state.overallTotal ?? 0) > 0 ? Number(state.overallCurrent ?? 0) : Number(state.current ?? 0);
    const percent = total > 0 ? clampPercent(Math.round((current / total) * 100)) : 0;
    return {
      ...state,
      percent,
      running: state.status === "running",
      complete: state.status === "complete",
      failed: state.status === "error",
      counter: Number(state.total ?? 0) > 0 ? `${Number(state.current ?? 0)} / ${Number(state.total ?? 0)}` : "",
      elapsed: this.#elapsedText(),
      statRows: Object.entries(state.stats ?? {}).map(([key, value]) => ({ key, label: this.#statLabel(key), value })),
      summaryRows: Array.isArray(state.summary) ? state.summary : []
    };
  }

  #paint() {
    const root = this.element;
    if (!root) return;
    const context = this.#context();
    const setText = (selector, value) => {
      const node = root.querySelector(selector);
      if (node) node.textContent = value ?? "";
    };

    root.dataset.status = context.status;
    const panel = root.querySelector(".cc-operation-progress-panel");
    if (panel) panel.dataset.status = context.status;
    setText('[data-role="phase"]', context.phase || "Working…");
    setText('[data-role="label"]', context.label || "");
    setText('[data-role="detail"]', context.detail || "");
    setText('[data-role="counter"]', context.counter || "");
    setText('[data-role="percent"]', `${context.percent}%`);
    setText('[data-role="message"]', context.message || "");
    this.#paintElapsed();

    const progress = root.querySelector('progress[data-role="progress"]');
    if (progress) {
      progress.max = 100;
      progress.value = context.percent;
    }

    const icon = root.querySelector('[data-role="status-icon"]');
    if (icon) {
      icon.className = context.failed
        ? "fa-solid fa-triangle-exclamation"
        : context.complete
          ? "fa-solid fa-circle-check"
          : "fa-solid fa-spinner fa-spin";
    }

    const stats = root.querySelector('[data-role="stats"]');
    if (stats) {
      stats.replaceChildren(...context.statRows.map(row => {
        const div = document.createElement("div");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = row.label;
        value.textContent = String(row.value ?? 0);
        div.append(label, value);
        return div;
      }));
      stats.hidden = context.statRows.length === 0;
    }

    const summary = root.querySelector('[data-role="summary"]');
    if (summary) {
      summary.replaceChildren(...context.summaryRows.map(row => {
        const div = document.createElement("div");
        const label = document.createElement("span");
        const value = document.createElement("strong");
        label.textContent = String(row?.label ?? "");
        value.textContent = String(row?.value ?? "");
        div.append(label, value);
        return div;
      }));
      summary.hidden = context.summaryRows.length === 0;
    }

    const close = root.querySelector('[data-action="close-progress"]');
    if (close) close.disabled = context.running;
  }

  #paintElapsed() {
    const node = this.element?.querySelector?.('[data-role="elapsed"]');
    if (node) node.textContent = this.#elapsedText();
  }

  #elapsedText() {
    const now = this.#endedAt ?? (performance.now?.() ?? Date.now());
    const seconds = Math.max(0, Math.floor((now - (this.#startedAt ?? 0)) / 1000));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }

  #statLabel(key) {
    const labels = {
      created: "Created",
      updated: "Updated",
      unchanged: "Unchanged",
      restored: "Restored",
      failed: "Failed",
      skipped: "Skipped",
      products: "Products",
      recipes: "Recipes",
      materials: "Materials"
    };
    return labels[key] ?? String(key).replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
  }
}
