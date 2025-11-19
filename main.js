
class LaserGame {
    constructor() {
        // Core components
        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-window.innerWidth/2, window.innerWidth/2, window.innerHeight/2, -window.innerHeight/2, 1, 1000);
        this.camera.position.z = 100;
        this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gameCanvas'), alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

        // Game state
        this.score = 0;
        this.gameStarted = false;
        this.enemies = [];
        this.lasers = [];
        this.particles = [];
        this.lastEnemySpawn = 0;
        this.lastLaserTime = 0;
        this.enemySpawnInterval = 1500;
        
        // Face tracking
        this.faceMesh = null;
        this.detectionEnabled = false;
        this.leftEye = { x: 0.45, y: 0.5 };
        this.rightEye = { x: 0.55, y: 0.5 };
        this.gaze = { x: 0.5, y: 0.5 };
        this.smoothGaze = { x: 0.5, y: 0.5 };
        this.faceCenter = { x: 0.5, y: 0.5 };
        this.currentFaceCenter = { x: 0.5, y: 0.5 };
        this.isCalibrated = false;
        this.laserTip = null;
        
        // Sprite assets
        this.ghostTexture = null;
        this.kittenTexture = null;
        this.textureLoader = new THREE.TextureLoader();
        
        // Kittens on forehead
        this.kittens = [];
        this.kittenPositions = [
            { x: -0.08, y: -0.15 }, // Left kitten
            { x: 0, y: -0.15 },     // Center kitten
            { x: 0.08, y: -0.15 }   // Right kitten
        ];
        this.gameOver = false;

        this.isPortrait = window.innerHeight > window.innerWidth;
        window.addEventListener('resize', () => {
            this.isPortrait = window.innerHeight > window.innerWidth;
        });

