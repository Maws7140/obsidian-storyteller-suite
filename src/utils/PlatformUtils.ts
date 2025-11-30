import { Platform } from 'obsidian';

/**
 * Utility class for platform detection and mobile-specific adaptations
 * Provides consistent methods for detecting mobile devices and adapting UI accordingly
 */
export class PlatformUtils {
    /**
     * Checks if the current platform is a mobile device (iOS or Android)
     * @returns true if running on iOS or Android
     */
    static isMobile(): boolean {
        return Platform.isAndroidApp || Platform.isIosApp;
    }

    /**
     * Checks if running on iOS specifically
     * @returns true if running on iOS
     */
    static isIOS(): boolean {
        return Platform.isIosApp;
    }

    /**
     * Checks if running on Android specifically
     * @returns true if running on Android
     */
    static isAndroid(): boolean {
        return Platform.isAndroidApp;
    }

    /**
     * Checks if running on desktop (not mobile)
     * @returns true if running on desktop
     */
    static isDesktop(): boolean {
        return !this.isMobile();
    }

    /**
     * Gets appropriate touch target size for current platform
     * Mobile devices need larger touch targets for accessibility
     * @returns minimum touch target size in pixels
     */
    static getTouchTargetSize(): number {
        return this.isMobile() ? 44 : 32; // 44px for mobile (Apple HIG standard)
    }

    /**
     * Gets appropriate modal padding for current platform
     * @returns padding value in rem
     */
    static getModalPadding(): string {
        return this.isMobile() ? '0.5rem' : '1rem';
    }

    /**
     * Gets appropriate font size scaling for mobile
     * @returns font size scaling factor
     */
    static getFontScaling(): number {
        return this.isMobile() ? 1.1 : 1.0;
    }

    /**
     * Determines if modals should be full screen on current platform
     * @returns true if modals should be full screen
     */
    static shouldUseFullScreenModals(): boolean {
        return this.isMobile();
    }

    /**
     * Gets appropriate debounce delay for search operations
     * Mobile devices may need longer delays for performance
     * @returns debounce delay in milliseconds
     */
    static getSearchDebounceDelay(): number {
        return this.isMobile() ? 300 : 150;
    }

    /**
     * Determines maximum number of items to display in lists for performance
     * @returns maximum items to show
     */
    static getMaxDisplayItems(): number {
        return this.isMobile() ? 50 : 100;
    }

    /**
     * Gets CSS classes to apply for mobile-specific styling
     * @returns array of CSS class names
     */
    static getMobileCssClasses(): string[] {
        const classes: string[] = [];
        
        if (this.isMobile()) {
            classes.push('is-mobile');
        }
        
        if (this.isIOS()) {
            classes.push('is-ios');
        }
        
        if (this.isAndroid()) {
            classes.push('is-android');
        }
        
        if (this.isDesktop()) {
            classes.push('is-desktop');
        }
        
        return classes;
    }

    /**
     * Checks if the current screen is likely a tablet vs phone
     * This is a heuristic based on viewport dimensions, working in both portrait and landscape
     * @returns true if screen appears to be tablet-sized
     */
    static isTablet(): boolean {
        if (!this.isMobile()) return false;

        // Use CSS pixels directly - more reliable across orientations
        const cssWidth = window.innerWidth;
        const cssHeight = window.innerHeight;

        // Tablets have minimum dimension >= 600px in CSS pixels
        const minDimension = Math.min(cssWidth, cssHeight);
        const maxDimension = Math.max(cssWidth, cssHeight);

        // Screen diagonal approximation (rough tablet detection)
        // This works regardless of orientation
        const diagonal = Math.sqrt(cssWidth * cssWidth + cssHeight * cssHeight);

        // Tablet thresholds:
        // - Min dimension >= 600px (common tablet breakpoint - Google Material Design)
        // - OR diagonal >= 900px (catches larger tablets like Galaxy Tab S7 FE)
        const isTabletSize = minDimension >= 600 || diagonal >= 900;

        // Aspect ratio check (tablets are typically 4:3 to 16:10)
        // This works regardless of orientation
        // Expanded range: 1.3 to 2.0 to accommodate different tablet formats
        const aspectRatio = maxDimension / minDimension;
        const isTabletAspect = aspectRatio >= 1.3 && aspectRatio <= 2.0;

        return isTabletSize && isTabletAspect;
    }

    /**
     * Gets appropriate grid columns for current screen size
     * @returns number of columns for grid layouts
     */
    static getGridColumns(): number {
        if (!this.isMobile()) return 3;
        return this.isTablet() ? 2 : 1;
    }

    /**
     * Determines if advanced features should be hidden on mobile for performance
     * @returns true if should use simplified UI
     */
    static shouldUseSimplifiedUI(): boolean {
        return this.isMobile() && !this.isTablet();
    }

    /**
     * Gets appropriate animation duration for current platform
     * Mobile devices may benefit from shorter animations
     * @returns animation duration in milliseconds
     */
    static getAnimationDuration(): number {
        return this.isMobile() ? 200 : 300;
    }

    /**
     * Determines if haptic feedback is available and should be used
     * @returns true if haptic feedback should be used
     */
    static shouldUseHapticFeedback(): boolean {
        return this.isMobile(); // Both iOS and Android support haptic feedback
    }

  /** Whether remote images (http/https) should be allowed based on plugin settings. Default false. */
  static allowRemoteImages(getSetting: () => boolean | undefined): boolean {
    const val = getSetting();
    return !!val;
  }
}
