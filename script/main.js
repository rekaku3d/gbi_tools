import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DragControls } from 'three/addons/controls/DragControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// --- Constants ---
const LOADS = {
    fan: 0.1, // kW
    tv: 0.2, // kW
    ac: 1.5, // kW
    waterHeater: 4.5 // kW
};
// 1 battery = 1 kWh storage capacity
// Each solar panel = 0.4 kW (400 watts) generation capacity

// --- 3D Scene Variables ---
let scene, camera, renderer, controls;
let house;
let solarPanelGroup, batteryGroup;
let dragControls;
const draggableObjects = []; // Will hold the house

// --- GLTF Loader ---
const gltfLoader = new GLTFLoader();

// --- UI Elements ---
let solarInput, batteryInput, fanCheck, tvCheck, acCheck, waterHeater, resultDisplay, starRatingDisplay, toggleBtn, controlsPanel;
let hoursFan, hoursTv, hoursAc, hoursWaterHeater;

// --- Factory function for Solar Panel ---
function createSolarPanel() {
    const panelGeometry = new THREE.BoxGeometry(0.8, 0.05, 1.2);
    const panelMaterial = new THREE.MeshStandardMaterial({
        color: 0x222288,
        roughness: 0.2,
        metalness: 0.1
    });
    return new THREE.Mesh(panelGeometry, panelMaterial);
}

// --- Factory function for Battery ---
function createBattery() {
    const batteryGeometry = new THREE.BoxGeometry(0.5, 0.8, 0.4);
    const batteryMaterial = new THREE.MeshStandardMaterial({
        color: 0x666666, // Dark gray
        roughness: 0.8,
    });
    return new THREE.Mesh(batteryGeometry, batteryMaterial);
}

// --- Function to update 3D assets based on config ---
function update3DAssets(solarCount, batteryCount) {
    // Clear existing assets
    while (solarPanelGroup.children.length) {
        solarPanelGroup.remove(solarPanelGroup.children[0]);
    }
    while (batteryGroup.children.length) {
        batteryGroup.remove(batteryGroup.children[0]);
    }

    // Add new solar panels (in a grid on the roof)
    const panelsPerRow = 12;
    const xSpacing = 0.9;
    const zSpacing = 1.3; // Spacing between rows of panels

    // Calculate the number of rows that will be needed
    const numRows = Math.ceil(solarCount / panelsPerRow);

    // Centering offset so the entire grid is centered
    const xOffset = -((Math.min(solarCount, panelsPerRow) - 1) * xSpacing) / 2;
    const zOffset = -((numRows - 1) * zSpacing) / 2;

    for (let i = 0; i < solarCount; i++) {
        const panel = createSolarPanel();
        const col = i % panelsPerRow;
        const row = Math.floor(i / panelsPerRow);
        panel.position.x = col * xSpacing + xOffset;
        panel.position.z = row * zSpacing + zOffset;
        panel.position.y = 0; // On the roof (relative to solarPanelGroup)
        solarPanelGroup.add(panel);
    }

    // Add new batteries (in a 20x20 grid beside the house)
    const batteriesPerRow = 5;
    for (let i = 0; i < batteryCount; i++) {
        const battery = createBattery();
        battery.position.x = (i % batteriesPerRow) * 0.6; // Grid arrangement
        battery.position.z = Math.floor(i / batteriesPerRow) * 0.5; // Grid arrangement
        battery.position.y = 0; // On the ground
        batteryGroup.add(battery);
    }
}

