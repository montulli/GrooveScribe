// Top-bar hamburger menu and its dialogs (Groove Setup, Auto Speed Up). All the markup lives in
// index.html and the layout in css/nav.css; this file only wires open/close
// behavior and mirrors GrooveWriter state into the Groove Setup dialog.
//
// groove_writer.js still tracks the current subdivision as a `buttonSelected` class on the
// <option id="subdivision_*"> elements, exactly as it used to on the old buttons, and keeps
// #timeSigLabel up to date. syncSubdivision() / syncTimeSignature() read those back into the
// selects; which subdivisions are greyed out is asked of GrooveWriter for the *staged* time signature.

function currentTimeSignature() {
  const label = document.getElementById('timeSigLabel');
  const top = label && label.querySelector('sup');
  const bottom = label && label.querySelector('sub');
  return { top: top ? top.textContent : null, bottom: bottom ? bottom.textContent : null };
}

// time signature comes from the label GrooveWriter keeps current: <sup>top</sup>/<sub>bottom</sub>
function syncTimeSignature() {
  const { top, bottom } = currentTimeSignature();
  if (top) document.getElementById('timeSigPopupTimeSigTop').value = top;
  if (bottom) document.getElementById('timeSigPopupTimeSigBottom').value = bottom;
}

// Mirror the current subdivision into the dropdown, and grey out the ones that do not fit the
// time signature *as staged in the dialog* (so a user can change both at once).
function syncSubdivision() {
  const select = document.getElementById('subdivisionSelect');
  for (const option of select.options) {
    if (option.classList.contains('buttonSelected')) select.value = option.value;
  }
  syncDisabledSubdivisions();
}

function syncDisabledSubdivisions() {
  const select = document.getElementById('subdivisionSelect');
  const top = document.getElementById('timeSigPopupTimeSigTop').value;
  const bottom = document.getElementById('timeSigPopupTimeSigBottom').value;
  for (const option of select.options) {
    option.disabled = !window.myGrooveWriter.divisionFitsTimeSignature(
      parseInt(option.value, 10),
      top,
      bottom
    );
  }
  // the staged subdivision no longer fits: fall back to the one applyTimeSignature would use
  if (select.selectedOptions[0] && select.selectedOptions[0].disabled) select.value = '16';
}

// The Groove Setup dialog only stages changes: Done applies them and Cancel discards them.
// Changing the time signature re-lays-out the measure and drops notes that no longer fit (4/4 ->
// 3/4 loses a beat for good), so it must not commit on every dropdown change.
const TEXT_FIELD_IDS = ['tuneTitle', 'tuneAuthor', 'tuneComments'];

// what the title / author / comment fields held when the dialog opened
function readTextFields() {
  const values = {};
  TEXT_FIELD_IDS.forEach((id) => (values[id] = document.getElementById(id).value));
  return values;
}

function writeTextFields(values) {
  TEXT_FIELD_IDS.forEach((id) => (document.getElementById(id).value = values[id]));
}

function applyStagedChoices(valuesOnOpen) {
  const subdivisionSelect = document.getElementById('subdivisionSelect');
  const stagedDivision = parseInt(subdivisionSelect.value, 10);
  const currentOption = subdivisionSelect.querySelector('.buttonSelected');
  const divisionChanged = !currentOption || stagedDivision !== parseInt(currentOption.value, 10);

  const { top, bottom } = currentTimeSignature();
  const newTop = document.getElementById('timeSigPopupTimeSigTop').value;
  const newBottom = document.getElementById('timeSigPopupTimeSigBottom').value;
  const timeSignatureChanged = newTop !== top || newBottom !== bottom;

  // one relayout covers both, so the whole Done is a single Undo step
  let relaidOut = true;
  if (timeSignatureChanged) {
    window.myGrooveWriter.applyTimeSignature(divisionChanged ? stagedDivision : undefined);
  } else if (divisionChanged) {
    window.myGrooveWriter.changeDivision(stagedDivision);
  } else {
    relaidOut = false;
  }

  // the title, author and comment are read from their fields whenever the sheet music is rebuilt, which a
  // relayout already did
  const now = readTextFields();
  if (!relaidOut && Object.keys(now).some((key) => now[key] !== valuesOnOpen[key])) {
    window.myGrooveWriter.refresh_ABC();
  }
}

