class AssetManager {
    constructor() {
        this.images = {};
        this.loadedCount = 0;
        this.totalCount = 0;
    }

    loadAssets(assets, onComplete) {
        this.totalCount = Object.keys(assets).length;
        if (this.totalCount === 0) {
            onComplete();
            return;
        }

        for (const [key, path] of Object.entries(assets)) {
            const img = new Image();
            // img.crossOrigin = "Anonymous"; // Try to prevent tainting
            img.src = path;
            img.onload = () => {
                // Process image: Resize and Remove Background
                this.images[key] = this.processImage(img);

                this.loadedCount++;
                if (this.loadedCount === this.totalCount) {
                    onComplete();
                }
            };
            img.onerror = () => {
                console.error(`Failed to load asset: ${path}`);
                this.loadedCount++;
                if (this.loadedCount === this.totalCount) {
                    onComplete();
                }
            };
        }
    }

    processImage(img) {
        // Target size for tiles (e.g., 128x128 for better quality on zoom)
        const targetWidth = 128;
        const targetHeight = 128;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        // Draw resized
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        try {
            // Remove White Background
            const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                // Simple threshold for white/near-white
                if (r > 240 && g > 240 && b > 240) {
                    data[i + 3] = 0; // Set alpha to 0
                }
            }

            ctx.putImageData(imageData, 0, 0);
            return canvas;
        } catch (e) {
            console.warn("Could not process image data (CORS/Security). Using original image.", e);
            // If we can't process pixels, we just return the canvas with the image drawn on it
            // (It will still have the white background, but won't crash)
            return img; // Return the original img as per instruction
        }
    }

    getImage(key) {
        return this.images[key];
    }
}
