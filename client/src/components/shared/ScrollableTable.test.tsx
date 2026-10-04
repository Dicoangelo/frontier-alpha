import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScrollableTable } from './ScrollableTable';

let resizeCallbacks: Array<() => void> = [];
const observe = vi.fn();
const disconnect = vi.fn();

beforeEach(() => {
  resizeCallbacks = [];
  vi.stubGlobal('ResizeObserver', class {
    observe = observe;
    disconnect = disconnect;
    constructor(callback: () => void) { resizeCallbacks.push(callback); }
  });
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const view = render(<ScrollableTable label="Position columns"><table><tbody><tr><td>AAPL</td><td>Position weight</td></tr></tbody></table></ScrollableTable>);
  const viewport = screen.getByRole('region', { name: 'Position columns' });
  const geometry = { clientWidth: 300, scrollWidth: 1200 };
  Object.defineProperties(viewport, {
    clientWidth: { configurable: true, get: () => geometry.clientWidth },
    scrollWidth: { configurable: true, get: () => geometry.scrollWidth },
  });
  act(() => resizeCallbacks[resizeCallbacks.length - 1]());
  return { ...view, viewport, geometry };
}

describe('Scrollable table range synchronization', () => {
  it('measures overflow and synchronizes slider changes with viewport scrolling in both directions', () => {
    const { viewport } = setup();
    const slider = screen.getByRole('slider', { name: 'Position columns' });
    expect(slider).toHaveAttribute('max', '900');
    expect(slider).toHaveAttribute('aria-controls', viewport.id);
    expect(viewport).toHaveAttribute('tabindex', '0');
    expect(observe).toHaveBeenCalledWith(viewport);
    expect(observe).toHaveBeenCalledWith(viewport.firstElementChild);

    fireEvent.change(slider, { target: { value: '450' } });
    expect(viewport.scrollLeft).toBe(450);
    expect(slider).toHaveValue('450');
    expect(slider).toHaveAttribute('aria-valuetext', '50%');

    viewport.scrollLeft = 675;
    fireEvent.scroll(viewport);
    expect(slider).toHaveValue('675');
    expect(slider).toHaveAttribute('aria-valuetext', '75%');
  });

  it('responds to viewport and content resize, removing an unnecessary slider when columns fit', () => {
    const { viewport, geometry } = setup();
    geometry.scrollWidth = 600;
    fireEvent(window, new Event('resize'));
    expect(screen.getByRole('slider')).toHaveAttribute('max', '300');

    geometry.clientWidth = 700;
    viewport.scrollLeft = 0; // browsers clamp scrollLeft when overflow disappears
    act(() => resizeCallbacks[resizeCallbacks.length - 1]());
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(viewport).not.toHaveAttribute('tabindex');

    geometry.scrollWidth = 1400;
    act(() => resizeCallbacks[resizeCallbacks.length - 1]());
    expect(screen.getByRole('slider')).toHaveAttribute('max', '700');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '0%');
  });

  it('clamps browser overscroll in the accessible range and disconnects its observer', () => {
    const { viewport, unmount } = setup();
    viewport.scrollLeft = -30;
    fireEvent.scroll(viewport);
    expect(screen.getByRole('slider')).toHaveValue('0');
    viewport.scrollLeft = 980;
    fireEvent.scroll(viewport);
    expect(screen.getByRole('slider')).toHaveValue('900');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '100%');
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
