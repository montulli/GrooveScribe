# Source Code README & Architecture

This document provides a technical and high-level overview of how Groove Scribe works.

## High-Level Overview
Groove Scribe is a **web application** designed for drummers to create, hear, and share drum patterns. It runs entirely in the browser with no backend or server-side calls. 

### Core Technologies
1.  **HTML**: The structure of the page (buttons, grid, labels).
2.  **CSS**: The styling and layout (colors, fonts, positioning).
3.  **JavaScript**: The "brain" of the application that handles logic, music rendering, and sound.

---

## Application Structure
The application is split into two primary modules:

### 1. Groove Writer (The Editor)
The main authoring application where users create grooves using a grid interface.
*   **Functionality**:
    *   Provides a grid of icons representing parts of a drum kit (Hi-Hat, Snare, Kick, etc.).
    *   When a user clicks a cell, it updates an internal array of notes.
    *   Generates an array of notes that can be converted into music via Groove Display.
*   **Key Files**:
    *   `index.html`: The main authoring view.
    *   `js/groove_writer.js`: The authoring code; manages state and user interaction.

### 2. Groove Display (The Player & Renderer)
The playback and rendering engine. It can run independently of the authoring view (e.g., for embedding grooves in other sites).
*   **Functionality**:
    *   **Visual Music**: Converts the internal note array into **ABC notation**. A library called `abc2svg` then draws the sheet music as an SVG.
    *   **Audio Playback**: Uses the `MIDI.js` library to load "SoundFonts" (recorded drum samples) and trigger them based on the current tempo.
    *   **Midi Generation**: Can generate and export MIDI files for download.
*   **Key Files**:
    *   `GrooveEmbed.html`: A simple test for embedding a single groove.
    *   `GrooveMultiDisplay.html`: A test for embedding multiple grooves.
    *   `js/groove_display.js`: Includes functions to embed the display in an HTML page.
    *   `js/groove_utils.js`: Core utility functions for displaying and playing grooves.

---

## Technical Details

### Key Libraries (Third-Party)
*   **`abc2svg-1.js`**: Responsible for rendering ABC notation into SVG musical notation.
*   **`MIDI.js`**: The audio engine for playback.
*   **`jsmidgen.js`**: Used for generating MIDI files.
*   **`pablo.min.js`**: Helps with SVG-to-image exports (PNG/SVG).

### File Structure
*   `/js`: Logic and engine files.
*   `/css`: Visual styling sheets.
*   `/soundfont`: Audio recordings used by MIDI.js.
*   `/images`: UI assets and logos.
*   `/font-awesome`: Icons used for buttons.

---

## Drum Coach (`coach/`)

The Drum Coach is a self-contained ES module tree that hooks into GrooveWriter's playback system. It provides real-time timing evaluation when playing along on a MIDI electronic drum kit.

### Architecture

```
coach/
├── bootstrap.js              Entry point, loaded via <script type="module"> in index.html
├── Controller.js             Orchestrates all components, routes MIDI hits, manages session lifecycle
├── state/
│   └── State.js              Global state manager with localStorage persistence
├── engine/
│   ├── DrumConstants.js      Drum type identifiers (DrumType, ModuleDrumTypes, EditorDrumToModuleDrum)
│   ├── Engine.js             Timing evaluation engine — matches MIDI hits to expected notes
│   ├── TimingEvaluator.js    Pure function for timing error + tier calculation
│   ├── MidiInputHandler.js   Web MIDI API wrapper, drum map lookup, CC#4 hi-hat tracking
│   ├── LatencyManager.js     Audio output latency detection + calibration offset
│   ├── ABCIndexMapper.js     Maps groove notes to ABC notation indices for visual feedback
│   └── ScoreLayoutExtractor.js  Extracts rendered note coordinates from abc2svg SVG output
├── ui/
│   ├── SettingsDialog.js     Coach settings (mode, tolerance, mapping, calibration, volume)
│   ├── CalibrationDialog.js  Tap-along latency calibration with timing strip visualization
│   ├── DrumMapDialog.js      MIDI mapping config with presets, MIDI-learn, CC config, live feedback
│   ├── ResultsDialog.js      Post-session score display
│   ├── PlayerBar.js          Coaching-mode player bar (stop button, badge, solo toggle)
│   └── feedback/
│       └── Renderer.js       SVG overlay for hit circles, play line, debug grid
├── data/
│   ├── DrumMapLoader.js      Fetches JSON presets, resolves inheritance, validates against ModuleDrumTypes
│   ├── DrumMapUtils.js       Editing↔runtime map conversion, URL encode/decode
│   └── modulemappings/       JSON drum map presets (see modulemappings/README.md)
│       ├── _gm.json          General MIDI base map
│       ├── roland/            Roland V-Drums (TD-17, TD-27, TD-50, V-31/51/71)
│       ├── yamaha/            Yamaha DTX (DTX-PRO, DTX6, DTX502)
│       ├── alesis/            Alesis (Nitro, Surge, Strike, Command)
│       └── efnote/            Efnote (3, 5, 7)
└── css/
    └── coach.css             All coach UI styles
```

### Key Concepts

**Drum Types:** `DrumConstants.js` defines `ModuleDrumTypes` — the 13 drum types that can come from hardware (kick, snare, snare_xstick, hh_foot, hh_open, hh_closed, tom_high, tom_low, crash, ride, ride_bell, cow_bell, stacker). All MIDI mapping and hit evaluation works in terms of these types.

**Drum Map Presets:** JSON files under `modulemappings/` with inheritance via a `base` field. Files prefixed with `_` are base maps (not shown in UI). The loader resolves the chain and merges maps from root to leaf. See `modulemappings/README.md` for the format and how to add new modules.

**Hi-Hat CC:** Some modules (Roland, Yamaha, Efnote) use CC#4 to communicate pedal position instead of sending different note numbers for open/closed. When enabled, `MidiInputHandler` tracks CC messages and overrides `hh_open` → `hh_closed` when the CC value exceeds the configured threshold.

**Timing Evaluation:** `Engine.js` builds a timeline from the groove's expected notes. When a MIDI hit arrives, it finds the nearest matching note using a cursor-based forward scan. `TimingEvaluator.js` computes the timing error accounting for audio output latency and calibration offset. Hits are classified as perfect/good/close/miss based on configurable tolerance windows.

**Visual Feedback:** `Renderer.js` draws colored circles on the SVG score at the matched note's position. It uses coordinates extracted by `ScoreLayoutExtractor.js` from abc2svg's rendered output. A moving play line shows the current playback position.

**Calibration:** The calibration dialog plays metronome clicks at 80 BPM via Web Audio oscillator and captures MIDI hits (or keyboard taps). It collects 20 taps, discards the first 4 (warmup), and computes the median timing error as the calibration offset.

### Integration with GrooveWriter

The coach hooks into GrooveWriter without modifying core files:
- `bootstrap.js` waits for `window.myGrooveWriter`, injects the Coach button, and creates the `Controller`
- `Controller` intercepts GrooveWriter's playback callbacks (`playEvent`, `stopEvent`, `repeatCallback`) to sync the coaching engine
- During coaching, the editor grid is hidden (view mode) and the player bar is transformed into a coaching bar
- URL state uses `Mode=coach` and optional `DrumMap`/`DM` parameters via `groove_utils.js`

### Local Development Note (CORS)
When running locally, you **must use a web server** (e.g., `python3 -m http.server`). Modern browsers block the loading of external assets (like soundfonts and coach JSON presets) when opening the HTML file directly (`file://` protocol) due to security policies.
