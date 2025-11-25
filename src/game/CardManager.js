class CardManager {
    constructor() {
        this.hand = [];
        this.selectedCardIndex = -1;
    }

    drawHand() {
        this.hand = [];
        for (let i = 0; i < 3; i++) {
            this.hand.push(this.getRandomBuildingId());
        }
        this.selectedCardIndex = -1;
        this.renderHandUI();
    }

    getRandomBuildingId() {
        const totalWeight = DECK_CONFIG.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (const item of DECK_CONFIG) {
            random -= item.weight;
            if (random <= 0) {
                return item.id;
            }
        }
        return DECK_CONFIG[0].id; // Fallback
    }

    selectCard(index) {
        if (index < 0 || index >= this.hand.length) return;
        this.selectedCardIndex = index;
        this.renderHandUI();
    }

    getSelectedBuilding() {
        if (this.selectedCardIndex === -1) return null;
        const id = this.hand[this.selectedCardIndex];
        return BUILDING_TYPES[id];
    }

    removeSelectedCard() {
        if (this.selectedCardIndex !== -1) {
            // Remove used card and draw a new one to replace it immediately?
            // Or just empty the slot? 
            // Game design: usually you pick 1 of 3, then get a fresh hand of 3?
            // Let's go with: Pick 1, place it, then refresh WHOLE hand.
            this.drawHand();
        }
    }

    renderHandUI() {
        const container = document.getElementById('hand-container');
        container.innerHTML = '';

        this.hand.forEach((buildingId, index) => {
            const building = BUILDING_TYPES[buildingId];
            const card = document.createElement('div');
            card.className = `card ${index === this.selectedCardIndex ? 'selected' : ''}`;
            card.onclick = () => this.selectCard(index);
            // Card Visuals
            const cardInner = document.createElement('div');
            cardInner.className = 'card-inner';

            // Image
            const img = document.createElement('img');
            // Map building ID to asset path (simple mapping)
            // In a real app, we'd use AssetManager or a config
            // Here we reconstruct the path or use a lookup
            const assetName = building.id;
            // We need the path. Let's just use the same paths as main.js
            // Or better, ask AssetManager? But CardManager doesn't have it.
            // Let's just hardcode the path prefix for now.
            img.src = `src/assets/${assetName}.png`;
            img.style.width = '80%';
            img.style.height = 'auto';
            img.style.marginBottom = '10px';

            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = building.name;

            const score = document.createElement('div');
            score.className = 'card-score';
            score.textContent = `Очки: ${building.baseScore}`;

            cardInner.appendChild(img);
            cardInner.appendChild(title);
            cardInner.appendChild(score);

            card.appendChild(cardInner);

            container.appendChild(card);
        });
    }
}
