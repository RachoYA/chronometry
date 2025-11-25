class Grid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.cells = new Array(width * height).fill(null);
        this.roads = new Array(width * height).fill(false);

        // Initialize basic road network (Perimeter + Cross)
        for (let x = 0; x < width; x++) {
            for (let y = 0; y < height; y++) {
                if (x === 0 || x === width - 1 || y === 0 || y === height - 1 ||
                    x === Math.floor(width / 2) || y === Math.floor(height / 2)) {
                    this.roads[y * width + x] = true;
                }
            }
        }
    }

    isRoad(x, y) {
        if (!this.isValid(x, y)) return false;
        return this.roads[y * this.width + x];
    }

    getIndex(x, y) {
        return y * this.width + x;
    }

    isValid(x, y) {
        return x >= 0 && x < this.width && y >= 0 && y < this.height;
    }

    getCell(x, y) {
        if (!this.isValid(x, y)) return null;
        return this.cells[this.getIndex(x, y)];
    }

    setCell(x, y, content) {
        if (!this.isValid(x, y)) return false;
        this.cells[this.getIndex(x, y)] = content;
        return true;
    }

    isOccupied(x, y) {
        return this.getCell(x, y) !== null;
    }

    // Get neighbors (orthogonal)
    getNeighbors(x, y) {
        const neighbors = [];
        const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];

        for (const [dx, dy] of dirs) {
            const nx = x + dx;
            const ny = y + dy;
            if (this.isValid(nx, ny)) {
                neighbors.push({ x: nx, y: ny, content: this.getCell(nx, ny) });
            }
        }
        return neighbors;
    }

    // Get neighbors (including diagonals)
    getNeighbors8(x, y) {
        const neighbors = [];
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (this.isValid(nx, ny)) {
                    neighbors.push({ x: nx, y: ny, content: this.getCell(nx, ny) });
                }
            }
        }
        return neighbors;
    }
}