        this.init();
    }
    
    async init() {
        await this.setupMediaPipe();
        await this.loadSprites();
        this.setupShaders();
        await this.setupVideo(); // Wait for video
        this.setupEventListeners();
        this.createLaserTip();
        this.animate();

        this.waitUntilReady(); // ⬅️ New method call
    }

    waitUntilReady() {
        const startBtn = document.getElementById('startButton');
        startBtn.disabled = true;
        startBtn.textContent = "⏳ Loading...";

        const checkReady = setInterval(() => {
            if (this.isReadyToStart()) {
                startBtn.disabled = false;
                startBtn.textContent = "📡 Go 🐈";
                clearInterval(checkReady);
            }
        }, 500);
    }

    isReadyToStart() {
        return this.video && this.video.readyState >= 2;
    }

    createKittens() {
        this.kittenPositions.forEach((pos, index) => {
            const kitten = new THREE.Mesh(
                new THREE.PlaneGeometry(100, 100),
                new THREE.MeshBasicMaterial({ 
                    map: this.kittenTexture, 
                    transparent: true, 
                    alphaTest: 0.1 
                })
            );
            
            kitten.position.z = 51; // In front of other elements
            kitten.userData = { 
                index: index,
                alive: true,
                relativePosition: pos
            };
            
            this.scene.add(kitten);
            this.kittens.push(kitten);
        });
    }
    
    updateKittenPositions() {
        if (!this.isCalibrated || this.kittens.length === 0 || !this.currentFaceCenter) return;
        
        // Get face center position in screen coordinates
        const faceCenterX = (1 - this.currentFaceCenter.x) * window.innerWidth; // Mirror for selfie view
        const faceCenterY = this.currentFaceCenter.y * window.innerHeight;
        
        this.kittens.forEach((kitten, index) => {
            if (kitten.userData.alive) {
                const relPos = kitten.userData.relativePosition;
                
                // Position relative to face center (forehead area)
                const kittenX = (faceCenterX + relPos.x * window.innerWidth - window.innerWidth/2);
                const kittenY = -(faceCenterY + relPos.y * window.innerHeight - window.innerHeight/2);
                
                kitten.position.x = kittenX;
                kitten.position.y = kittenY;
            }
        });
    }
    
    async loadSprites() {
        const loadPromises = [
            // Load ghost texture
            new Promise((resolve) => {
                this.textureLoader.load(
                    'assets/sasuke2.png',
                    (texture) => {
                        this.ghostTexture = texture;
                        this.ghostTexture.magFilter = THREE.NearestFilter;
                        this.ghostTexture.minFilter = THREE.NearestFilter;
                        resolve();
                    },
                    undefined,
                    () => {
                        console.warn('Could not load ghost.png, using fallback texture');
                        this.createFallbackGhostTexture();
                        resolve();
                    }
                );
            }),
            // Load kitten texture
            new Promise((resolve) => {
                this.textureLoader.load(
                    'assets/kitten.png',
                    (texture) => {
                        this.kittenTexture = texture;
                        this.kittenTexture.magFilter = THREE.NearestFilter;
                        this.kittenTexture.minFilter = THREE.NearestFilter;
                        resolve();
                    },
                    undefined,
                    () => {
                        console.warn('Could not load kitten.png, using fallback texture');
                        this.createFallbackKittenTexture();
                        resolve();
                    }
                );
            })
        ];
        
        return Promise.all(loadPromises);
    }
    
    createFallbackKittenTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create a simple kitten sprite
        // Body
        ctx.fillStyle = '#ffaa66';
        ctx.fillRect(16, 32, 32, 24);
        
        // Head
        ctx.beginPath();
        ctx.arc(32, 24, 16, 0, Math.PI * 2);
        ctx.fill();
        
        // Ears
        ctx.beginPath();
        ctx.moveTo(20, 16);
        ctx.lineTo(26, 6);
        ctx.lineTo(32, 16);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(32, 16);
        ctx.lineTo(38, 6);
        ctx.lineTo(44, 16);
        ctx.closePath();
        ctx.fill();
        
        // Inner ears
        ctx.fillStyle = '#ff8844';
        ctx.beginPath();
        ctx.moveTo(22, 14);
        ctx.lineTo(26, 8);
        ctx.lineTo(30, 14);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(34, 14);
        ctx.lineTo(38, 8);
        ctx.lineTo(42, 14);
        ctx.closePath();
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(26, 22, 2, 0, Math.PI * 2);
        ctx.arc(38, 22, 2, 0, Math.PI * 2);
        ctx.fill();
        
        // Nose
        ctx.fillStyle = '#ff6699';
        ctx.beginPath();
        ctx.arc(32, 26, 1, 0, Math.PI * 2);
        ctx.fill();
        
        // Stripes
        ctx.fillStyle = '#dd8833';
        ctx.fillRect(20, 18, 24, 2);
        ctx.fillRect(18, 32, 28, 2);
        ctx.fillRect(18, 40, 28, 2);
        ctx.fillRect(18, 48, 28, 2);
        
        this.kittenTexture = new THREE.CanvasTexture(canvas);
        this.kittenTexture.magFilter = THREE.NearestFilter;
        this.kittenTexture.minFilter = THREE.NearestFilter;
    }

    createFallbackGhostTexture(){
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create a simple ghost sprite
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(32, 28, 24, 0, Math.PI * 2);
        ctx.fill();
        
        // Ghost body
        ctx.fillRect(8, 28, 48, 28);
        
        // Ghost bottom wavy part
        ctx.beginPath();
        ctx.moveTo(8, 56);
        ctx.lineTo(16, 48);
        ctx.lineTo(24, 56);
        ctx.lineTo(32, 48);
        ctx.lineTo(40, 56);
        ctx.lineTo(48, 48);
        ctx.lineTo(56, 56);
        ctx.lineTo(56, 64);
        ctx.lineTo(8, 64);
        ctx.closePath();
        ctx.fill();
        
        // Eyes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(24, 24, 4, 0, Math.PI * 2);
        ctx.arc(40, 24, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Mouth
        ctx.beginPath();
        ctx.arc(32, 36, 3, 0, Math.PI);
        ctx.fill();
        
        this.ghostTexture = new THREE.CanvasTexture(canvas);
        this.ghostTexture.magFilter = THREE.NearestFilter;
        this.ghostTexture.minFilter = THREE.NearestFilter;
    }
    
    async setupMediaPipe() {
        try {
            if (typeof window.FaceMesh !== 'undefined') {
                this.faceMesh = new window.FaceMesh({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/${file}`
                });
                this.faceMesh.setOptions({ maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
                this.faceMesh.onResults(results => {
                    if (results.multiFaceLandmarks?.[0]) this.updateGaze(results.multiFaceLandmarks[0]);
                });
                this.detectionEnabled = true;
            } else {
                this.setupMouseFallback();
            }
        } catch (error) {
            this.setupMouseFallback();
        }
    }
    
    setupMouseFallback() {
        this.detectionEnabled = false;
        this.isCalibrated = true;
        document.addEventListener('mousemove', e => {
            this.gaze.x = e.clientX / window.innerWidth;
            this.gaze.y = e.clientY / window.innerHeight;
            this.leftEye.x = this.gaze.x - 0.05;
            this.rightEye.x = this.gaze.x + 0.05;
            this.leftEye.y = this.rightEye.y = this.gaze.y;
            // Update current face center for mouse mode
            this.currentFaceCenter.x = this.gaze.x;
            this.currentFaceCenter.y = this.gaze.y;
        });
    }
    
    updateGaze(landmarks) {
        const leftEyeCenter = landmarks[468] || landmarks[33];
        const rightEyeCenter = landmarks[473] || landmarks[362];
        if (!leftEyeCenter || !rightEyeCenter) return;
        
        const currentCenter = { x: (leftEyeCenter.x + rightEyeCenter.x) / 2, y: (leftEyeCenter.y + rightEyeCenter.y) / 2 };
        
        // Store calibrated center position for gaze calculation
        if (!this.isCalibrated) {
            this.faceCenter = { ...currentCenter };
            this.isCalibrated = true;
        }
        
        // Store current face position for kitten tracking (separate from calibrated center)
        this.currentFaceCenter = { ...currentCenter };
        
        // Calculate gaze direction based on head movement from calibrated center
        let deltaX, deltaY;
        if (this.isPortrait) {
            deltaX = (currentCenter.x - this.faceCenter.x) / 0.06;
            deltaY = (currentCenter.y - this.faceCenter.y) / 0.08;
        } else {
            deltaX = (currentCenter.x - this.faceCenter.x) / 0.08;
            deltaY = (currentCenter.y - this.faceCenter.y) / 0.05;
        }

        this.gaze.x = Math.max(0, Math.min(1, 0.5 - deltaX));
        this.gaze.y = Math.max(0, Math.min(1, 0.5 + deltaY));
        
        this.smoothGaze.x += (this.gaze.x - this.smoothGaze.x) * 0.15;
        this.smoothGaze.y += (this.gaze.y - this.smoothGaze.y) * 0.15;
        
        this.leftEye.x = 1 - leftEyeCenter.x;
        this.leftEye.y = leftEyeCenter.y;
        this.rightEye.x = 1 - rightEyeCenter.x;
        this.rightEye.y = rightEyeCenter.y;
        
        this.updateEyeUI();
    }
    
    updateEyeUI() {
        document.getElementById('leftEye').style.left = this.leftEye.x * window.innerWidth + 'px';
        document.getElementById('rightEye').style.left = this.rightEye.x * window.innerWidth + 'px';
        
        const videoRect = document.getElementById('videoElement').getBoundingClientRect();
        document.getElementById('leftEye').style.top = (videoRect.top + this.leftEye.y * videoRect.height) + 'px';
        document.getElementById('rightEye').style.top = (videoRect.top + this.rightEye.y * videoRect.height) + 'px';

        // Update laser tip position
        if (this.laserTip) {
            const targetX = (this.smoothGaze.x - 0.5) * window.innerWidth;
            const targetY = -(this.smoothGaze.y - 0.5) * window.innerHeight;
            this.laserTip.position.x = targetX;
            this.laserTip.position.y = targetY;
        }
    }
    
    setupShaders() {
        this.laserMaterial = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, intensity: { value: 1 }, color: { value: new THREE.Color(0.1, 0.1, 1.0) } },
            vertexShader: `
                varying vec2 vUv;
                uniform float time;
                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    pos.x += sin(time * 20.0 + position.y * 0.1) * 1.8 * (1.0 - abs(uv.y - 0.5) * 2.0);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }`,
            fragmentShader: `
                uniform float time, intensity;
                uniform vec3 color;
                varying vec2 vUv;
                void main() {
                    float centerDist = abs(vUv.y - 0.5) * 2.0;
                    float beam = 1.0 - smoothstep(0.0, 0.4, centerDist);
                    float core = 1.0 - smoothstep(0.0, 0.15, centerDist);
                    float pulse = sin(time * 25.0) * 0.3 + 0.7;
                    vec3 finalColor = color * (beam * 2.0 + core * 6.0) * pulse * intensity;
                    gl_FragColor = vec4(finalColor, (beam * 2.5 + core * 2.0) * intensity * pulse);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        // Swirling laser tip effect
        this.laserTipMaterial = new THREE.ShaderMaterial({
            uniforms: { 
                time: { value: 0 },
                intensity: { value: 1 }
            },
            vertexShader: `
                varying vec2 vUv;
                uniform float time;
                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    float swirl = sin(time * 8.0) * 0.8;
                    pos.x += cos(time * 10.0 + pos.y * 0.5) * swirl;
                    pos.y += sin(time * 12.0 + pos.x * 0.5) * swirl;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }`,
            fragmentShader: `
                uniform float time, intensity;
                varying vec2 vUv;
                void main() {
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    float angle = atan(center.y, center.x);
                    
                    // Swirling pattern
                    float swirl = sin(angle * 6.0 + time * 15.0 + dist * 20.0) * 0.5 + 0.5;
                    float spiral = sin(angle * 3.0 - time * 8.0 + dist * 15.0) * 0.5 + 0.5;
                    
                    // Energy core
                    float core = 1.0 - smoothstep(0.0, 0.2, dist);
                    float ring = smoothstep(0.2, 0.6, dist) - smoothstep(0.3, 0.6, dist);
                    
                    // Pulsing energy
                    float pulse = sin(time * 20.0) * 0.8 + 1.7;
                    
                    // Color mixing
                    vec3 color1 = vec3(1.0, 0.2, 0.2); // Red core
                    vec3 color2 = vec3(1.0, 0.8, 0.2); // Yellow swirl
                    vec3 color3 = vec3(0.2, 0.8, 1.0); // Blue outer
                    
                    vec3 finalColor = mix(color1, color2, swirl) * core;
                    finalColor += mix(color2, color3, spiral) * ring;
                    finalColor *= pulse * intensity * 2.0;
                    
                    float alpha = (core + ring * 1.2) * pulse * intensity;
                    
                    gl_FragColor = vec4(finalColor, alpha);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        
        this.particleMaterial = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, size: { value: 20 } },
            vertexShader: `
                uniform float time, size;
                attribute float life, sparkIndex;
                attribute vec3 velocity;
                varying float vLife, vIndex;
                void main() {
                    vLife = life; vIndex = sparkIndex;
                    float lifeProgress = 1.0 - life;
                    vec3 pos = position + velocity * lifeProgress * 2.0;
                    pos.y -= lifeProgress * lifeProgress * 60.0;
                    gl_PointSize = size * life * (0.8 + sin(time * 25.0 + sparkIndex * 10.0) * 0.8);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }`,
            fragmentShader: `
                uniform float time;
                varying float vLife, vIndex;
                void main() {
                    vec2 center = gl_PointCoord - vec2(0.5);
                    if (length(center) > 0.5) discard;
                    float alpha = (1.0 - length(center) * 1.5) * vLife * (0.9 + sin(time * 40.0 + vIndex * 15.0) * 0.3) * 1.8;
                    vec3 color = mix(vec3(1.0), vec3(1.0, 0.3, 0.1), 1.0 - vLife) * 1.5;
                    gl_FragColor = vec4(color, alpha);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
    }
    
    createLaserTip() {
        const tipGeometry = new THREE.CircleGeometry(80, 32);
        this.laserTip = new THREE.Mesh(tipGeometry, this.laserTipMaterial);
        this.laserTip.position.z = 50;
        this.laserTip.visible = false;
        this.scene.add(this.laserTip);
    }
    
    async setupVideo() {
        const video = document.getElementById('videoElement');
        try {
            video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });

            this.video = video;

            // Wait for video to become ready
            video.onloadeddata = () => {
                if (this.detectionEnabled && this.faceMesh) {
                    this.startFaceDetection(); // Begin tracking as soon as video is ready
                }
            };
        } catch (error) {
            alert('Camera access required to play.');
        }
    }

    setupEventListeners() {
        document.getElementById('startButton').addEventListener('click', () => {
            if (!this.isReadyToStart()) {
                alert("Please wait for the camera and face tracking to fully load.");
                return;
            }
            this.startGame();
        });        
        document.addEventListener('keydown', e => { if (e.key.toLowerCase() === 'c') this.recalibrate(); });
        window.addEventListener('resize', () => {
            this.camera.left = -window.innerWidth / 2; this.camera.right = window.innerWidth / 2;
            this.camera.top = window.innerHeight / 2; this.camera.bottom = -window.innerHeight / 2;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }
    
    recalibrate() {
        this.isCalibrated = false;
    }
    
    startGame() {
        document.getElementById('start-overlay').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('leftEye').style.display = 'block';
        document.getElementById('rightEye').style.display = 'block';
        this.laserTip.visible = true;
        this.gameStarted = true;
        this.gameOver = false;
        this.score = 0;
        this.lastEnemySpawn = Date.now();
        this.enemySpawnInterval = 1500;
        
        // Clear previous game state
        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.lasers.forEach(laser => this.scene.remove(laser));
        this.particles.forEach(particle => this.scene.remove(particle));
        this.kittens.forEach(kitten => this.scene.remove(kitten));
        this.enemies = [];
        this.lasers = [];
        this.particles = [];
        this.kittens = [];
        
        document.getElementById('score').textContent = this.score;
        
        this.createKittens();
        if (this.detectionEnabled && this.faceMesh && this.video) this.startFaceDetection();
    }
    
    async startFaceDetection() {
        const detect = async () => {
            if (!this.gameStarted) return;
            if (this.video.readyState >= 2) {
                try { await this.faceMesh.send({image: this.video}); } catch (e) {}
            }
            requestAnimationFrame(detect);
        };
        detect();
    }
    
    spawnEnemy() {
        const enemy = new THREE.Mesh(
            new THREE.PlaneGeometry(80, 80),
            new THREE.MeshBasicMaterial({ 
                map: this.ghostTexture, 
                transparent: true, 
                alphaTest: 0.1 
            })
        );
        
        // Only spawn from left, right, and bottom edges (not top)
        const side = Math.floor(Math.random() * 3); // 0=bottom, 1=right, 2=left
        const margin = 100;
        const positions = [
            [(Math.random() - 0.5) * window.innerWidth, -window.innerHeight / 2 - margin], // Bottom
            [window.innerWidth / 2 + margin, (Math.random() - 0.5) * window.innerHeight], // Right
            [-window.innerWidth / 2 - margin, (Math.random() - 0.5) * window.innerHeight] // Left
        ];
        
        [enemy.position.x, enemy.position.y] = positions[side];
        enemy.position.z = 0;
        
        // Store initial position for bobbing animation
        const initialY = enemy.position.y;
        
        enemy.userData = { 
            health: 35, 
            speed: this.isMobile ? 30 + Math.random() * 30 : 40 + Math.random() * 40,
            target: null, // Will be set to closest kitten
            initialY: initialY,
            bobSpeed: 6 + Math.random() * 4, // Faster bobbing speed (6-10)
            bobAmount: 40 + Math.random() * 20, // Larger bobbing amplitude (40-60)
            rotationSpeed: 4 + Math.random() * 3, // Faster rotation speed (4-7)
            rotationAmount: (25 + Math.random() * 10) * (Math.PI / 180), // 25-35 degrees in radians
            timeOffset: Math.random() * Math.PI * 2 // Random phase offset for variety
        };
        
        this.scene.add(enemy);
        this.enemies.push(enemy);
    }
    
    // Find the closest living kitten to target
    findClosestKitten(enemyPosition) {
        let closestKitten = null;
        let closestDistance = Infinity;
        
        this.kittens.forEach(kitten => {
            if (kitten.userData.alive) {
                const distance = Math.sqrt(
                    (kitten.position.x - enemyPosition.x) ** 2 + 
                    (kitten.position.y - enemyPosition.y) ** 2
                );
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestKitten = kitten;
                }
            }
        });
        
        return closestKitten;
    }
    
    createLaser(startX, startY, endX, endY) {
        const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2) * 4;
        const laser = new THREE.Mesh(new THREE.CylinderGeometry(25, 20, distance, 16), this.laserMaterial.clone());
        
        laser.position.set((startX + endX) / 2, (startY + endY) / 2, 20);
        laser.rotation.z = Math.atan2(endY - startY, endX - startX) - Math.PI / 2;
        laser.userData = { life: 0.5, maxLife: 1 };
        
        this.scene.add(laser);
        this.lasers.push(laser);
    }
    
    createParticles(x, y, count = 8) {
        const positions = new Float32Array(count * 3);
        const lives = new Float32Array(count);
        const velocities = new Float32Array(count * 3);
        const indices = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            positions[idx] = x; positions[idx + 1] = y; positions[idx + 2] = 1;
            lives[i] = 1; indices[i] = i;
            const angle = (i / count) * Math.PI * 2;
            const speed = 50 + Math.random() * 250;
            velocities[idx] = Math.cos(angle) * speed;
            velocities[idx + 1] = Math.sin(angle) * speed;
            velocities[idx + 2] = (Math.random() - 0.5) * 40;
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('sparkIndex', new THREE.BufferAttribute(indices, 1));
        
        const particles = new THREE.Points(geometry, this.particleMaterial);
        particles.userData = { life: 0.8, maxLife: 0.8, lives };
        
        this.scene.add(particles);
        this.particles.push(particles);
    }
    
    fireLaser() {
        const targetX = (this.smoothGaze.x - 0.5) * window.innerWidth;
        const targetY = -(this.smoothGaze.y - 0.5) * window.innerHeight;
        const leftEyeX = (this.leftEye.x - 0.5) * window.innerWidth;
        const leftEyeY = -(this.leftEye.y - 0.5) * window.innerHeight;
        const rightEyeX = (this.rightEye.x - 0.5) * window.innerWidth;
        const rightEyeY = -(this.rightEye.y - 0.5) * window.innerHeight;
        
        this.createLaser(leftEyeX, leftEyeY, targetX, targetY);
        this.createLaser(rightEyeX, rightEyeY, targetX, targetY);
        this.createParticles(targetX, targetY, 6);
        this.checkHit(targetX, targetY);
    }
    
    checkKittenCollisions() {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            for (let j = 0; j < this.kittens.length; j++) {
                const kitten = this.kittens[j];
                
                if (kitten.userData.alive) {
                    const distance = Math.sqrt(
                        (enemy.position.x - kitten.position.x) ** 2 + 
                        (enemy.position.y - kitten.position.y) ** 2
                    );
                    
                    if (distance < 50) {
                        // Kitten hit!
                        kitten.userData.alive = false;
                        kitten.visible = false;
                        this.createParticles(kitten.position.x, kitten.position.y, 15);
                        
                        // Remove the ghost that hit the kitten
                        this.scene.remove(enemy);
                        this.enemies.splice(i, 1);
                        this.createParticles(enemy.position.x, enemy.position.y, 10);
                        
                        // Check if all kittens are gone
                        const aliveKittens = this.kittens.filter(k => k.userData.alive).length;
                        if (aliveKittens === 0) {
                            this.triggerGameOver();
                        }

                        playKittenAlertSound();
                        
                        // Break out of kitten loop since this enemy is gone
                        break;
                    }
                }
            }
        }
    }
    
    triggerGameOver() {
        this.gameOver = true;
        this.gameStarted = false;
        
        // Hide game elements
        document.getElementById('leftEye').style.display = 'none';
        document.getElementById('rightEye').style.display = 'none';
        this.laserTip.visible = false;
        
        // Show game over screen
        document.getElementById('finalScore').textContent = this.score;
        document.getElementById('gameOverScreen').style.display = 'block';
    }
    
    checkHit(x, y) {
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            const distance = Math.sqrt((enemy.position.x - x) ** 2 + (enemy.position.y - y) ** 2);
            
            if (distance < 120) {
                enemy.userData.health -= 35;
                enemy.material.color.setHex(0x0000ff);
                this.createParticles(enemy.position.x, enemy.position.y, 12);
                playGhostPopSound();
                
                setTimeout(() => { if (enemy.material) enemy.material.color.setHex(0xffffff); }, 100);
                
                if (enemy.userData.health <= 0) {
                    this.scene.remove(enemy);
                    this.enemies.splice(i, 1);
                    this.score += 1;
                    document.getElementById('score').textContent = this.score;
                }
                return;
            }
        }
    }
    
    update(deltaTime) {
        if (this.gameOver) return;
        
        const now = Date.now();
        const time = now * 0.001;
        
        // Update kitten positions to follow face
        this.updateKittenPositions();
        
        // Spawn enemies
        if (now - this.lastEnemySpawn > this.enemySpawnInterval) {
            this.spawnEnemy();
            this.lastEnemySpawn = now;
            this.enemySpawnInterval = Math.max(650, this.enemySpawnInterval - 50);
        }
        
        // Auto-fire
        if (now - this.lastLaserTime > 180) {
            this.fireLaser();
            this.lastLaserTime = now;
        }
        
        // Check kitten collisions
        this.checkKittenCollisions();
        
        // Update enemies with bobbing and rotation - they now target kittens
        this.enemies.forEach((enemy, i) => {
            // Find the closest living kitten to target
            const closestKitten = this.findClosestKitten(enemy.position);
            
            if (closestKitten) {
                // Move towards the closest kitten
                const dx = closestKitten.position.x - enemy.position.x;
                const dy = closestKitten.position.y - enemy.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
                    enemy.position.x += (dx / distance) * enemy.userData.speed * deltaTime;
                    enemy.position.y += (dy / distance) * enemy.userData.speed * deltaTime;
                }
            }
            
            // Add bobbing motion (faster and larger)
            const bobOffset = Math.sin(time * enemy.userData.bobSpeed + enemy.userData.timeOffset) * enemy.userData.bobAmount;
            enemy.position.y += bobOffset * deltaTime;
            
            // Add pendulum rotation (30 degrees left and right)
            const rotationOffset = Math.sin(time * enemy.userData.rotationSpeed + enemy.userData.timeOffset) * enemy.userData.rotationAmount;
            enemy.rotation.z = rotationOffset;
        });
        
        // Update lasers
        this.lasers.forEach((laser, i) => {
            laser.userData.life -= deltaTime;
            if (laser.material.uniforms) laser.material.uniforms.intensity.value = laser.userData.life / laser.userData.maxLife;
            if (laser.userData.life <= 0) {
                this.scene.remove(laser);
                this.lasers.splice(i, 1);
            }
        });
        
        // Update particles
        this.particles.forEach((particles, i) => {
            particles.userData.life -= deltaTime;
            const lives = particles.userData.lives;
            for (let j = 0; j < lives.length; j++) {
                lives[j] -= deltaTime * (0.8 + Math.random() * 1.6);
                lives[j] = Math.max(0, lives[j]);
            }
            particles.geometry.attributes.life.needsUpdate = true;
            if (particles.userData.life <= 0) {
                this.scene.remove(particles);
                this.particles.splice(i, 1);
            }
        });
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const time = Date.now() * 0.001;
        if (this.laserMaterial?.uniforms) this.laserMaterial.uniforms.time.value = time;
        if (this.particleMaterial?.uniforms) this.particleMaterial.uniforms.time.value = time;
        if (this.laserTipMaterial?.uniforms) this.laserTipMaterial.uniforms.time.value = time;
        
        if (this.gameStarted) {
            this.update(0.016);
            if (!this.detectionEnabled) this.updateEyeUI();
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new LaserGame());