// Items that open a submenu beside the panel; the panel stays open behind them. Every other
// item closes the panel when chosen.
const CASCADING_ITEM_IDS = [
  'editAnchor',
  'displayAnchor',
  'permutationAnchor',
  'groovesAnchor',
  'shareExportAnchor',
  'helpAnchor',
];

export function initHamburgerMenu() {
  const menu = document.getElementById('hamburgerMenu');
  const button = document.getElementById('hamburgerButton');
  const setupModal = document.getElementById('grooveSetupModal');
  if (!menu || !button || !setupModal) return;

  const closeMenu = () => menu.classList.remove('open');

  // Open the panel with its right edge lined up with the hamburger icon's right edge.
  const openMenu = () => {
    const icon = button.querySelector('i') || button;
    menu.style.right =
      document.documentElement.clientWidth - icon.getBoundingClientRect().right + 'px';
    menu.classList.add('open');
  };
  button.addEventListener('click', () =>
    menu.classList.contains('open') ? closeMenu() : openMenu()
  );
  // Choosing an item dismisses the panel, except for the cascading ones whose submenu opens
  // beside it. The item's own inline onclick has already run by the time the event bubbles
  // here, so a submenu has been positioned against the still-open panel.
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.menuItem');
    if (!item || !CASCADING_ITEM_IDS.includes(item.id)) closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (menu.classList.contains('open') && !menu.contains(e.target) && !button.contains(e.target)) {
      closeMenu();
    }
  });

  // Dialogs (.navModal): a menu item opens one; Done / Cancel close it, and so does a tap on the
  // backdrop unless the dialog is .navModalStrict (the user must then choose Done or Cancel).
  const closeModal = (modal) => modal.classList.remove('open');
  document.querySelectorAll('.navModal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      const onBackdrop = e.target === modal && !modal.classList.contains('navModalStrict');
      if (onBackdrop || e.target.closest('.navModalDone, .navModalCancel')) closeModal(modal);
    });
  });

  // Groove Setup
  let valuesOnOpen = null; // what the text fields held when the dialog was opened
  // Show each clear (x) button only while its input has text.
  const syncClearButtons = () =>
    setupModal.querySelectorAll('.navModalInputWrap').forEach((wrap) => {
      wrap.classList.toggle('empty', !wrap.querySelector('input').value);
    });
  setupModal.addEventListener('input', syncClearButtons);
  setupModal.addEventListener('click', (e) => {
    const clear = e.target.closest('.navModalClear');
    if (!clear) return;
    const input = clear.parentElement.querySelector('input');
    input.value = ''; // staged like any other edit: nothing re-renders until Done
    syncClearButtons();
    input.focus();
  });

  document.getElementById('grooveSetupItem').addEventListener('click', () => {
    valuesOnOpen = readTextFields(); // the fields may have been filled from the URL since last time
    syncTimeSignature();
    syncSubdivision();
    syncClearButtons();
    setupModal.classList.add('open');
  });
  // Re-grey the subdivisions whenever the staged time signature changes.
  document
    .getElementById('timeSigPopupTimeSigTop')
    .addEventListener('change', syncDisabledSubdivisions);
  document
    .getElementById('timeSigPopupTimeSigBottom')
    .addEventListener('change', syncDisabledSubdivisions);
  // Done applies the staged choices. This runs before the generic handler above closes the
  // dialog (the button is the event target; the dialog sees it on the way up). The dropdowns are
  // re-synced from the app the next time the dialog opens.
  document.getElementById('grooveSetupModalDone').addEventListener('click', () => {
    applyStagedChoices(valuesOnOpen);
  });
  // Cancel: put the text fields back (the dropdowns are re-synced from the app on next open).
  document.getElementById('grooveSetupModalCancel').addEventListener('click', () => {
    writeTextFields(valuesOnOpen);
  });
}
