import { FLAGS, MODULE_ID } from "../constants.mjs";
import { MaterialCatalogService } from "./material-catalog-service.mjs";
import { ProductSourceService } from "./product-source-service.mjs";
import { KnowledgeItemService } from "./knowledge-item-service.mjs";
import { ContentPackService } from "./content-pack-service.mjs";

function own(row) { return row?.flags?.[MODULE_ID] ?? {}; }
function duplicateCount(values) {
  const seen = new Set();
  const dup = new Set();
  for (const value of values.map(String).filter(Boolean)) {
    if (seen.has(value)) dup.add(value);
    else seen.add(value);
  }
  return dup.size;
}

export class CatalogAuditService {
  static async audit() {
    if (!game.user?.isGM) throw new Error("Only a GM can validate the Crafting Core catalog.");
    const materialPack = MaterialCatalogService.pack();
    const productPack = ProductSourceService.productsPack();
    const knowledgePack = KnowledgeItemService.pack();
    const [materials, products, recipes] = await Promise.all([
      materialPack ? materialPack.getIndex({ fields: [`flags.${MODULE_ID}.${FLAGS.MATERIAL_ID}`, `flags.${MODULE_ID}.${FLAGS.MATERIAL}`] }) : [],
      productPack ? productPack.getIndex({ fields: [`flags.${MODULE_ID}.${FLAGS.PRODUCT_ID}`, `flags.${MODULE_ID}.${FLAGS.PRODUCT_SYNC_STATUS}`] }) : [],
      knowledgePack ? knowledgePack.getIndex({ fields: [`flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_RECIPE_ID}`, `flags.${MODULE_ID}.${FLAGS.KNOWLEDGE_PUBLISHED}`] }) : []
    ]);
    const materialRows = Array.from(materials ?? []).filter(row => own(row)?.[FLAGS.MATERIAL]);
    const productRows = Array.from(products ?? []);
    const recipeRows = Array.from(recipes ?? []).filter(row => own(row)?.[FLAGS.KNOWLEDGE_PUBLISHED]);
    const productStatuses = productRows.map(row => String(own(row)?.[FLAGS.PRODUCT_SYNC_STATUS] ?? ""));
    const authority = KnowledgeItemService.authorityIndex();
    let legacyKnowledge = 0;
    for (const actor of game.actors?.contents ?? []) {
      if (actor.type !== "character") continue;
      for (const id of KnowledgeItemService.knownRecipeIds(actor)) if (!authority[id]?.uuid) legacyKnowledge += 1;
    }

    const issues = {
      duplicateMaterials: duplicateCount(materialRows.map(row => own(row)?.[FLAGS.MATERIAL_ID])),
      duplicateProducts: duplicateCount(productRows.map(row => own(row)?.[FLAGS.PRODUCT_ID])),
      duplicateRecipes: duplicateCount(recipeRows.map(row => own(row)?.[FLAGS.KNOWLEDGE_RECIPE_ID])),
      sourceMissing: productStatuses.filter(value => value === ProductSourceService.STATUS.SOURCE_MISSING).length,
      needsReview: productStatuses.filter(value => value === ProductSourceService.STATUS.NEEDS_REVIEW).length
    };
    const packStates = await ContentPackService.statusCards();
    const incompletePacks = packStates.filter(row => row.needsRestore).length;
    issues.incompletePacks = incompletePacks;
    const issueCount = Object.values(issues).reduce((sum, value) => sum + Number(value || 0), 0);
    return {
      materials: materialRows.length,
      products: productRows.length,
      recipes: recipeRows.length,
      legacyKnowledge,
      packStates,
      issues,
      issueCount,
      healthy: issueCount === 0
    };
  }
}
