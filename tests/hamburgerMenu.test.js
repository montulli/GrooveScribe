import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initHamburgerMenu } from '../js/hamburgerMenu.js';

// Just the elements hamburgerMenu.js wires up. window.myGrooveWriter stands in for GrooveWriter.
function buildDom() {
  document.body.innerHTML = `
    <span id="hamburgerButton"><i></i></span>
    <div id="hamburgerMenu">
      <span class="menuItem" id="grooveSetupItem"><span id="timeSigLabel"><sup>4</sup>/<sub>4</sub></span></span>
    </div>
    <div id="grooveSetupModal" class="navModal navModalStrict">
      <div class="navModalCard">
        <input id="tuneTitle" value="Old title">
        <input id="tuneAuthor" value="">
        <input id="tuneComments" value="">
        <select id="timeSigPopupTimeSigTop">${[2, 3, 4, 5, 6, 7]
          .map((n) => `<option value="${n}">${n}</option>`)
          .join('')}</select>
        <select id="timeSigPopupTimeSigBottom"><option value="4">4</option><option value="8">8</option></select>
        <select id="subdivisionSelect">
          <option id="subdivision_8ths" value="8"></option>
          <option id="subdivision_16ths" value="16" class="buttonSelected"></option>
          <option id="subdivision_12ths" value="12"></option>
        </select>
        <button id="grooveSetupModalCancel" class="navModalCancel"></button>
        <button id="grooveSetupModalDone" class="navModalDone"></button>
      </div>
    </div>
    <div id="otherModal" class="navModal"></div>`;
}