// --- Main Calculation and UI Update Function ---
function updateSimulation() {
    // 1. Get inputs
    const solarCount = parseInt(solarInput.value) || 0;
    const batteryCount = parseInt(batteryInput.value) || 0;

    let dailyEnergyDemand = 0;
    if (fanCheck.checked) dailyEnergyDemand += LOADS.fan * (parseFloat(hoursFan.value) || 0);
    if (tvCheck.checked) dailyEnergyDemand += LOADS.tv * (parseFloat(hoursTv.value) || 0);
    if (acCheck.checked) dailyEnergyDemand += LOADS.ac * (parseFloat(hoursAc.value) || 0);
    if (waterHeater.checked) dailyEnergyDemand += LOADS.waterHeater * (parseFloat(hoursWaterHeater.value) || 0);

    // Calculate total daily solar generation (in kWh), assuming 4 peak sun hours 
    // Formula: Energy Generated (kWh) = Number of Panels × Panel Power (kW) × Peak Sun Hours
    const dailySolarGeneration = solarCount * 0.4 * 4; // (panels * kW/panel * peak sun hours) 

    // Calculate net energy demand per day (demand minus generation)
    let netDailyDemand = dailyEnergyDemand - dailySolarGeneration;

    // 2. Run calculation
    // Update battery storage: 1 battery = 1 kWh
    const totalStorage = batteryCount * 1; // Each battery is 1 kWh
    let hours = 0;
    let resultText = "";
    let stars = "";

    if (dailyEnergyDemand === 0) {
        resultText = "No loads selected.";
        stars = "---";
    } else if (netDailyDemand < 0) {
        // System has a surplus. Calculate time to charge the battery.
        const surplusKwhPerDay = -netDailyDemand;  //Formula: Energy (kWh) = Power (kW) × Time (hours)
        // Avoid division by zero if surplus is negligible
        if (surplusKwhPerDay > 0.01) {
            const daysToCharge = totalStorage / surplusKwhPerDay;
            hours = daysToCharge * 24;
            resultText = `~${hours.toFixed(0)} hrs to fully charge`;
        } else {
            resultText = "System is balanced";
        }
        stars = "⭐⭐⭐⭐⭐"; // 5 stars for any energy-positive system
    } else {
        // System has a deficit. Calculate total runtime hours from battery.
        const hoursPerDayOfUse = dailyEnergyDemand / netDailyDemand;
        hours = (totalStorage / dailyEnergyDemand) * 24;

        if (hours < 1) {
            resultText = "Runtime < 1 hour";
            stars = "---";
        } else {
            resultText = `${hours.toFixed(1)} hours of runtime`;

            // Determine star rating based on total hours of autonomy
            if (hours >= 48) { // 2+ days
                stars = "⭐⭐⭐⭐⭐";
            } else if (hours >= 24) { // 1+ day
                stars = "⭐⭐⭐⭐";
            } else if (hours >= 12) { // Half a day
                stars = "⭐⭐⭐";
            } else if (hours >= 8) { // A workday
                stars = "⭐⭐";
            } else if (hours >= 4) { // A few hours
                stars = "⭐";
            } else {
                stars = "No Rating";
            }
        }
    }

    // 3. Update UI
    resultDisplay.textContent = resultText;
    starRatingDisplay.textContent = stars;
    if (stars.includes("---") || stars.includes("No Rating")) {
        starRatingDisplay.classList.add("text-gray-500");
        starRatingDisplay.classList.remove("text-yellow-500");
    } else {
        starRatingDisplay.classList.remove("text-gray-500");
        starRatingDisplay.classList.add("text-yellow-500");
    }


    // 4. Update 3D Scene
    update3DAssets(solarCount, batteryCount);
}

