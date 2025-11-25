class GameManager {
    constructor(grid, renderer) {
        this.grid = grid;
        this.renderer = renderer;
        this.cardManager = new CardManager();

        this.score = 0;
        this.turn = 1;

        // Input handling
        this.setupInput();

        // Initial Hand
        this.cardManager.drawHand();
    }

    setupInput() {
        // Listen for card selection
        window.addEventListener('card-selected', (e) => {
            this.cardManager.selectCard(e.detail.index);
        });

        this.renderer.canvas.addEventListener('mousemove', (e) => {
            const rect = this.renderer.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const gridPos = this.renderer.screenToGrid(x, y);

            if (this.grid.isValid(gridPos.x, gridPos.y)) {
                this.renderer.hoveredTile = gridPos;
                // Pass selected building to renderer for preview (ghost)
                this.renderer.previewBuilding = this.cardManager.getSelectedBuilding();
            } else {
                this.renderer.hoveredTile = null;
                this.renderer.previewBuilding = null;
            }
        });

        this.renderer.canvas.addEventListener('click', (e) => {
            if (this.renderer.hoveredTile && this.cardManager.getSelectedBuilding()) {
                this.placeBuilding(this.renderer.hoveredTile.x, this.renderer.hoveredTile.y);
            }
        });
    }

    placeBuilding(x, y) {
        if (this.grid.isOccupied(x, y)) return;

        const buildingDef = this.cardManager.getSelectedBuilding();
        if (!buildingDef) return;

        // Create building instance
        const building = {
            ...buildingDef,
            x: x,
            y: y
        };

        // Calculate Score
        const scoreDelta = this.calculateScore(building, x, y);
        this.score += scoreDelta;

        // Visual Feedback
        this.renderer.addFloatingText(x, y, `+${scoreDelta}`, '#FFD700'); // Gold color

        // Place
        this.grid.setCell(x, y, building);

        // Next Turn
        this.turn++;
        this.cardManager.removeSelectedCard(); // Refreshes hand
        this.updateUI();

        // Check Game Over
        if (this.checkGameOver()) {
            setTimeout(() => alert(`Игра окончена! Ваш счет: ${this.score}`), 100);
        }
    }

    checkGameOver() {
        for (let y = 0; y < this.grid.height; y++) {
            for (let x = 0; x < this.grid.width; x++) {
                if (!this.grid.isOccupied(x, y)) return false;
            }
        }
        return true;
    }

    calculateScore(building, x, y) {
        let points = building.baseScore;
        const neighbors = this.grid.getNeighbors(x, y); // Orthogonal neighbors

        neighbors.forEach(n => {
            const neighbor = n.content;
            if (!neighbor) return;

            // 1. Synergy (Does THIS building like the neighbor?)
            if (building.synergy) {
                // Check by specific ID
                if (building.synergy[neighbor.id]) points += building.synergy[neighbor.id];
                // Check by Type
                if (building.synergy[neighbor.type]) points += building.synergy[neighbor.type];
            }

            // 2. Anti-Synergy
            if (building.antiSynergy) {
                if (building.antiSynergy[neighbor.id]) points += building.antiSynergy[neighbor.id];
                if (building.antiSynergy[neighbor.type]) points += building.antiSynergy[neighbor.type];
            }

            // 3. Neighbor's reaction (Does the NEIGHBOR like this new building?)
            // Note: In some games, placing a building updates neighbors' scores. 
            // Here we just add to the total score immediately for simplicity.
            if (neighbor.synergy) {
                if (neighbor.synergy[building.id]) points += neighbor.synergy[building.id];
                if (neighbor.synergy[building.type]) points += neighbor.synergy[building.type];
            }
            if (neighbor.antiSynergy) {
                if (neighbor.antiSynergy[building.id]) points += neighbor.antiSynergy[building.id];
                if (neighbor.antiSynergy[building.type]) points += neighbor.antiSynergy[building.type];
            }
        });

        return points;
    }

    update(dt) {
        // Game logic updates
    }

    updateUI() {
        document.getElementById('score-display').textContent = this.score;
        document.getElementById('turn-display').textContent = this.turn;
    }
}
