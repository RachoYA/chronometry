class Renderer {
    constructor(canvas, grid, assetManager, trafficSystem) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.grid = grid;
        this.assetManager = assetManager;
        this.trafficSystem = trafficSystem;

        // Camera settings
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1.0,
            minZoom: 0.5,
            maxZoom: 2.0,
            rotation: 0 // 0, 1, 2, 3 (x90 degrees)
        };

        // Viewport settings
        this.baseTileWidth = 64;
        this.baseTileHeight = 32;

        // Mouse interaction
        this.hoveredTile = null;
        this.previewBuilding = null;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Effects
        this.effects = [];

        this.setupInput();
    }

    setupInput() {
        // Zoom
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSpeed = 0.001;
            const newZoom = this.camera.zoom - e.deltaY * zoomSpeed;
            this.camera.zoom = Math.max(this.camera.minZoom, Math.min(this.camera.maxZoom, newZoom));
        }, { passive: false });

        // Pan
        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2 || e.button === 0) { // Right or Left click
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                const dx = e.clientX - this.lastMouseX;
                const dy = e.clientY - this.lastMouseY;
                this.camera.x += dx;
                this.camera.y += dy;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        // Rotate (R key)
        window.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === 'r') {
                this.rotate();
            }
        });

        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    rotate() {
        this.camera.rotation = (this.camera.rotation + 1) % 4;
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Center initially if not set
        if (this.camera.x === 0 && this.camera.y === 0) {
            this.camera.x = this.canvas.width / 2;
            this.camera.y = this.canvas.height / 2 - (this.grid.height * this.baseTileHeight) / 2;
        }
    }

    addFloatingText(x, y, text, color) {
        const pos = this.gridToScreen(x, y);
        this.effects.push({
            type: 'text',
            x: pos.x,
            y: pos.y - 30 * this.camera.zoom,
            text: text,
            color: color,
            life: 1.0,
            velocity: 50
        });
    }

    update(dt) {
        // Update effects
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const effect = this.effects[i];
            effect.life -= dt;

            if (effect.type === 'text') {
                effect.y -= effect.velocity * dt;
            }

            if (effect.life <= 0) {
                this.effects.splice(i, 1);
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Determine draw order based on rotation to preserve Z-sorting
        // 0: y+, x+
        // 1: x-, y+
        // 2: y-, x-
        // 3: x+, y-

        const width = this.grid.width;
        const height = this.grid.height;

        // Simple Painter's Algorithm for Isometric
        // We always draw "back to front"
        // The "depth" is roughly (x + y).
        // With rotation, we need to iterate differently.

        // Simplified approach: Iterate all, store in array with depth, sort, then draw.
        // This is robust for rotation.

        let tiles = [];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                tiles.push({ x, y });
            }
        }

        // Sort by screen Y (roughly)
        tiles.sort((a, b) => {
            const posA = this.gridToScreen(a.x, a.y);
            const posB = this.gridToScreen(b.x, b.y);
            return posA.y - posB.y;
        });

        tiles.forEach(t => this.drawTile(t.x, t.y));

        // Draw Hover/Preview
        if (this.hoveredTile) {
            this.drawHoverCursor(this.hoveredTile.x, this.hoveredTile.y);

            if (this.previewBuilding && !this.grid.isOccupied(this.hoveredTile.x, this.hoveredTile.y)) {
                this.ctx.globalAlpha = 0.6;
                const pos = this.gridToScreen(this.hoveredTile.x, this.hoveredTile.y);
                this.drawBuilding(this.ctx, pos.x, pos.y, this.previewBuilding);
                this.ctx.globalAlpha = 1.0;
            }
        }

        // Draw Traffic
        if (this.trafficSystem) {
            this.drawAgents();
        }

        this.drawEffects();
    }

    drawAgents() {
        this.trafficSystem.agents.forEach(agent => {
            const pos = this.gridToScreen(agent.x, agent.y);
            const ctx = this.ctx;
            const zoom = this.camera.zoom;

            ctx.save();
            ctx.translate(pos.x + this.tileWidth / 2, pos.y + this.tileHeight);

            if (agent.type === 'car') {
                // Try to get a car sprite
                // We'll pick one based on agent ID or color to keep it consistent
                const carTypes = ['car_blue', 'car_taxi', 'car_van'];
                // Simple hash from color string to index
                const hash = agent.color.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
                const carId = carTypes[hash % carTypes.length];

                const img = this.assetManager.getImage(carId);

                if (img) {
                    const size = 32 * zoom; // Adjust size
                    // Draw centered
                    ctx.drawImage(img, -size / 2, -size / 2 - size / 4, size, size); // Adjust Y slightly up
                } else {
                    // Fallback Car
                    const size = 12 * zoom;
                    ctx.fillStyle = agent.color;

                    // Body
                    ctx.beginPath();
                    ctx.moveTo(-size, 0);
                    ctx.lineTo(0, -size / 2);
                    ctx.lineTo(size, 0);
                    ctx.lineTo(0, size / 2);
                    ctx.closePath();
                    ctx.fill();

                    // Roof
                    ctx.fillStyle = this.adjustColor(agent.color, 20);
                    ctx.fillRect(-size / 2, -size, size, size / 2);
                }

            } else {
                // Draw Person
                const img = this.assetManager.getImage('person');
                if (img) {
                    const size = 16 * zoom;
                    ctx.drawImage(img, -size / 2, -size, size, size);
                } else {
                    const size = 4 * zoom;
                    ctx.fillStyle = agent.color;

                    // Head
                    ctx.beginPath();
                    ctx.arc(0, -size * 3, size, 0, Math.PI * 2);
                    ctx.fill();

                    // Body
                    ctx.fillRect(-size / 2, -size * 2, size, size * 2);
                }
            }

            ctx.restore();
        });
    }

    get tileWidth() { return this.baseTileWidth * this.camera.zoom; }
    get tileHeight() { return this.baseTileHeight * this.camera.zoom; }

    // Apply rotation to coordinates
    getRotatedCoords(x, y) {
        const w = this.grid.width;
        const h = this.grid.height;
        const r = this.camera.rotation;

        if (r === 0) return { x, y };
        if (r === 1) return { x: w - 1 - y, y: x };
        if (r === 2) return { x: w - 1 - x, y: h - 1 - y };
        if (r === 3) return { x: y, y: h - 1 - x };
        return { x, y };
    }

    gridToScreen(gx, gy) {
        // Apply rotation
        const r = this.camera.rotation;
        let rx = gx;
        let ry = gy;

        // We rotate the VIEW, so we transform the grid coordinates before projection
        // Actually, for visual rotation, we just project differently.
        // Let's rotate the grid coordinates relative to center

        const cx = (this.grid.width - 1) / 2;
        const cy = (this.grid.height - 1) / 2;

        let dx = gx - cx;
        let dy = gy - cy;

        // Rotate (dx, dy)
        for (let i = 0; i < r; i++) {
            const temp = dx;
            dx = -dy;
            dy = temp;
        }

        // Project
        // x = (dx - dy) * W
        // y = (dx + dy) * H

        const x = (dx - dy) * this.tileWidth;
        const y = (dx + dy) * this.tileHeight;

        return {
            x: x + this.camera.x,
            y: y + this.camera.y
        };
    }

    screenToGrid(sx, sy) {
        const adjX = sx - this.camera.x;
        const adjY = sy - this.camera.y;

        // Inverse projection
        const dy = (adjY / this.tileHeight - adjX / this.tileWidth) / 2;
        const dx = (adjY / this.tileHeight + adjX / this.tileWidth) / 2;

        // Inverse rotation
        const cx = (this.grid.width - 1) / 2;
        const cy = (this.grid.height - 1) / 2;

        let rx = dx;
        let ry = dy;

        const r = this.camera.rotation;
        for (let i = 0; i < r; i++) {
            const temp = rx;
            rx = ry;
            ry = -temp;
        }

        return {
            x: Math.round(rx + cx),
            y: Math.round(ry + cy)
        };
    }

    drawTile(x, y) {
        const pos = this.gridToScreen(x, y);
        const ctx = this.ctx;

        // Draw Ground
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x + this.tileWidth, pos.y + this.tileHeight);
        ctx.lineTo(pos.x, pos.y + this.tileHeight * 2);
        ctx.lineTo(pos.x - this.tileWidth, pos.y + this.tileHeight);
        ctx.closePath();

        const isRoad = this.grid.isRoad(x, y);

        if (isRoad) {
            ctx.fillStyle = '#555'; // Dark gray for road
        } else {
            ctx.fillStyle = (x + y) % 2 === 0 ? '#98FB98' : '#90EE90'; // Grass
        }

        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.stroke();

        // Road markings
        if (isRoad) {
            ctx.strokeStyle = '#FFF';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y + this.tileHeight);
            ctx.lineTo(pos.x, pos.y + this.tileHeight * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }

        // Draw Content
        const cell = this.grid.getCell(x, y);
        if (cell) {
            this.drawBuilding(ctx, pos.x, pos.y, cell);
        }
    }

    drawBuilding(ctx, x, y, building) {
        const img = this.assetManager.getImage(building.id);

        if (img) {
            // Draw Sprite with Scaling
            // We want the sprite to fit within the tile
            const targetWidth = this.tileWidth * 1.2;

            // Calculate scale to match target width
            const scale = targetWidth / img.width;

            const w = img.width * scale;
            const h = img.height * scale;

            // Anchor: 
            // The image likely has whitespace. We'll assume the building is centered.
            // We want the "feet" of the building to be at the tile center (x, y + tileHeight).
            // If the image is square with the building in the middle, the feet are roughly at h/2 + some offset.
            // Let's try centering the image on the tile center first, then adjusting up/down.

            // Tile Center:
            const cx = x;
            const cy = y + this.tileHeight;

            // Draw position (centered on tile center)
            const dx = cx - w / 2;
            const dy = cy - h / 2;

            // Adjust down because isometric sprites usually have "floor" lower than image center
            // and we want to hide the bottom whitespace.
            const yOffset = this.tileHeight * 0.5;

            ctx.save();

            // HACK: Use multiply to make white background transparent-ish
            // This will make the building take on the tint of the ground, but removes the white box.
            ctx.globalCompositeOperation = 'multiply';

            ctx.drawImage(img, dx, dy - yOffset, w, h);

            ctx.restore();

        } else {
            // Fallback Procedural
            let height = 40 * this.camera.zoom;
            if (building.id === 'residential_high') height = 80 * this.camera.zoom;
            if (building.id === 'park') height = 10 * this.camera.zoom;
            if (building.id === 'industrial') height = 50 * this.camera.zoom;

            ctx.fillStyle = building.color || '#FF6B6B';

            ctx.beginPath();
            ctx.moveTo(x, y - height);
            ctx.lineTo(x + this.tileWidth * 0.6, y + this.tileHeight * 0.6 - height);
            ctx.lineTo(x, y + this.tileHeight * 1.2 - height);
            ctx.lineTo(x - this.tileWidth * 0.6, y + this.tileHeight * 0.6 - height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Sides
            ctx.fillStyle = this.adjustColor(building.color, -20);
            ctx.beginPath();
            ctx.moveTo(x - this.tileWidth * 0.6, y + this.tileHeight * 0.6 - height);
            ctx.lineTo(x, y + this.tileHeight * 1.2 - height);
            ctx.lineTo(x, y + this.tileHeight * 1.2);
            ctx.lineTo(x - this.tileWidth * 0.6, y + this.tileHeight * 0.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = this.adjustColor(building.color, -40);
            ctx.beginPath();
            ctx.moveTo(x, y + this.tileHeight * 1.2 - height);
            ctx.lineTo(x + this.tileWidth * 0.6, y + this.tileHeight * 0.6 - height);
            ctx.lineTo(x + this.tileWidth * 0.6, y + this.tileHeight * 0.6);
            ctx.lineTo(x, y + this.tileHeight * 1.2);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    drawHoverCursor(x, y) {
        const pos = this.gridToScreen(x, y);
        const ctx = this.ctx;

        ctx.save();
        ctx.translate(pos.x, pos.y);

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.tileWidth, this.tileHeight);
        ctx.lineTo(0, this.tileHeight * 2);
        ctx.lineTo(-this.tileWidth, this.tileHeight);
        ctx.closePath();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    drawEffects() {
        this.ctx.save();
        this.ctx.font = `bold ${20 * this.camera.zoom}px Nunito`;
        this.ctx.textAlign = 'center';

        this.effects.forEach(effect => {
            if (effect.type === 'text') {
                this.ctx.fillStyle = effect.color;
                this.ctx.globalAlpha = Math.min(1.0, effect.life * 2);
                this.ctx.fillText(effect.text, effect.x, effect.y);
            }
        });

        this.ctx.restore();
    }

    adjustColor(color, amount) {
        if (color[0] !== '#') return color;

        let usePound = false;
        if (color[0] == "#") {
            color = color.slice(1);
            usePound = true;
        }

        let num = parseInt(color, 16);
        let r = (num >> 16) + amount;
        if (r > 255) r = 255;
        else if (r < 0) r = 0;

        let b = ((num >> 8) & 0x00FF) + amount;
        if (b > 255) b = 255;
        else if (b < 0) b = 0;

        let g = (num & 0x0000FF) + amount;
        if (g > 255) g = 255;
        else if (g < 0) g = 0;

        return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
    }
}
