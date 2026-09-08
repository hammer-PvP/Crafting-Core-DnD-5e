/**
 * Presentation helpers for Material origin metadata.
 *
 * Structured flags remain authoritative. This service only renders/replaces the
 * module-owned section inside an Item description so GM-authored prose outside
 * that section is never used as a database and is never overwritten by Resync.
 */
export class MaterialOriginService {
  static GENERATED_ATTRIBUTE = 'data-crafting-core-generated="material-sources"';
  static FLAVOR_ATTRIBUTE = 'data-crafting-core-curated-flavor="true"';
  static LEGACY_GENERIC = /<p>\s*A crafting material from the <strong>Crafting Core Built-in Curated Catalog<\/strong>\.\s*<\/p>/gi;

  static SOURCE_LABELS = Object.freeze({
    creature: "Creature Harvest",
    gathering: "Gathering",
    cultivated: "Cultivation",
    mining: "Mining",
    processed: "Processing",
    vendor: "Vendors"
  });

  static BIOME_LABELS = Object.freeze({
    forest: "Forest",
    grassland: "Grasslands",
    mountain: "Mountain",
    ravine: "Ravine",
    swamp: "Swamp",
    cave: "Cave",
    underdark: "Underdark",
    coast: "Coast",
    desert: "Desert",
    arctic: "Arctic"
  });

