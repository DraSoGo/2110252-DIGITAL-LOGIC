import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldZoomOnWheel } from '../src/lib/svg-viewer.js';

test('wheel zoom requires Ctrl or Meta so ordinary page scrolling is preserved', () => {
  assert.equal(shouldZoomOnWheel({ ctrlKey: false, metaKey: false }), false);
  assert.equal(shouldZoomOnWheel({ ctrlKey: true, metaKey: false }), true);
  assert.equal(shouldZoomOnWheel({ ctrlKey: false, metaKey: true }), true);
});
