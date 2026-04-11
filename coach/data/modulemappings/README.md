# Module MIDI Mappings

This directory contains MIDI note-to-drum-type mappings for electronic drum modules.
The drum coach uses these to correctly interpret MIDI input from different hardware.

## File Format

Each `.json` file represents either a base mapping or a specific module:

```json
{
  "label": "Roland TD-27",
  "base": "roland/_base",
  "map": {}
}
```

| Field   | Description |
|---------|-------------|
| `label` | Display name shown in the UI dropdown |
| `base`  | Path to parent mapping file (relative to this directory, without `.json`). Omit for root-level bases (e.g. `_gm.json`) |
| `map`   | MIDI note overrides. Keys are drum type identifiers from `ModuleDrumTypes` in `DrumConstants.js`. Values are arrays of MIDI note numbers (0-127). Only include instruments that differ from the base |

## Conventions

- **`_` prefix** = base map (e.g. `_gm.json`, `roland/_base.json`). These are used for inheritance only and are **not shown** as selectable modules in the UI dropdown.
- **Empty `map: {}`** means the module is identical to its base.
- **Inheritance chain**: the loader merges maps from root to leaf. For example, `roland/td27.json` inherits from `roland/_base.json`, which inherits from `_gm.json`.

## Drum Type Identifiers

Valid map keys (from `ModuleDrumTypes` in `coach/engine/DrumConstants.js`):

```
kick, snare, snare_xstick, hh_foot, hh_open, hh_closed,
tom_high, tom_low, crash, ride, ride_bell, cow_bell, stacker
```

## Adding a New Module

1. Create a `.json` file in the appropriate manufacturer subdirectory
2. Set `base` to the manufacturer's `_base` file (or `_gm` if the module uses standard GM)
3. Add only the instruments that differ from the base in `map`
4. Add the file path (without `.json`) to `index.json`

### Example: adding a new Roland module

```json
{
  "label": "Roland TD-07",
  "base": "roland/_base",
  "map": {}
}
```

Then add `"roland/td07"` to `index.json`.

## Data Sources

- **Roland**: [TD-17 MIDI Note Map](https://support.roland.com/hc/en-us/articles/360005173411), [TD-50 MIDI Note Map](https://support.roland.com/hc/en-us/articles/12190112095259)
- **Yamaha**: [DTX-PRO Data List](https://usa.yamaha.com/files/download/other_assets/8/1376118/dtx-pro_dl_en_v102.pdf)
- **Alesis**: [Nitro User Guide](https://www.alesis.com/rscdn/1886/documents/Nitro%20Drum%20Module%20-%20User%20Guide%20-%20v1.2.pdf)