describe('Groove Setup dialog: choices are staged until Done', () => {
  let applyTimeSignature;
  let changeDivision;
  let refresh_ABC;
  const modal = () => document.getElementById('grooveSetupModal');
  const top = () => document.getElementById('timeSigPopupTimeSigTop');
  const subdivision = () => document.getElementById('subdivisionSelect');
  const reopen = () => document.getElementById('grooveSetupItem').click();
  const choose = (select, value) => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };

  beforeEach(() => {
    buildDom();
    applyTimeSignature = vi.fn();
    changeDivision = vi.fn();
    refresh_ABC = vi.fn();
    // the real rule: 1/8 notes must divide the measure evenly; triplets need x/4
    const divisionFitsTimeSignature = (division, top, bottom) =>
      ((division * top) / bottom) % 1 === 0 && !([12, 24, 48].includes(division) && bottom != 4);
    window.myGrooveWriter = {
      applyTimeSignature,
      changeDivision,
      refresh_ABC,
      divisionFitsTimeSignature,
    };
    initHamburgerMenu();
    reopen();
  });

  it('opens showing the current time signature and subdivision', () => {
    expect(modal().classList.contains('open')).toBe(true);
    expect(top().value).toBe('4');
    expect(subdivision().value).toBe('16');
  });

  it('changing a dropdown applies nothing by itself', () => {
    choose(top(), '3');
    choose(subdivision(), '8');
    expect(applyTimeSignature).not.toHaveBeenCalled();
    expect(changeDivision).not.toHaveBeenCalled();
    expect(top().value).toBe('3'); // staged values survive
    expect(subdivision().value).toBe('8');
  });

  it('Done applies a staged time signature and subdivision together, in one relayout', () => {
    choose(top(), '3');
    choose(subdivision(), '8');
    document.getElementById('grooveSetupModalDone').click();
    expect(applyTimeSignature).toHaveBeenCalledTimes(1);
    expect(applyTimeSignature).toHaveBeenCalledWith(8); // the new subdivision rides along
    expect(changeDivision).not.toHaveBeenCalled(); // not a second relayout
    expect(refresh_ABC).not.toHaveBeenCalled(); // the relayout already re-rendered
    expect(modal().classList.contains('open')).toBe(false);
  });

  it('Done with only the time signature changed keeps the current subdivision', () => {
    choose(top(), '3');
    document.getElementById('grooveSetupModalDone').click();
    expect(applyTimeSignature).toHaveBeenCalledWith(undefined);
    expect(changeDivision).not.toHaveBeenCalled();
  });

  it('Done with only the subdivision changed calls changeDivision', () => {
    choose(subdivision(), '8');
    document.getElementById('grooveSetupModalDone').click();
    expect(changeDivision).toHaveBeenCalledWith(8);
    expect(applyTimeSignature).not.toHaveBeenCalled();
  });

  it('Done with nothing changed applies nothing', () => {
    document.getElementById('grooveSetupModalDone').click();
    expect(applyTimeSignature).not.toHaveBeenCalled();
    expect(changeDivision).not.toHaveBeenCalled();
    expect(modal().classList.contains('open')).toBe(false);
  });

  it('greys out subdivisions that do not fit the *staged* time signature', () => {
    const triplets = document.getElementById('subdivision_12ths');
    expect(triplets.disabled).toBe(false); // 4/4
    choose(document.getElementById('timeSigPopupTimeSigBottom'), '8');
    expect(triplets.disabled).toBe(true); // x/8: no triplets
    expect(document.getElementById('subdivision_8ths').disabled).toBe(false);
    choose(document.getElementById('timeSigPopupTimeSigBottom'), '4');
    expect(triplets.disabled).toBe(false); // back to x/4
  });

  it('a staged subdivision that the staged time signature rules out falls back to 1/16', () => {
    choose(subdivision(), '12');
    choose(document.getElementById('timeSigPopupTimeSigBottom'), '8');
    expect(subdivision().value).toBe('16');
  });

  it('Cancel closes without applying and discards the staged choices', () => {
    choose(top(), '7');
    choose(subdivision(), '8');
    document.getElementById('grooveSetupModalCancel').click();
    expect(applyTimeSignature).not.toHaveBeenCalled();
    expect(changeDivision).not.toHaveBeenCalled();
    expect(modal().classList.contains('open')).toBe(false);

    reopen();
    expect(top().value).toBe('4');
    expect(subdivision().value).toBe('16');
  });

  it('tapping the backdrop does NOT close it: the user must choose Done or Cancel', () => {
    choose(top(), '3');
    modal().click(); // backdrop
    expect(modal().classList.contains('open')).toBe(true);
    expect(top().value).toBe('3'); // staged change still there
    expect(applyTimeSignature).not.toHaveBeenCalled();
  });

  it('other dialogs still close on a backdrop tap', () => {
    const other = document.getElementById('otherModal');
    other.classList.add('open');
    other.click();
    expect(other.classList.contains('open')).toBe(false);
  });

  describe('title, author and comment', () => {
    const title = () => document.getElementById('tuneTitle');

    it('a title typed alongside a time signature change is picked up by that relayout', () => {
      title().value = 'New title';
      choose(top(), '3');
      document.getElementById('grooveSetupModalDone').click();
      expect(applyTimeSignature).toHaveBeenCalledTimes(1);
      expect(refresh_ABC).not.toHaveBeenCalled();
    });

    it('typing re-renders nothing until Done, which then re-renders once', () => {
      title().value = 'New title';
      title().dispatchEvent(new Event('input', { bubbles: true }));
      expect(refresh_ABC).not.toHaveBeenCalled();

      document.getElementById('grooveSetupModalDone').click();
      expect(refresh_ABC).toHaveBeenCalledTimes(1);
      expect(title().value).toBe('New title');
    });

    it('Done with the text unchanged does not re-render', () => {
      document.getElementById('grooveSetupModalDone').click();
      expect(refresh_ABC).not.toHaveBeenCalled();
    });

    it('Cancel puts the text fields back', () => {
      title().value = 'Changed';
      document.getElementById('grooveSetupModalCancel').click();
      expect(title().value).toBe('Old title');
      expect(refresh_ABC).not.toHaveBeenCalled();
    });
  });
});
