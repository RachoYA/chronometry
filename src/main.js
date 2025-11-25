// Imports removed for non-module support

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');

    // Initialize Core Systems
    const grid = new Grid(8, 8); // 8x8 map
    const assetManager = new AssetManager();
    const trafficSystem = new TrafficSystem(grid);
    const renderer = new Renderer(canvas, grid, assetManager, trafficSystem);
    const gameManager = new GameManager(grid, renderer);

    // Assets Config
    const assets = {
        'residential_small': 'src/assets/residential_small.png',
        'residential_mid': 'src/assets/residential_mid.png',
        'residential_high': 'src/assets/residential_high.png',
        'commercial_shop': 'src/assets/commercial_shop.png',
        'commercial_cafe': 'src/assets/commercial_cafe.png',
        'industrial_factory': 'src/assets/industrial_factory.png',
        'nature_park': 'src/assets/nature_park.png',
        'car_blue': 'src/assets/car_blue.png',
        'car_taxi': 'src/assets/car_taxi.png',
        'car_van': 'src/assets/car_van.png',
        'person': 'src/assets/person.jpg'
    };

    // Load and Start
    assetManager.loadAssets(assets, () => {
        console.log('Assets loaded!');

        // Initialize Game Loop
        const gameLoop = new GameLoop((dt) => {
            gameManager.update(dt);
            trafficSystem.update(dt);
            renderer.update(dt);
        }, (ctx) => {
            renderer.draw(ctx);
        });

        // Start
        gameLoop.start();

        // Expose for UI
        window.rotateCamera = () => renderer.rotate();
    });

    // Handle Resize
    window.addEventListener('resize', () => {
        renderer.resize();
    });
    renderer.resize(); // Initial resize
});
