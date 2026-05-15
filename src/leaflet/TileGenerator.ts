import { App, Notice, TFile } from 'obsidian';
import type StorytellerSuitePlugin from '../main';
import type { TileMetadata, TileGenerationProgress, ProgressCallback } from './types';
import {
    getSvgSourceInfoFromText,
    isSvgPath,
    loadImageFromBlob,
    rasterizeSvgToBlob,
} from '../utils/SvgImageUtils';

/**
 * TileGenerator - Generates image tiles for large maps
 *
 * Converts large images into tile pyramids for efficient rendering in Leaflet.
 * Uses HTML5 Canvas for client-side tile generation (no external dependencies).
 *
 * Tile Structure:
 * ```
 * StorytellerSuite/MapTiles/{hash}/
 *   metadata.json
 *   0/0/0.png           (zoom 0: 1 tile)
 *   1/0/0.png, 0/1.png  (zoom 1: 4 tiles)
 *   2/...               (zoom 2: 16 tiles)
 * ```
 */
export class TileGenerator {
    private tilesGenerated = 0;
    private totalTilesToGenerate = 0;
    private progressCallback?: ProgressCallback;
    private currentNotice?: Notice;

    constructor(
        private app: App,
        private plugin: StorytellerSuitePlugin
    ) {}

    /**
     * Main entry point - generates tiles for an image
     *
     * @param imagePath - Vault path to source image
     * @param options - Generation options
     * @returns Hash of generated tiles
     */
    async generateTiles(
        imagePath: string,
        options?: { onProgress?: ProgressCallback }
    ): Promise<string> {
        this.progressCallback = options?.onProgress;
        this.tilesGenerated = 0;

        try {
            

            // 1. Read image data
            const imageData = await this.app.vault.adapter.readBinary(imagePath);

            // 2. Calculate hash
            const hash = await this.calculateImageHash(imageData);
            

            // 3. Check if tiles already exist
            const metadataPath = `StorytellerSuite/MapTiles/${hash}/metadata.json`;
            const existingMetadata = this.app.vault.getAbstractFileByPath(metadataPath);

            if (existingMetadata instanceof TFile) {
                
                new Notice('Map tiles already exist for this image');
                return hash;
            }

            // 4. Load image to get dimensions
            const img = await this.loadImage(imagePath);
            const { width, height } = img;
            

            // 5. Calculate zoom levels
            const tileSize = this.plugin.settings.tiling?.tileSize || 256;
            const { minZoom, maxZoom } = this.calculateZoomLevels(width, height, tileSize);
            

            // 6. Calculate total tiles for progress tracking
            this.totalTilesToGenerate = this.calculateTotalTiles(width, height, minZoom, maxZoom, tileSize);
            

            // 7. Ensure output directory exists
            const outputPath = `StorytellerSuite/MapTiles/${hash}`;
            await this.plugin.ensureFolder(outputPath);

            // 8. Generate tiles
            await this.generateWithCanvas(img, outputPath, width, height, minZoom, maxZoom, tileSize);

            // 9. Save metadata
            const metadata: TileMetadata = {
                width,
                height,
                tileSize,
                minZoom,
                maxZoom,
                imageHash: hash,
                sourcePath: imagePath,
                generatedAt: Date.now(),
                method: 'canvas',
                version: this.plugin.manifest.version
            };
            await this.saveMetadata(hash, metadata);

            
            return hash;

        } catch (error) {
            
            const message = error instanceof Error ? error.message : String(error);
            new Notice('Failed to generate map tiles: ' + message);
            throw error;
        }
    }

    /**
     * Calculate SHA-256 hash of image data
     * Used for tile directory naming and deduplication
     */
    private async calculateImageHash(imageData: ArrayBuffer): Promise<string> {
        const hashBuffer = await crypto.subtle.digest('SHA-256', imageData);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // Use first 16 characters for shorter paths
        return hashHex.substring(0, 16);
    }

