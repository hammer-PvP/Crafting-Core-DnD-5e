# Crafting Core (DnD 5e)

Crafting Core is a D&D5e crafting framework for Foundry VTT 14.

## v0.0.1

- GM-only Recipe Builder opened from the Items Directory.
- Any D&D5e Item can be used as a recipe requirement or result.
- Recipe/Blueprint/Formula knowledge Items are native D&D5e Consumables with a `Learn Recipe` Utility Activity.
- Learned recipes are stored on the Character Actor, not the User.
- Adds a native `Crafting` tab to the official D&D5e Character Sheet.
- The Character tab shows only recipes learned by that Actor.
- Materials are validated and consumed when crafting begins.
- Crafting time is configured in real-time seconds and displayed as a silent progress bar.
- The active GM commits crafting transactions and delivers the final Item to the Character inventory.

## Compatibility

- Foundry VTT 14.365
- D&D5e 5.3.3

This initial version intentionally does not yet include Compendium Harvest Scanner, biome gathering, automatic material catalogs, or Item Piles integration. Those systems are designed to build on the same Recipe and Item identity model introduced here.
