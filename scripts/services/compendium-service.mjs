import { MODULE_ID } from "../constants.mjs";

/**
 * Shared world-Compendium plumbing for Crafting Core.
 * All packs are private/GM-only and grouped under a top-level "Crafting Core" folder.
 */
export class CompendiumService {
  static ROOT_FOLDER_NAME = "Crafting Core";

  static async ensureRootFolder() {
    if (!game.user.isGM) throw new Error("Only a GM can configure Crafting Core Compendiums.");
    let folder = game.folders?.find(f => f.type === "Compendium" && f.name === this.ROOT_FOLDER_NAME && !f.folder) ?? null;
    if (folder) return folder;
    const FolderClass = globalThis.Folder?.implementation ?? globalThis.Folder;
    if (!FolderClass?.create) throw new Error("Foundry's Folder creation API is unavailable.");
    folder = await FolderClass.create({ name: this.ROOT_FOLDER_NAME, type: "Compendium", folder: null });
    return folder;
  }

  static findWorldPack(name) {
    const id = `world.${name}`;
    return game.packs.get(id)
      ?? game.packs.find(pack => pack.collection === id)
      ?? game.packs.find(pack => pack.metadata?.packageType === "world" && pack.metadata?.name === name)
      ?? null;
  }

  static async ensureWorldItemPack({ name, label }) {
    if (!game.user.isGM) throw new Error("Only a GM can create Crafting Core Compendiums.");
    let pack = this.findWorldPack(name);
    if (!pack) {
      const CompendiumCollection = foundry.documents?.collections?.CompendiumCollection ?? globalThis.CompendiumCollection;
      if (!CompendiumCollection?.createCompendium) throw new Error("Foundry's Compendium creation API is unavailable.");
      pack = await CompendiumCollection.createCompendium({
        name,
        label,
        type: "Item",
        system: "dnd5e",
        package: "world",
        private: true,
        ownership: this.gmOnlyOwnership()
      });
    }

    // Never expose Crafting Core libraries to players. Compendium content uses role-based
    // ownership, so we explicitly deny PLAYER/TRUSTED/ASSISTANT and grant only GAMEMASTER.
    await this.assignToRootFolder(pack);
    return pack;
  }

  static gmOnlyOwnership() {
    return { PLAYER: "NONE", TRUSTED: "NONE", ASSISTANT: "NONE", GAMEMASTER: "OWNER" };
  }

  static async assignToRootFolder(pack) {
    const root = await this.ensureRootFolder();
    try {
      await pack.configure?.({ ownership: this.gmOnlyOwnership() });
      if (pack.folder?.id !== root.id) await pack.setFolder?.(root);
    } catch (error) {
      console.warn(`${MODULE_ID} | Could not configure Crafting Core Compendium folder/ownership for ${pack.collection}.`, error);
      // Fallback only for folder placement. Ownership is intentionally not weakened.
      try {
        const current = foundry.utils.deepClone(game.settings.get("core", "compendiumConfiguration") ?? {});
        current[pack.collection] ??= {};
        current[pack.collection].folder = root.id;
        await game.settings.set("core", "compendiumConfiguration", current);
      } catch (fallbackError) {
        console.warn(`${MODULE_ID} | Compendium folder fallback also failed for ${pack.collection}.`, fallbackError);
      }
    }
    return root;
  }

  /**
   * Ensure nested folders inside a Compendium pack.
   * @param {CompendiumCollection} pack
   * @param {Array<{key:string,name:string,parent?:string|null}>} definitions
   * @returns {Promise<Map<string, Folder>>}
   */
  static async ensurePackFolders(pack, definitions=[]) {
    if (!game.user.isGM) throw new Error("Only a GM can organize Crafting Core Compendiums.");
    const FolderClass = globalThis.Folder?.implementation ?? globalThis.Folder;
    if (!FolderClass?.createDocuments) throw new Error("Foundry's Compendium Folder API is unavailable.");

    const wasLocked = Boolean(pack.locked);
    if (wasLocked) await pack.configure({ locked: false });
    try {
      const result = new Map();
      const existing = () => pack.folders?.contents ?? [];
      for (const def of definitions) {
        const parent = def.parent ? result.get(def.parent) : null;
        const found = existing().find(folder => folder.name === def.name
          && String(folder.folder?.id ?? folder.folder ?? "") === String(parent?.id ?? ""));
        if (found) {
          result.set(def.key, found);
          continue;
        }
        const [created] = await FolderClass.createDocuments([{
          name: def.name,
          type: pack.documentName ?? "Item",
          folder: parent?.id ?? null
        }], { pack: pack.collection });
        if (created) result.set(def.key, created);
      }
      return result;
    } finally {
      if (wasLocked) await pack.configure({ locked: true });
    }
  }
}