    /**
     * Calculate appropriate zoom levels for image
     *
     * @param width - Image width in pixels
     * @param height - Image height in pixels
     * @param tileSize - Tile size (default 256)
     */
    private calculateZoomLevels(
        width: number,
        height: number,
        tileSize: number
    ): { minZoom: number; maxZoom: number } {
        const maxDim = Math.max(width, height);

        // Max zoom = native resolution (one tile = tileSize px of original)
        // At maxZoom, the image is displayed at 1:1 pixel ratio
        const maxZoom = Math.ceil(Math.log2(maxDim / tileSize));

        // Min zoom = allow zooming out 5 levels from max
        // This ensures you can see the whole image easily
        const minZoom = Math.max(0, maxZoom - 5);

        return { minZoom, maxZoom };
    }

    /**
     * Calculate total number of tiles that will be generated
     */
    private calculateTotalTiles(
        width: number,
        height: number,
        minZoom: number,
        maxZoom: number,
        tileSize: number
    ): number {
        let total = 0;

        for (let z = minZoom; z <= maxZoom; z++) {
            const scale = Math.pow(2, z - maxZoom);
            const scaledWidth = Math.ceil(width * scale);
            const scaledHeight = Math.ceil(height * scale);
            const tilesX = Math.ceil(scaledWidth / tileSize);
            const tilesY = Math.ceil(scaledHeight / tileSize);
            total += tilesX * tilesY;
        }

        return total;
    }

    /**
     * Core tile generation using HTML5 Canvas
     *
     * Generates a pyramid of tiles from maxZoom (native resolution) down to minZoom
     */
    private async generateWithCanvas(
        img: HTMLImageElement,
        outputPath: string,
        width: number,
        height: number,
        minZoom: number,
        maxZoom: number,
        tileSize: number
    ): Promise<void> {
        const totalZoomLevels = maxZoom - minZoom + 1;
        let currentZoomIndex = 0;

        // Generate tiles for each zoom level (from max to min)
        for (let z = maxZoom; z >= minZoom; z--) {
            

            // Calculate scale for this zoom level
            // At maxZoom: scale = 1 (full resolution)
            // At maxZoom-1: scale = 0.5 (half resolution)
            const scale = Math.pow(2, z - maxZoom);
            const scaledWidth = Math.ceil(width * scale);
            const scaledHeight = Math.ceil(height * scale);

            // Calculate tile grid size
            const tilesX = Math.ceil(scaledWidth / tileSize);
            const tilesY = Math.ceil(scaledHeight / tileSize);

            

            // Generate each tile in the grid
            for (let x = 0; x < tilesX; x++) {
                for (let y = 0; y < tilesY; y++) {
                    // Create canvas for this tile
                    const canvas = createEl('canvas');
                    canvas.width = tileSize;
                    canvas.height = tileSize;
                    const ctx = canvas.getContext('2d')!;

                    // Fill with transparent background
                    ctx.clearRect(0, 0, tileSize, tileSize);

                    // Calculate source rectangle in original image
                    const srcX = x * tileSize / scale;
                    const srcY = y * tileSize / scale;
                    const srcW = tileSize / scale;
                    const srcH = tileSize / scale;

                    // Calculate destination rectangle (handle edge tiles)
                    const destW = Math.min(tileSize, scaledWidth - x * tileSize);
                    const destH = Math.min(tileSize, scaledHeight - y * tileSize);

                    // Draw scaled portion of image to canvas
                    ctx.drawImage(
                        img,
                        srcX, srcY, srcW, srcH,  // Source rectangle
                        0, 0, destW, destH        // Destination rectangle
                    );

                    // Convert canvas to PNG blob
                    const blob = await this.canvasToBlob(canvas);

                    // Save tile to vault
                    const tilePath = `${outputPath}/${z}/${x}/${y}.png`;
                    await this.saveTileToVault(tilePath, blob);

                    // Update progress
                    this.tilesGenerated++;

                    // Yield to UI every 10 tiles to prevent freezing
                    if (this.tilesGenerated % 10 === 0) {
                        await new Promise(resolve => window.setTimeout(resolve, 0));
                        this.emitProgress(currentZoomIndex + 1, totalZoomLevels);
                    }
                }
            }

            currentZoomIndex++;
            this.emitProgress(currentZoomIndex, totalZoomLevels);
        }
    }

