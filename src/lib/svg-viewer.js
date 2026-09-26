// SVG pan/zoom viewer for circuit diagrams.
//
// createSvgViewer(container) mounts the viewer DOM and returns:
//   - load(svgText): inject new SVG (strips <?xml prolog)
//   - destroy(): remove listeners + DOM
//   - zoomIn() / zoomOut(): discrete 1.1x steps, anchored at viewport center
//   - fit(): scale SVG to viewport with padding
//   - reset(): 100% (centered)
//
// Mechanics: a single CSS transform on the stage element handles both
// translate (pan) and scale (zoom). Zoom-to-cursor keeps the world point
// under the pointer stationary while wheel-zooming.

const WHEEL_FACTOR = 1.1;
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const FIT_PADDING = 28;

export function shouldZoomOnWheel(event) {
  return Boolean(event.ctrlKey || event.metaKey);
}

export function createSvgViewer(container) {
  if (!container) throw new Error('createSvgViewer: container is required');

  // Build skeleton DOM
  container.classList.add('svg-frame');
  container.innerHTML = '';

  const viewport = document.createElement('div');
  viewport.className = 'svg-viewport';
  container.appendChild(viewport);

  const stage = document.createElement('div');
  stage.className = 'svg-stage';
  viewport.appendChild(stage);

  const card = document.createElement('div');
  card.className = 'svg-card';
  stage.appendChild(card);

  const status = document.createElement('div');
  status.className = 'svg-status';
  status.innerHTML = '<span>--</span>%';
  container.appendChild(status);

  let svgEl = null;
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let baseSize = { width: 0, height: 0 };
  let activePointer = null;
  let panStart = null;
  let resizeObserver = null;

  // ----- transform helpers -----

  function applyTransform() {
    stage.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
    if (svgEl) {
      const pct = Math.round(scale * 100);
      status.firstElementChild.textContent = String(pct);
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function reset() {
    scale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function measureSvg() {
    if (!svgEl) return;
    const { width, height } = svgEl.viewBox.baseVal;
    if (width > 0 && height > 0) {
      baseSize = { width, height };
      return;
    }
    const previous = stage.style.transform;
    stage.style.transform = 'none';
    const rect = svgEl.getBoundingClientRect();
    stage.style.transform = previous;
    baseSize = { width: rect.width, height: rect.height };
  }

  function fit() {
    if (!svgEl) return;
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw === 0 || vh === 0 || baseSize.width === 0 || baseSize.height === 0) return;
    const usableW = Math.max(0, vw - FIT_PADDING * 2);
    const usableH = Math.max(0, vh - FIT_PADDING * 2);
    const s = Math.min(usableW / baseSize.width, usableH / baseSize.height);
    scale = clamp(s, MIN_SCALE, MAX_SCALE);
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function zoomToPoint(factor, anchorX, anchorY) {
    if (!svgEl) return;
    // anchorX/anchorY are coordinates in viewport (CSS px) — typically the
    // cursor or viewport center. We want the world point under (anchorX, anchorY)
    // to remain under (anchorX, anchorY) after scaling.
    const newScale = clamp(scale * factor, MIN_SCALE, MAX_SCALE);
    if (newScale === scale) return;

    // World point under anchor before scaling:
    //   worldX = (anchorX - viewportCenter.x - panX) / scale
    // where viewportCenter.x = vw/2. We then solve for new pan that keeps
    // worldX under anchorX at newScale.
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const centerX = vw / 2;
    const centerY = vh / 2;
    const worldX = (anchorX - centerX - panX) / scale;
    const worldY = (anchorY - centerY - panY) / scale;

    scale = newScale;
    panX = anchorX - centerX - worldX * scale;
    panY = anchorY - centerY - worldY * scale;
    applyTransform();
  }

  function zoomBy(factor) {
    if (!svgEl) return;
    const anchorX = viewport.clientWidth / 2;
    const anchorY = viewport.clientHeight / 2;
    zoomToPoint(factor, anchorX, anchorY);
  }

  function zoomIn() {
    zoomBy(WHEEL_FACTOR);
  }

  function zoomOut() {
    zoomBy(1 / WHEEL_FACTOR);
  }

  // ----- event handlers -----

  function onWheel(event) {
    if (!svgEl) return;
    if (!shouldZoomOnWheel(event)) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = event.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    zoomToPoint(factor, anchorX, anchorY);
  }

  function onPointerDown(event) {
    if (!svgEl) return;
    if (event.button !== undefined && event.button !== 0) return;
    activePointer = event.pointerId;
    panStart = { x: event.clientX, y: event.clientY, panX, panY };
    viewport.classList.add('is-dragging');
    try {
      viewport.setPointerCapture(event.pointerId);
    } catch (_) {
      // ignore capture failures
    }
  }

  function onPointerMove(event) {
    if (activePointer !== event.pointerId || !panStart) return;
    panX = panStart.panX + (event.clientX - panStart.x);
    panY = panStart.panY + (event.clientY - panStart.y);
    applyTransform();
  }

  function onPointerEnd(event) {
    if (activePointer !== event.pointerId) return;
    activePointer = null;
    panStart = null;
    viewport.classList.remove('is-dragging');
    try {
      viewport.releasePointerCapture(event.pointerId);
    } catch (_) {
      // ignore
    }
  }

  function onKeydown(event) {
    if (!svgEl) return;
    // Only respond when the viewer is actually visible (its tab is open).
    if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return;
    if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0') {
      event.preventDefault();
      reset();
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      fit();
    }
  }

  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', onPointerEnd);
  viewport.addEventListener('pointercancel', onPointerEnd);
  viewport.addEventListener('pointerleave', onPointerEnd);
  document.addEventListener('keydown', onKeydown);

  // Keep base size in sync with viewport / SVG sizing changes.
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => {
      // If we are at fit-ish scale (==1 by default after reset/load), refit
      // on first resize so the SVG nicely fills the viewport. After the user
      // has interacted (pan/zoom) we leave their transform alone.
      if (!userInteracted && svgEl) {
        fit();
      } else {
        // Refresh baseSize so subsequent fit() uses current dimensions.
        measureSvg();
      }
    });
    resizeObserver.observe(viewport);
  }

  let userInteracted = false;
  function markInteracted() {
    userInteracted = true;
  }
  viewport.addEventListener('pointerdown', markInteracted, { once: true });
  viewport.addEventListener('wheel', markInteracted, { once: true });

  // ----- public API -----

  function load(svgText) {
    if (typeof svgText !== 'string') {
      throw new Error('load(svgText): expected string');
    }
    let clean = svgText.trim();
    // Strip <?xml ... ?> prolog + any leading whitespace
    clean = clean.replace(/^\s*<\?xml[\s\S]*?\?>\s*/, '');
    const fragment = document.createElement('div');
    fragment.innerHTML = clean;
    const incoming = fragment.querySelector('svg');
    if (!incoming) {
      throw new Error('load(): no <svg> element found in provided text');
    }
    // Replace previous SVG
    card.innerHTML = '';
    card.appendChild(incoming);
    svgEl = incoming;
    userInteracted = false;
    // Wait one frame so layout settles before measuring.
    requestAnimationFrame(() => {
      measureSvg();
      fit();
    });
  }

  function destroy() {
    viewport.removeEventListener('wheel', onWheel);
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('pointermove', onPointerMove);
    viewport.removeEventListener('pointerup', onPointerEnd);
    viewport.removeEventListener('pointercancel', onPointerEnd);
    viewport.removeEventListener('pointerleave', onPointerEnd);
    document.removeEventListener('keydown', onKeydown);
    if (resizeObserver) resizeObserver.disconnect();
    container.classList.remove('svg-frame');
    container.innerHTML = '';
    svgEl = null;
  }

  return {
    load,
    destroy,
    zoomIn,
    zoomOut,
    fit,
    reset,
  };
}
