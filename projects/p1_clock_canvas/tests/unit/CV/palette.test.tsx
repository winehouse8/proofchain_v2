// @vitest-environment jsdom
// Canvas Editor — Unit Test (Palette)
// Covers TC-CC-CV-001 (6 component types in palette)

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Palette from '../../../src/client/components/Palette.js';

// @tc TC-CC-CV-001
// @req REQ-CV-001
describe('TC-CC-CV-001 — Palette displays all 6 component types', () => {
  it('should render exactly 6 palette items with correct labels', () => {
    // GIVEN: The Canvas Editor is loaded and the left sidebar palette is rendered
    const { container } = render(<Palette />);

    // WHEN: The palette component is inspected for its rendered items
    const items = container.querySelectorAll('.palette-item');
    const labels = container.querySelectorAll('.palette-item-label');
    const labelTexts = Array.from(labels).map(el => el.textContent);

    // THEN: The palette contains exactly 6 items with correct labels
    expect(items).toHaveLength(6);
    expect(labelTexts).toContain('PLL');
    expect(labelTexts).toContain('Divider');
    expect(labelTexts).toContain('Mux');
    expect(labelTexts).toContain('Clock Gate');
    expect(labelTexts).toContain('IP Block');
    expect(labelTexts).toContain('Clock Domain');
  });
});
