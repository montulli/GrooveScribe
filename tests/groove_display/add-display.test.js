import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadGrooveDisplay } from '../helpers/loadDisplay.js';
import { installMockGrooveUtils, uninstallMockGrooveUtils } from '../helpers/mockGrooveUtils.js';

vi.mock('../../js/groove_utils.js', () => ({
  get GrooveUtils() {
    return globalThis.__mockGrooveUtilsCtor;
  },
}));

// Coverage for the public embedding API: AddGrooveDisplayToElementId (renders a
// groove from a URL definition into a given element) and AddGrooveDisplayToPage
// (creates the element and defers rendering to window 'load').
describe('AddGrooveDisplayToElementId', () => {
  let GD;
  let mock;
  const DEF = '?TimeSig=4/4&Div=16&Tempo=90';

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

  it('parses the groove definition and renders the SVG into the target', () => {
    const host = makeHost();
    GD.AddGrooveDisplayToElementId('host', DEF, false, false, false);
    expect(mock.last.getGrooveDataFromUrlString).toHaveBeenCalledWith(DEF);
    expect(mock.last.createABCFromGrooveData).toHaveBeenCalled();
    expect(host.querySelector('.svgTarget').innerHTML).toContain('<svg');
  });

  it('wraps the SVG in an editor link when linkToEditor is true', () => {
    const host = makeHost();
    GD.AddGrooveDisplayToElementId('host', DEF, false, true, false);
    const anchor = host.querySelector('.svgTarget a');
    expect(anchor).toBeTruthy();
    expect(anchor.getAttribute('href')).toBe('http://mikeslessons.com/gscribe/' + DEF);
  });

  it('renders a bare SVG (no link) when linkToEditor is false', () => {
    const host = makeHost();
    GD.AddGrooveDisplayToElementId('host', DEF, false, false, false);
    expect(host.querySelector('.svgTarget a')).toBeNull();
    expect(host.querySelector('.svgTarget svg')).toBeTruthy();
  });

  it('wires the MIDI player when showPlayer is true', () => {
    makeHost();
    GD.AddGrooveDisplayToElementId('host', DEF, true, false, true);
    expect(mock.last.setGrooveData).toHaveBeenCalled();
    expect(mock.last.AddMidiPlayerToPage).toHaveBeenCalled();
    // expandPlayer is forwarded as the second arg.
    expect(mock.last.expandOrRetractMIDI_playback).toHaveBeenCalledWith(true, true);
    expect(mock.last.setTempo).toHaveBeenCalled();
    expect(mock.last.setSwing).toHaveBeenCalled();
    expect(mock.last.setMetronomeFrequencyDisplay).toHaveBeenCalled();
    expect(mock.last.oneTimeInitializeMidi).toHaveBeenCalled();
  });

  it('does not touch the MIDI player when showPlayer is false', () => {
    makeHost();
    GD.AddGrooveDisplayToElementId('host', DEF, false, false, false);
    expect(mock.last.setGrooveData).not.toHaveBeenCalled();
    expect(mock.last.AddMidiPlayerToPage).not.toHaveBeenCalled();
    expect(mock.last.oneTimeInitializeMidi).not.toHaveBeenCalled();
  });
});

describe('AddGrooveDisplayToPage', () => {
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

  it('appends a GrooveDisplay container to the body', () => {
    GD.AddGrooveDisplayToPage('?TimeSig=4/4&Div=16', true, false, false);
    const container = document.body.querySelector('div[id^="GrooveDisplay"]');
    expect(container).toBeTruthy();
  });

  it('defers rendering until the window load event, then renders into the container', () => {
    GD.AddGrooveDisplayToPage('?TimeSig=4/4&Div=16', true, false, false);
    const container = document.body.querySelector('div[id^="GrooveDisplay"]');

    // Nothing rendered yet -- work is queued on window 'load'.
    expect(container.querySelector('.svgTarget')).toBeNull();

    window.dispatchEvent(new window.Event('load'));

    expect(container.querySelector('.svgTarget')).toBeTruthy();
    expect(mock.last.createABCFromGrooveData).toHaveBeenCalled();
  });
});
