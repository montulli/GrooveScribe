// Reuse the editor's rendered note parts, without copying its controls or IDs.
// Wide measures are split into readable, beat-group-aligned blocks.
const lanes = [
  ['Stickings', '.stickings-container', '.sticking', '32px'],
  ['Hi-hat', '.hi-hat-container', '.hi-hat', '42px'],
  ['Tom 1', '#tom1-container', '.tom', '32px'],
  ['Snare', '.snare-container', '.snare', '32px'],
  ['Tom 4', '#tom4-container', '.tom', '32px'],
  ['Kick', '.kick-container', '.kick', '58px'],
];

// Spoken subdivisions of the time signature's written beat. The empty entry
// is replaced by the beat number; finer straight divisions use "ta" between
// the familiar sixteenth-note counts.
const countSyllables = {
  1: [''],
  2: ['', '+'],
  3: ['', 'tri', 'plet'],
  4: ['', 'e', '+', 'a'],
  6: ['', 'tri', 'plet', '+', 'tri', 'plet'],
  8: ['', 'ta', 'e', 'ta', '+', 'ta', 'a', 'ta'],
  12: ['', 'tri', 'plet', 'e', 'tri', 'plet', '+', 'tri', 'plet', 'a', 'tri', 'plet'],
};

function practiceCount(step, stepsPerBeat) {
  const beat = Math.floor(step / stepsPerBeat) + 1;
  const position = step % stepsPerBeat;
  if (position === 0) return String(beat);
  const syllables = countSyllables[stepsPerBeat];
  // Very fine divisions of half-note beats have no single spoken convention.
  // Keep their location explicit instead of inventing ambiguous syllables.
  return syllables ? syllables[position] : `${beat}:${position + 1}`;
}

/** @param {HTMLElement} source */
function copyNote(source) {
  const copy = /** @type {HTMLElement} */ (source.cloneNode(true));
  // Flam/drag SVGs contain <use> references. Give each copy its own definitions
  // so it never resolves a notehead in the hidden editor or another cell.
  copy.querySelectorAll('svg').forEach((svg, index) => {
    const ids = new Map();
    for (const element of svg.querySelectorAll('[id]')) {
      const id = `grid-print-${source.id}-${index}-${element.id}`;
      ids.set('#' + element.id, '#' + id);
      element.id = id;
    }
    for (const use of svg.querySelectorAll('use')) {
      for (const attribute of [...use.attributes]) {
        if (attribute.localName === 'href' && ids.has(attribute.value)) {
          attribute.value = ids.get(attribute.value);
        }
      }
    }
  });
  for (const element of [copy, ...copy.querySelectorAll('*')]) {
    for (const attribute of [...element.attributes]) {
      if (
        (attribute.name === 'id' && !(element instanceof SVGElement)) ||
        attribute.name.startsWith('on')
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  // Filled circles must survive printing with background graphics disabled.
  for (const circle of copy.querySelectorAll('.snare_circle, .kick_circle, .tom_circle')) {
    if (/** @type {HTMLElement} */ (circle).style.backgroundColor === 'rgb(0, 0, 0)') {
      circle.classList.add('grid-print-filled');
    }
  }
  copy.className = 'grid-print-note';
  return copy;
}

/** @param {Element} measure */
function buildTable(measure, start, end, group, stepsPerBeat) {
  const table = document.createElement('table');
  const header = table.createTHead().insertRow();
  header.append(document.createElement('th'));
  for (let step = start; step < end; step++) {
    const cell = document.createElement('th');
    cell.textContent = practiceCount(step, stepsPerBeat);
    cell.scope = 'col';
    if (step % group === 0) cell.className = 'grid-print-beat';
    header.append(cell);
  }
  const body = table.createTBody();
  for (const [name, selector, cellSelector, height] of lanes) {
    const lane = measure.querySelector(selector);
    if (!lane) continue;
    const style = getComputedStyle(lane);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const row = body.insertRow();
    const rowLabel = document.createElement('th');
    rowLabel.textContent = name;
    rowLabel.scope = 'row';
    row.append(rowLabel);
    const notes = lane.querySelectorAll(cellSelector);
    for (let step = start; step < end; step++) {
      const cell = row.insertCell();
      if (step % group === 0) cell.className = 'grid-print-beat';
      const note = copyNote(/** @type {HTMLElement} */ (notes[step]));
      note.style.height = height;
      cell.append(note);
    }
  }
  return table;
}

/**
 * @param {{title: string, author: string, tempo: number, top: number,
 * bottom: number, grouping: number}} metadata
 */
export async function printGrid(metadata) {
  if (document.getElementById('gridPrintOutput')) return;
  const output = document.createElement('div');
  output.id = 'gridPrintOutput';
  const heading = document.createElement('h1');
  heading.textContent = metadata.title || 'Groove';
  output.append(heading);
  const details = document.createElement('p');
  details.textContent = [
    metadata.author,
    `${metadata.tempo} BPM`,
    `${metadata.top}/${metadata.bottom}`,
  ]
    .filter(Boolean)
    .join(' · ');
  output.append(details);

  const group = Math.max(1, Math.floor(metadata.grouping));
  const blockSize = group <= 16 ? Math.floor(16 / group) * group : 16;
  document
    .querySelectorAll('#measureContainer .staff-container')
    .forEach((measure, measureIndex) => {
      const count = measure.querySelectorAll('.hi-hat').length;
      for (let start = 0; start < count; start += blockSize) {
        const end = Math.min(count, start + blockSize);
        const section = document.createElement('section');
        const label = document.createElement('h2');
        label.textContent =
          `Measure ${measureIndex + 1}` +
          (count > blockSize ? ` · Steps ${start + 1}–${end} of ${count}` : '');
        section.append(label);
        const table = buildTable(measure, start, end, group, count / metadata.top);
        section.append(table);
        output.append(section);
      }
    });

  const cleanup = () => {
    output.remove();
    document.body.classList.remove('printing-grid');
    window.removeEventListener('afterprint', cleanup);
  };
  document.body.append(output);
  window.addEventListener('afterprint', cleanup);
  try {
    await document.fonts.ready;
    document.body.classList.add('printing-grid');
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
