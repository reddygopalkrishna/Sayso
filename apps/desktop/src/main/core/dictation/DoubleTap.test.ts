import { describe, expect, it } from 'vitest';
import { DoubleTap } from './DoubleTap.ts';

describe('DoubleTap', () => {
  it('two quick taps are a double tap, and the second press is swallowed', () => {
    const d = new DoubleTap();
    expect(d.handle('down', 0)).toBe('pass');
    expect(d.handle('up', 100)).toBe('pass');
    expect(d.handle('down', 300)).toBe('double');
    expect(d.handle('up', 380)).toBe('swallow');
  });

  it('a hold is not a tap', () => {
    const d = new DoubleTap();
    d.handle('down', 0);
    d.handle('up', 1500);
    expect(d.handle('down', 1700)).toBe('pass');
  });

  it('a long gap between taps is two single taps', () => {
    const d = new DoubleTap();
    d.handle('down', 0);
    d.handle('up', 100);
    expect(d.handle('down', 900)).toBe('pass');
  });

  it('Fn with another key or Shift cancels the tap', () => {
    const d = new DoubleTap();
    d.handle('down', 0);
    d.handle('chord', 50);
    d.handle('up', 100);
    expect(d.handle('down', 200)).toBe('pass');
    const e = new DoubleTap();
    e.handle('down', 0);
    e.handle('command', 20);
    e.handle('up', 100);
    expect(e.handle('down', 200)).toBe('pass');
  });

  it('a third tap right after a double tap starts over', () => {
    const d = new DoubleTap();
    d.handle('down', 0);
    d.handle('up', 80);
    d.handle('down', 200);
    d.handle('up', 280);
    expect(d.handle('down', 400)).toBe('pass');
  });

  it('works again after a long pause', () => {
    const d = new DoubleTap();
    d.handle('down', 0);
    d.handle('up', 80);
    d.handle('down', 200);
    d.handle('up', 280);
    d.handle('down', 5000);
    d.handle('up', 5080);
    expect(d.handle('down', 5200)).toBe('double');
  });
});
