import { describe, expect, it } from 'vitest';
import { useDeclarativeSettings } from '../../src/utils/SettingsRendering';

describe('settings rendering path', () => {
    it('renders imperatively on mobile, where declarative sub-pages open blank (#146)', () => {
        expect(useDeclarativeSettings({ isMobile: true })).toBe(false);
    });

    it('keeps declarative sub-pages on desktop', () => {
        expect(useDeclarativeSettings({ isMobile: false })).toBe(true);
    });
});
