/**
 * Shared anchored-popover helper for Crafting Core selector controls.
 * Foundry VTT 14 runs on a Chromium build with the Popover API; native popovers
 * render in the browser top layer, so ApplicationV2 scroll containers never
 * expand or clip the selector menu.
 */
export class PopoverSelect {
  static wire(root) {
    if (!root) return;
    root.querySelectorAll("[data-cc-popover-trigger]").forEach(trigger => {
      if (trigger.dataset.ccPopoverWired === "true") return;
      trigger.dataset.ccPopoverWired = "true";
      const id = String(trigger.dataset.ccPopoverTarget ?? "").trim();
      if (!id) return;
      const escaped = globalThis.CSS?.escape ? CSS.escape(id) : id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
      const panel = root.querySelector(`#${escaped}`) ?? document.getElementById(id);
      if (!panel) return;

      const updateExpanded = open => {
        trigger.setAttribute("aria-expanded", open ? "true" : "false");
        trigger.classList.toggle("is-open", open);
      };
      const position = () => this.#position(trigger, panel);

      if (typeof panel.showPopover === "function" && typeof panel.hidePopover === "function") {
        trigger.addEventListener("click", event => {
          event.preventDefault();
          event.stopPropagation();
          const open = panel.matches(":popover-open");
          if (open) panel.hidePopover();
          else {
            panel.showPopover();
            requestAnimationFrame(position);
          }
        });
        panel.addEventListener("toggle", event => {
          const open = event.newState === "open" || panel.matches(":popover-open");
          updateExpanded(open);
          if (open) requestAnimationFrame(position);
        });
        return;
      }

      // Defensive fallback for an unexpectedly old embedded browser. It still
      // uses fixed positioning, so opening the selector never changes layout.
      panel.hidden = true;
      trigger.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        const open = panel.hidden;
        root.querySelectorAll("[data-cc-popover-panel].is-open").forEach(other => {
          if (other === panel) return;
          other.hidden = true;
          other.classList.remove("is-open");
          const otherId = other.id;
          root.querySelector(`[data-cc-popover-target="${otherId}"]`)?.setAttribute("aria-expanded", "false");
        });
        panel.hidden = !open;
        panel.classList.toggle("is-open", open);
        updateExpanded(open);
        if (open) requestAnimationFrame(position);
      });
      root.addEventListener("keydown", event => {
        if (event.key !== "Escape" || panel.hidden) return;
        panel.hidden = true;
        panel.classList.remove("is-open");
        updateExpanded(false);
      });
    });
  }

  static #position(trigger, panel) {
    if (!trigger?.isConnected || !panel?.isConnected) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth || 1024;
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight || 768;
    const width = Math.min(
      Math.max(rect.width, Number(panel.dataset.popoverMinWidth) || 220),
      Math.max(220, viewportWidth - (margin * 2))
    );
    panel.style.width = `${Math.round(width)}px`;
    panel.style.maxWidth = `${Math.max(220, viewportWidth - (margin * 2))}px`;

    const availableBelow = Math.max(100, viewportHeight - rect.bottom - margin - 4);
    const availableAbove = Math.max(100, rect.top - margin - 4);
    const naturalHeight = Math.min(panel.scrollHeight || 240, 320);
    const openBelow = availableBelow >= Math.min(naturalHeight, 180) || availableBelow >= availableAbove;
    const maxHeight = Math.max(100, openBelow ? availableBelow : availableAbove);
    panel.style.maxHeight = `${Math.round(maxHeight)}px`;

    const measuredHeight = Math.min(panel.scrollHeight || naturalHeight, maxHeight);
    const top = openBelow ? rect.bottom + 4 : rect.top - measuredHeight - 4;
    const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(Math.max(margin, top))}px`;
  }
}
