# Coach Branch: TODOs for Separate Commits

These improvements were made during coach development but are independent of the coach feature.
They should be extracted into their own commits (or PRs) against master to keep concerns separated.

## 1. abc2svg Library Upgrade
`js/abc2svg-1.js` was upgraded from an older version. This is a dependency bump.
Changes in `groove_utils.js` tied to this:
- `new Abc(...)` → `new abc2svg.Abc(...)`
- `anno_start`/`anno_stop` signature gained an `s` parameter
- `this.` → `self.` fix in annotation callbacks (bug fix for `this` binding)
- `renderWidth` scaling hack removal (`* 0.75`)

## 2. HTML Tag Bugfixes in groove_writer.js
Several unclosed `</span>` tags on unmute buttons (hh, tom1, snare, tom4, kick).
Also: `class="fill"` → `class="drag_fill"` on drag note SVG paths, and a missing parameter
in `noteOnMouseEnter` for the sticking row.