// --- Initialization Function ---
function init() {
    const container = document.getElementById('scene-container');

    // 1. Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 6, 0);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialiased: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);

    // 5. Create 3D Models
    const standardMaterial = (color) => new THREE.MeshStandardMaterial({
        color: color,
        transparent: true
    });

    // Ground Plane
    const groundGeometry = new THREE.PlaneGeometry(40, 40);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xdddddd, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2; // Rotate to be flat
    ground.position.y = -1.25;
    scene.add(ground);
    ground.material.color.set(0x0B6E4F);


    // 6. Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    //dragControls = new DragControls(draggableObjects, camera, renderer.domElement);
    //dragControls.addEventListener('dragstart', (e) => {
    //    controls.enabled = false;
    //    e.object.material.opacity = 0.5;
    //});
    //dragControls.addEventListener('dragend', (e) => {
    //    controls.enabled = true;
    //    if (e.object.material) e.object.material.opacity = 1;
    //});

    // 7. Get UI Elements
    solarInput = document.getElementById('solar-input');
    batteryInput = document.getElementById('battery-input');
    fanCheck = document.getElementById('check-fan');
    tvCheck = document.getElementById('check-tv');
    acCheck = document.getElementById('check-ac');
    waterHeater = document.getElementById('check-water-heater');
    hoursFan = document.getElementById('hours-fan');
    hoursTv = document.getElementById('hours-tv');
    hoursAc = document.getElementById('hours-ac');
    hoursWaterHeater = document.getElementById('hours-water-heater');
    resultDisplay = document.getElementById('result-display');
    starRatingDisplay = document.getElementById('star-rating-display');
    toggleBtn = document.getElementById('toggle-controls-btn');
    controlsPanel = document.getElementById('controls');

    // 8. Add Event Listeners
    solarInput.addEventListener('input', updateSimulation);
    batteryInput.addEventListener('input', updateSimulation);
    fanCheck.addEventListener('change', updateSimulation);
    tvCheck.addEventListener('change', updateSimulation);
    acCheck.addEventListener('change', updateSimulation);
    waterHeater.addEventListener('change', updateSimulation);
    hoursFan.addEventListener('input', updateSimulation);
    hoursTv.addEventListener('input', updateSimulation);
    hoursAc.addEventListener('input', updateSimulation);
    hoursWaterHeater.addEventListener('input', updateSimulation);
    window.addEventListener('resize', onWindowResize);
    toggleBtn.addEventListener('click', () => {
        controlsPanel.classList.toggle('visible');
    });

    // 9. Load House Model and then finish setup model path 'models/building_sample.glb'
    gltfLoader.load('models/building_sample.glb', (gltf) => {
        house = gltf.scene;
        house.position.y = -0.01; // Adjust to sit on the ground plane
        scene.add(house);
        draggableObjects.push(house); // Make the entire loaded model draggable

        // --- Auto-fit camera to the loaded model ---
        const box = new THREE.Box3().setFromObject(house);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());

        // Get the maximum dimension of the model
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = camera.fov * (Math.PI / 180);
        let cameraZ = Math.abs(maxDim / 0.6 / Math.tan(fov / 2));

        // Apply a minimum distance to prevent being too close to small models
        cameraZ = Math.max(cameraZ, 10);

        camera.position.set(center.x, center.y + cameraZ / 2, center.z + cameraZ);
        controls.target.copy(center);
        controls.update();

        // Create groups for assets
        solarPanelGroup = new THREE.Group();
        batteryGroup = new THREE.Group();

        // Position groups relative to the house
        // Solar panels go on the roof
        solarPanelGroup.position.x = 0;
        solarPanelGroup.position.y = 13.8; // Adjust Y position for the new model's roof
        //solarPanelGroup.position.z = 4;
        solarPanelGroup.rotation.x = -Math.PI / 8; // Slight angle
        house.add(solarPanelGroup); // Add to house so they move together

        // Batteries go beside the house
        batteryGroup.position.x = 10.5; // To the side
        batteryGroup.position.y = -0.81; // Adjust Y to be on the ground relative to the house
        batteryGroup.position.z = -2; // Adjust axis, z front -back
        house.add(batteryGroup); // Add to house so they move together

        // 10. Initial Run
        updateSimulation(); // Run once to set initial 3D state and calculation
        animate(); // Start the animation loop only after the model is loaded

    }, undefined, (error) => {
        console.error('An error happened while loading the building model:', error);
        // Fallback or error message here if needed
    });
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// --- Handle Window Resize ---
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Run Everything ---
init();