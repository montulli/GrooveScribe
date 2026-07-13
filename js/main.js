// ES-module entry point for the Groove Scribe authoring app (index.html).
//
// Historically index.html loaded groove_writer/groove_utils/grooves as classic
// <script> tags and built its dynamic DOM at parse time with document.write()
// against the synchronous globals. Under native ES modules (which are deferred),
// that no longer works, so this module owns the bootstrap: it imports the app,
// re-exposes the public API on window for the inline HTML onclick handlers, and
// builds the same dynamic DOM into placeholder containers after parse.

import { GrooveWriter } from './groove_writer.js';
import { GrooveUtils } from './groove_utils.js';
import { grooves } from './grooves.js';

// Inline HTML handlers (onclick="myGrooveWriter.…") and other consumers still
// reference these as globals, so expose them on window.
window.GrooveWriter = GrooveWriter;
window.GrooveUtils = GrooveUtils;
window.grooves = grooves;

const myGrooveWriter = new GrooveWriter();
window.myGrooveWriter = myGrooveWriter;
const utils = myGrooveWriter.myGrooveUtils;

// Conditional stylesheets (previously injected via document.write in <head>).
function addStylesheet(href) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = href;
  document.head.appendChild(link);
}
if (utils.grooveDBAuthoring) {
  addStylesheet('css/grooveDB_authoring.css');
}
if (utils.debugMode) {
  addStylesheet('css/groove_debug.css');
}

// Replace a placeholder element with real markup (exact replacement, no wrapper).
function replaceSlot(id, html) {
  const el = document.getElementById(id);
  if (el) el.outerHTML = html;
}
// Fill a container element's contents (matches document.write into that element).
function fillContainer(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// Conditional left-nav buttons.
if (!utils.grooveDBAuthoring) {
  replaceSlot(
    'viewEditSwitchSlot',
    '<span class="left-button" onclick="myGrooveWriter.swapViewEditMode();">' +
      '<span class="left-button-content"><span id="view-edit-switch">Switch to EDIT mode</span></span></span>'
  );
}
if (utils.is_touch_device()) {
  replaceSlot(
    'advancedEditSlot',
    '<span class="left-button edit-block" id="advancedEditAnchor" ' +
      'onclick="event.preventDefault(); myGrooveWriter.toggleAdvancedEdit()">' +
      '<span class="left-button-content">Advanced Edit</span></span>'
  );
}

// Dynamic content regions previously built with document.write.
fillContainer('PermutationOptions', myGrooveWriter.HTMLforPermutationOptions());

let gridHTML = '';
for (let m = 1; m <= myGrooveWriter.numberOfMeasures(); m++) {
  gridHTML += myGrooveWriter.HTMLforStaffContainer(m, (m - 1) * myGrooveWriter.notesPerMeasure());
}
fillContainer('measureContainer', gridHTML);

fillContainer('grooveListWrapper', grooves.getGroovesAsHTML());

// Initialize the notes/player once the page has fully loaded (matches the
// original window.onload handler).
window.addEventListener('load', function () {
  myGrooveWriter.runsOnPageLoad();
});
