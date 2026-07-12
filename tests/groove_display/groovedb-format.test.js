import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadGrooveDisplay } from '../helpers/loadDisplay.js';
import { installMockGrooveUtils, uninstallMockGrooveUtils } from '../helpers/mockGrooveUtils.js';

// Coverage for GrooveDBFormatPutGrooveInHTMLElement and GrooveDBFormatPutGrooveOnPage.
// These take the GrooveDB "tab" object, assemble a grooveData via GrooveUtils,
// render sheet music, and wire the MIDI player. We drive them with a mock
// GrooveUtils and assert the wiring: what gets merged/decoded/rendered and the
// HTML that is emitted.
describe('GrooveDBFormatPutGrooveInHTMLElement', () => {
  let GD;
  let mock;

  // A representative GrooveDB tab payload with every optional voice supplied.
  const fullTab = () => ({
    snareAccentTab: 'S-ACC',
    snareOtherTab: 'S-OTH',
    kickTab: 'K-TAB',
    footOtherTab: 'F-OTH',
    hihatTab: 'H-TAB',
    stickingTab: 'STK-TAB',
    tom1Tab: 'T1-TAB',
    tom4Tab: 'T4-TAB',
    div: 16,
    tempo: 120,
    swingPercent: 33,
    measures: 2,
    notesPerTabMeasure: 16,
    timeSignature: '6/8',
  });

  function makeHost(id = 'host') {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
    return el;
  }

  beforeEach(async () => {
    mock = installMockGrooveUtils();
    GD = await loadGrooveDisplay();
  });

  afterEach(() => {
    uninstallMockGrooveUtils();
    vi.restoreAllMocks();
  });

  it('emits the printable SVG and non-printable player scaffold into the target', () => {
    const host = makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    expect(host.querySelector('.Printable .svgTarget')).toBeTruthy();
    expect(host.querySelector('.nonPrintable')).toBeTruthy();
    // renderABCtoSVG output is injected into the svg target.
    expect(host.querySelector('.svgTarget').innerHTML).toContain('<svg');
  });

  it('merges the accent+other snare tabs and the kick+foot tabs', () => {
    makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    expect(mock.last.mergeDrumTabLines).toHaveBeenCalledWith('S-ACC', 'S-OTH');
    expect(mock.last.mergeDrumTabLines).toHaveBeenCalledWith('K-TAB', 'F-OTH');
  });

  it('decodes every supplied voice via noteArraysFromURLData', () => {
    makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    const types = mock.last.noteArraysFromURLData.mock.calls.map((c) => c[0]);
    expect(types).toContain('Stickings');
    expect(types).toContain('H');
    expect(types).toContain('S');
    expect(types).toContain('K');
    expect(types).toContain('T1');
    expect(types).toContain('T4');
  });

  it('skips optional voices that are not supplied', () => {
    makeHost();
    const tab = fullTab();
    delete tab.hihatTab;
    delete tab.stickingTab;
    delete tab.tom1Tab;
    delete tab.tom4Tab;
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', tab);
    const types = mock.last.noteArraysFromURLData.mock.calls.map((c) => c[0]);
    expect(types).not.toContain('H');
    expect(types).not.toContain('Stickings');
    expect(types).not.toContain('T1');
    expect(types).not.toContain('T4');
    // Snare and kick are always decoded.
    expect(types).toContain('S');
    expect(types).toContain('K');
  });

  it('applies numeric groove settings onto the grooveData', () => {
    makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    const gd = mock.last.createABCFromGrooveData.mock.calls[0][0];
    expect(gd.timeDivision).toBe(16);
    expect(gd.tempo).toBe(120);
    expect(gd.swingPercent).toBe(33);
    expect(gd.numberOfMeasures).toBe(2);
    expect(gd.notesPerMeasure).toBe(16);
  });

  it('ignores NaN groove settings, leaving the defaults intact', () => {
    makeHost();
    const tab = fullTab();
    tab.div = NaN;
    tab.tempo = NaN;
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', tab);
    const gd = mock.last.createABCFromGrooveData.mock.calls[0][0];
    // grooveDataNew defaults: timeDivision 16, tempo 80.
    expect(gd.timeDivision).toBe(16);
    expect(gd.tempo).toBe(80);
  });

  it('parses the time signature into numBeats / noteValue', () => {
    makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    const gd = mock.last.createABCFromGrooveData.mock.calls[0][0];
    expect(gd.numBeats).toBe(6);
    expect(gd.noteValue).toBe(8);
  });

  it('leaves the default time signature when none is supplied', () => {
    makeHost();
    const tab = fullTab();
    delete tab.timeSignature;
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', tab);
    const gd = mock.last.createABCFromGrooveData.mock.calls[0][0];
    expect(gd.numBeats).toBe(4);
    expect(gd.noteValue).toBe(4);
  });

  it('wires up the MIDI player with the groove tempo and swing', () => {
    makeHost();
    GD.GrooveDBFormatPutGrooveInHTMLElement('host', fullTab());
    expect(mock.last.setGrooveData).toHaveBeenCalled();
    expect(mock.last.AddMidiPlayerToPage).toHaveBeenCalled();
    expect(mock.last.expandOrRetractMIDI_playback).toHaveBeenCalledWith(true, false);
    expect(mock.last.setTempo).toHaveBeenCalledWith(120);
    expect(mock.last.setSwing).toHaveBeenCalledWith(33);
    expect(mock.last.oneTimeInitializeMidi).toHaveBeenCalled();
  });

  it('uses a unique target id per invocation', () => {
    const h1 = makeHost('h1');
    const h2 = makeHost('h2');
    GD.GrooveDBFormatPutGrooveInHTMLElement('h1', fullTab());
    GD.GrooveDBFormatPutGrooveInHTMLElement('h2', fullTab());
    const id1 = h1.querySelector('.svgTarget').id;
    const id2 = h2.querySelector('.svgTarget').id;
    expect(id1).not.toBe(id2);
  });
});

describe('GrooveDBFormatPutGrooveOnPage', () => {
  let GD;
  let mock;

  beforeEach(async () => {
    mock = installMockGrooveUtils();
    GD = await loadGrooveDisplay();
  });

  afterEach(() => {
    uninstallMockGrooveUtils();
    vi.restoreAllMocks();
  });

  it('writes a placeholder span and renders it once the window load event fires', () => {
    // Make document.write actually insert the span so the deferred layout has a
    // real target to populate (jsdom would otherwise reopen the document).
    const writeSpy = vi.spyOn(document, 'write').mockImplementation((html) => {
      document.body.insertAdjacentHTML('beforeend', html);
    });

    GD.GrooveDBFormatPutGrooveOnPage({
      snareAccentTab: 'S',
      snareOtherTab: '-',
      kickTab: 'K',
      footOtherTab: '-',
      notesPerTabMeasure: 16,
      measures: 1,
    });

    expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('<span id="GrooveDisplay'));
    const span = document.querySelector('span[id^="GrooveDisplay"]');
    expect(span).toBeTruthy();

    // The heavy work is deferred to window 'load'.
    window.dispatchEvent(new window.Event('load'));

    expect(span.querySelector('.svgTarget')).toBeTruthy();
    expect(mock.last.createABCFromGrooveData).toHaveBeenCalled();
  });
});
