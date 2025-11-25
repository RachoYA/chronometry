class TrafficSystem {
    constructor(grid) {
        this.grid = grid;
        this.agents = [];
        this.spawnTimer = 0;
    }

    update(dt) {
        // Spawn new agents occasionally
        this.spawnTimer += dt;
        if (this.spawnTimer > 2.0) {
            this.spawnAgent();
            this.spawnTimer = 0;
        }

        // Update agents
        for (let i = this.agents.length - 1; i >= 0; i--) {
            const agent = this.agents[i];
            this.updateAgent(agent, dt);

            // Remove if out of bounds or done
            if (agent.life <= 0) {
                this.agents.splice(i, 1);
            }
        }
    }

    spawnAgent() {
        // Find random road tile
        let attempts = 0;
        let rx, ry;
        do {
            rx = Math.floor(Math.random() * this.grid.width);
            ry = Math.floor(Math.random() * this.grid.height);
            attempts++;
        } while (!this.grid.isRoad(rx, ry) && attempts < 100);

        if (!this.grid.isRoad(rx, ry)) return;

        const isCar = Math.random() > 0.3;
        this.agents.push({
            type: isCar ? 'car' : 'person',
            x: rx,
            y: ry,
            targetX: rx, // Start stationary, will pick target next update
            targetY: ry,
            speed: isCar ? 2.0 : 0.8,
            color: isCar ? '#FF4500' : '#FFFF00',
            life: 30.0,
            isMoving: false
        });
    }

    updateAgent(agent, dt) {
        agent.life -= dt;

        if (!agent.isMoving) {
            // Pick a neighbor road tile
            const neighbors = [
                { x: agent.x + 1, y: agent.y },
                { x: agent.x - 1, y: agent.y },
                { x: agent.x, y: agent.y + 1 },
                { x: agent.x, y: agent.y - 1 }
            ];

            const validMoves = neighbors.filter(n => this.grid.isRoad(n.x, n.y));

            if (validMoves.length > 0) {
                const move = validMoves[Math.floor(Math.random() * validMoves.length)];
                agent.targetX = move.x;
                agent.targetY = move.y;
                agent.isMoving = true;
            }
        } else {
            // Move towards target
            const dx = agent.targetX - agent.x;
            const dy = agent.targetY - agent.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 0.05) {
                agent.x += (dx / dist) * agent.speed * dt;
                agent.y += (dy / dist) * agent.speed * dt;
            } else {
                agent.x = agent.targetX;
                agent.y = agent.targetY;
                agent.isMoving = false;
            }
        }
    }
}