    /**
     * Convert canvas to PNG blob
     */
    private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
        return new Promise((resolve, reject) => {
            canvas.toBlob(blob => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            }, 'image/png');
        });
    }

    /**
     * Save tile to vault using Obsidian API
     * Ensures parent directories exist before saving
     */
    private async saveTileToVault(tilePath: string, blob: Blob): Promise<void> {
        // Ensure parent directories exist
        const pathParts = tilePath.split('/');
        let currentPath = '';

        for (let i = 0; i < pathParts.length - 1; i++) {
            currentPath += (i > 0 ? '/' : '') + pathParts[i];

            try {
                await this.plugin.ensureFolder(currentPath);
            } catch {
                // Folder might already exist, ignore
            }
        }

        // Convert blob to ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();

        // Save using Obsidian vault API
        await this.app.vault.createBinary(tilePath, arrayBuffer);
    }

    /**
     * Save metadata.json file
     */
    private async saveMetadata(hash: string, metadata: TileMetadata): Promise<void> {
        const metadataPath = `StorytellerSuite/MapTiles/${hash}/metadata.json`;
        const content = JSON.stringify(metadata, null, 2);

        await this.app.vault.create(metadataPath, content);
    }

    /**
     * Load image from vault path
     * Returns HTMLImageElement with dimensions
     */
    private loadImage(imagePath: string): Promise<HTMLImageElement> {
        if (isSvgPath(imagePath)) {
            return this.loadSvgAsRasterImage(imagePath);
        }

        return new Promise((resolve, reject) => {
            const imageFile = this.app.vault.getAbstractFileByPath(imagePath);

            if (!(imageFile instanceof TFile)) {
                reject(new Error(`Image not found: ${imagePath}`));
                return;
            }

            const imageUrl = this.app.vault.adapter.getResourcePath(imageFile.path);
            const img = new Image();

            let timeoutId: number;

            const cleanup = () => {
                window.clearTimeout(timeoutId);
                img.onload = null;
                img.onerror = null;
            };

            img.onload = () => {
                cleanup();

                if (img.width === 0 || img.height === 0) {
                    reject(new Error('Image has zero dimensions'));
                } else {
                    resolve(img);
                }
            };

            img.onerror = () => {
                cleanup();
                reject(new Error(`Failed to load image: ${imagePath}`));
            };

            // Timeout after 30 seconds
            timeoutId = window.setTimeout(() => {
                cleanup();
                reject(new Error(`Image load timeout: ${imagePath}`));
            }, 30000);

            img.src = imageUrl;
        });
    }

    private async loadSvgAsRasterImage(imagePath: string): Promise<HTMLImageElement> {
        const svgText = await this.app.vault.adapter.read(imagePath);
        const info = getSvgSourceInfoFromText(svgText);
        const { blob } = await rasterizeSvgToBlob(svgText, info);
        return await loadImageFromBlob(blob);
    }

    /**
     * Emit progress update to callback
     */
    private emitProgress(currentZoom: number, totalZoomLevels: number): void {
        if (!this.progressCallback) return;

        const percentComplete = Math.round((this.tilesGenerated / this.totalTilesToGenerate) * 100);

        const progress: TileGenerationProgress = {
            currentZoom,
            totalZoomLevels,
            percentComplete,
            tilesGenerated: this.tilesGenerated,
            totalTiles: this.totalTilesToGenerate
        };

        this.progressCallback(progress);
    }
}
