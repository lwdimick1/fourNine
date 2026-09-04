# fourNine

fourNine is a lightweight browser-based drawing, storyboarding, and animatic tool. It is being built as a focused alternative for sketching, timing layers, and exporting simple storyboards.

## Getting started

1. Download or clone this repository.
2. Open `index.html` in Google Chrome.
3. Start drawing.

No installation or account is required.

> **Tablet note:** Pen-pressure brush sizing has been tested successfully in Chrome with a Wacom One. Safari may not provide usable pen-pressure data for this app.

## Current features

- 1920 × 1080 default canvas
- Paintbrush, eraser, lasso selection, and pan tools
- Adjustable brush size, softness, color, and pen-pressure sizing
- Grayscale and RGB color palettes
- Layers: create, rename, reorder, merge down, and control opacity
- Timeline-based layer visibility and retiming
- Playback, looping, scrubbing, and onion skinning
- Save and reopen fourNine projects
- Export a frame as PNG, individual layers as PNG or JPG, and animations as WebM video

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `B` | Brush |
| `E` | Eraser |
| `L` | Lasso |
| `H` | Pan |
| `[` / `]` | Decrease / increase brush size |
| `Shift + {` | Increase softness |
| `Shift + }` | Increase hardness |
| `+` / `-` | Zoom in / out |
| `1` | Fit canvas to view |
| `Space` | Tap to play/pause; hold temporarily to pan |
| `Enter` | Play/pause |
| `Delete` / `Backspace` | Erase selected lasso pixels |
| `Esc` | Clear lasso selection |
| `Shift + M` | Merge selected layer down |

## Project files

- `index.html` — app structure
- `styles.css` — interface styling
- `app.js` — drawing, layers, timeline, and exporting behavior

fourNine is an evolving project—new tools and releases can be added without starting over.
