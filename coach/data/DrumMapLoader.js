import { ModuleDrumTypes } from '../engine/DrumConstants.js';

const MAPPINGS_BASE_PATH = 'coach/data/modulemappings';

/**
 * Validates that a map object has only valid drum type keys and arrays of integers 0-127.
 * @param {Object} map - The map to validate
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateMap(map) {
    const errors = [];
    for (const [key, value] of Object.entries(map)) {
        if (!ModuleDrumTypes.includes(key)) {
            errors.push(`Unknown drum type: '${key}'`);
            continue;
        }
        if (!Array.isArray(value)) {
            errors.push(`'${key}' must be an array, got ${typeof value}`);
            continue;
        }
        for (const note of value) {
            if (!Number.isInteger(note) || note < 0 || note > 127) {
                errors.push(`'${key}' contains invalid MIDI note: ${note}`);
            }
        }
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Loads and resolves all drum map presets from the modulemappings directory.
 *
 * Fetches the index.json manifest, loads each referenced JSON file,
 * resolves inheritance chains, and validates maps against ModuleDrumTypes.
 *
 * @returns {Promise<{ presets: Array<{id: string, label: string, map: Object}>, byId: Map<string, Object> }>}
 *   presets: selectable modules (excludes _-prefixed base files)
 *   byId: all loaded entries keyed by id (including bases)
 */
export async function loadDrumMapPresets() {
    const indexResponse = await fetch(`${MAPPINGS_BASE_PATH}/index.json`);
    if (!indexResponse.ok) {
        throw new Error(`Failed to load drum map index: ${indexResponse.status}`);
    }
    const filePaths = await indexResponse.json();

    // Load all files in parallel
    const entries = await Promise.all(filePaths.map(async (id) => {
        const response = await fetch(`${MAPPINGS_BASE_PATH}/${id}.json`);
        if (!response.ok) {
            console.error(`[DrumMapLoader] Failed to load ${id}.json: ${response.status}`);
            return null;
        }
        const data = await response.json();
        return { id, ...data };
    }));

    // Index by id for base resolution
    const byId = new Map();
    for (const entry of entries) {
        if (!entry) continue;
        byId.set(entry.id, entry);
    }

    // Resolve inheritance and validate
    for (const entry of byId.values()) {
        entry.resolvedMap = resolveMap(entry, byId);
        const result = validateMap(entry.resolvedMap);
        if (!result.valid) {
            console.warn(`[DrumMapLoader] Validation errors in '${entry.id}':`, result.errors);
        }
    }

    // Build selectable presets list (exclude _-prefixed files)
    const presets = [];
    for (const entry of byId.values()) {
        const filename = entry.id.split('/').pop();
        if (filename.startsWith('_')) continue;
        presets.push({
            id: entry.id,
            label: entry.label,
            map: entry.resolvedMap,
        });
    }

    // Sort by manufacturer group, then label
    presets.sort((a, b) => a.label.localeCompare(b.label));

    return { presets, byId };
}

/**
 * Resolves a map entry's inheritance chain, merging base maps from root to leaf.
 */
function resolveMap(entry, byId) {
    const chain = [];
    let current = entry;
    const visited = new Set();

    while (current) {
        if (visited.has(current.id)) {
            console.error(`[DrumMapLoader] Circular base reference at '${current.id}'`);
            break;
        }
        visited.add(current.id);
        chain.unshift(current.map || {});
        if (!current.base) break;
        current = byId.get(current.base);
        if (!current) {
            console.error(`[DrumMapLoader] Base '${entry.base}' not found for '${entry.id}'`);
            break;
        }
    }

    // Merge from root (GM) to leaf (specific module)
    const resolved = {};
    for (const map of chain) {
        Object.assign(resolved, map);
    }
    return resolved;
}

/**
 * Gets the resolved map for a preset id, or null if not found.
 */
export function getPresetMap(byId, presetId) {
    const entry = byId.get(presetId);
    if (!entry) return null;
    return entry.resolvedMap;
}
