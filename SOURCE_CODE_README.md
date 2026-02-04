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

### Local Development Note (CORS)
When running locally, you **must use a web server** (e.g., `python3 -m http.server`). Modern browsers block the loading of external assets (like soundfonts) when opening the HTML file directly (`file://` protocol) due to security policies.