  static normalizeSourceTypes(value=[]) {
    const allowed = new Set(Object.keys(this.SOURCE_LABELS));
    return [...new Set(this.#array(value).filter(type => allowed.has(type)))];
  }

  static inferSourceTypes(material={}) {
    const explicit = this.normalizeSourceTypes(material.sourceTypes ?? []);
    if (explicit.length) return explicit;
    const family = String(material.family ?? "profession");
    const nature = String(material.nature ?? "").toLowerCase();
    const tags = new Set(this.#array(material.tags ?? []));
    if (family === "creature" || family === "essence") return ["creature"];
    if (family === "gathering") return nature === "mineral" ? ["mining"] : ["gathering"];
    if (nature === "cultivated" || tags.has("cultivated") || tags.has("crop") || tags.has("domestic") || tags.has("orchard") || tags.has("apiary")) {
      return ["cultivated", "vendor"];
    }
    return ["vendor"];
  }

  static normalizeProcessedFrom(value=[]) {
    return [...new Set(this.#array(value))];
  }

  static normalizeCreatureSources(value=[]) {
    const seen = new Set();
    const rows = [];
    for (const raw of Array.isArray(value) ? value : []) {
      const uuid = String(raw?.uuid ?? raw?.sourceUuid ?? "").trim();
      if (!uuid || seen.has(uuid)) continue;
      seen.add(uuid);
      rows.push({
        uuid,
        name: String(raw?.name ?? "Creature").trim() || "Creature",
        img: String(raw?.img ?? "").trim(),
        sourcePack: String(raw?.sourcePack ?? "").trim(),
        sourcePackLabel: String(raw?.sourcePackLabel ?? "").trim()
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, globalThis.game?.i18n?.lang) || a.uuid.localeCompare(b.uuid));
  }

  static sourceTypeLabel(type, vendorAvailability="") {
    if (type === "vendor" && String(vendorAvailability).toLowerCase() === "specialized") return "Specialized Vendors";
    return this.SOURCE_LABELS[String(type)] ?? this.title(type);
  }

  static biomeLabel(value) {
    const key = String(value ?? "").toLowerCase();
    return this.BIOME_LABELS[key] ?? this.title(key);
  }

  static buildManagedSection(material, creatureSources=[], { materialLookup=null }={}) {
    const sources = this.normalizeCreatureSources(creatureSources);
    const sourceTypes = this.inferSourceTypes(material);
    const biomes = this.#array(material?.biomes ?? []);
    const processedFrom = this.normalizeProcessedFrom(material?.processedFrom ?? []);
    const rows = [];

    if (biomes.length) {
      rows.push(this.#row("Found In", biomes.map(value => `<span>${this.#escape(this.biomeLabel(value))}</span>`).join('<i class="fa-solid fa-angle-right" aria-hidden="true"></i>'), "cc-material-origin-biomes"));
    }

    if (sources.length) {
      const links = sources.map(source => this.#documentLink(source.uuid, source.name)).join('<span class="cc-material-origin-separator"> · </span>');
      rows.push(this.#row("Harvested From", links, "cc-material-origin-creatures"));
    }

    if (processedFrom.length) {
      const links = processedFrom.map(id => {
        const row = materialLookup?.get?.(String(id)) ?? null;
        const name = String(row?.name ?? this.title(id));
        const uuid = String(row?.uuid ?? row?.packUuid ?? "").trim();
        return uuid ? this.#documentLink(uuid, name) : `<span>${this.#escape(name)}</span>`;
      }).join('<span class="cc-material-origin-separator"> · </span>');
      rows.push(this.#row("Processed From", links, "cc-material-origin-processed"));
    }

    // Avoid repeating Creature Harvest when actual Actor links already communicate it,
    // and avoid repeating generic Gathering when Found In already communicates it.
    const obtainedTypes = sourceTypes.filter(type => {
      if (type === "creature" && sources.length) return false;
      if (type === "gathering" && biomes.length) return false;
      return true;
    });
    if (obtainedTypes.length) {
      const labels = obtainedTypes.map(type => `<span>${this.#escape(this.sourceTypeLabel(type, material?.vendorAvailability))}</span>`).join('<span class="cc-material-origin-separator"> · </span>');
      rows.push(this.#row("Obtained Through", labels, "cc-material-origin-types"));
    }

    if (!rows.length) return "";
    return `<section ${this.GENERATED_ATTRIBUTE} class="cc-material-origin"><h3>Material Sources</h3>${rows.join("")}</section>`;
  }

  static mergeManagedSection(existingHtml="", managedSection="", { flavor="" }={}) {
    let html = String(existingHtml ?? "");
    const hadLegacyGeneric = this.LEGACY_GENERIC.test(html);
    this.LEGACY_GENERIC.lastIndex = 0;
    html = html.replace(this.LEGACY_GENERIC, "");
    html = this.#removeManagedSection(html);

    const trimmed = html.trim();
    const curatedFlavor = String(flavor ?? "").trim();
    let prefix = trimmed;
    if (curatedFlavor && (hadLegacyGeneric || !trimmed) && !html.includes(this.FLAVOR_ATTRIBUTE)) {
      prefix = `${trimmed}${trimmed ? "\n" : ""}<p ${this.FLAVOR_ATTRIBUTE}>${this.#escape(curatedFlavor)}</p>`;
    }
    return `${prefix}${prefix && managedSection ? "\n" : ""}${managedSection}`.trim();
  }

  static initialDescription(material, creatureSources=[], options={}) {
    const section = this.buildManagedSection(material, creatureSources, options);
    const flavor = String(material?.flavor ?? "").trim();
    const flavorHtml = flavor ? `<p ${this.FLAVOR_ATTRIBUTE}>${this.#escape(flavor)}</p>` : "";
    return `${flavorHtml}${flavorHtml && section ? "\n" : ""}${section}`.trim();
  }

  static title(value) {
    return String(value ?? "")
      .replace(/^(creature|gathering|trade|essence|special)-/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  static #row(label, content, className="") {
    return `<div class="cc-material-origin-row ${className}"><strong>${this.#escape(label)}</strong><div>${content}</div></div>`;
  }

  static #documentLink(uuid, name) {
    const safeUuid = String(uuid ?? "").replace(/[\[\]{}]/g, "");
    const safeName = String(name ?? "Document").replace(/[{}]/g, "");
    return `<span class="cc-material-document-link">@UUID[${safeUuid}]{${this.#escape(safeName)}}</span>`;
  }

  static #removeManagedSection(html) {
    const marker = this.GENERATED_ATTRIBUTE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`<section\\s+[^>]*${marker}[^>]*>[\\s\\S]*?<\\/section>`, "gi");
    return String(html ?? "").replace(regex, "").trim();
  }

  static #array(value) {
    if (Array.isArray(value)) return [...new Set(value.map(v => String(v).trim().toLowerCase()).filter(Boolean))];
    return [...new Set(String(value ?? "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean))];
  }

  static #escape(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}
