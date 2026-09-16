
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
        this.beamHitCooldownMs = 100;
        this.playerName = '';
        this.mouthOpen = 0;
        this.smoothMouth = 0;
        this.mouthWasOpen = false;
        this.spaceHeld = false;
        this.powerCharges = 3;
        this.maxPowerCharges = 3;
        this.powerDurationMs = 5000; // 5 sn — bir dalgayı temizlemek için ideal
        this.powerActiveUntil = 0;
        this.reachedMilestones = new Set();
        this.milestoneTimer = null;

        // Yeni sistemler
        this.kittenMaxHp = 3;
        this.combo = 0;
        this.maxCombo = 0;
        this.lastKillAt = 0;
        this.comboWindowMs = 2500;
        this.wave = 1;
        this.lastWaveAnnounced = 0;
        this.bossesDefeated = 0;
        this.powerUsed = 0;
        this.nextBossAt = 50;
        this.calibStep = -1;
        this.calibActive = false;
        this.shockwaves = [];
        this._introTimers = [];
        
        // Face tracking
        this.faceLandmarker = null;
        this.faceMesh = null;
        this._useLegacyFaceMesh = false;
        this.detectionEnabled = false;
        this._faceDetectedOnce = false;
        this._detectRunning = false;
        this._detectTs = 0;
        this._faceCanvas = null;
        this._faceCtx = null;
        this.leftEye = { x: 0.45, y: 0.38 };
        this.rightEye = { x: 0.55, y: 0.38 };
        this.smoothLeftEye = { x: 0.45, y: 0.38 };
        this.smoothRightEye = { x: 0.55, y: 0.38 };
        this.gaze = { x: 0.5, y: 0.5 };
        this.smoothGaze = { x: 0.5, y: 0.5 };
        this.faceCenter = { x: 0.5, y: 0.5 };
        this.currentFaceCenter = { x: 0.5, y: 0.5 };
        this.isCalibrated = false;
        this.laserTip = null;
        this.persistentBeams = [];
        this.baseTipScale = 68;
        
        this.milestones = [
            { score: 10,  text: (n) => `${n}, lazeri hissettin — böyle devam!` },
            { score: 25,  text: (n) => `Kediler sana güveniyor, ${n}!` },
            { score: 50,  text: (n) => `50 hayalet! Isındın — tempo artacak.` },
            { score: 100, text: (n) => `100! Gerçek bir kurtarıcı, ${n}!` },
            { score: 200, text: (n) => `${n}, baskı artıyor — güçlerini sakla!` },
            { score: 300, text: (n) => `300! Hayaletler öfkeleniyor...` },
            { score: 400, text: (n) => `400 — final turu! Dayan ${n}!` },
            { score: 500, text: (n) => `${n}, efsane oldun. Kediler sonsuza dek güvende.` }
        ];
        
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
        window.__game = this;
    }
    
    async init() {
        await this.loadSprites();
        this.setupShaders();
        this.setupEventListeners();
        this.createLaserTip();
        this.createPersistentBeams();
        this.renderLeaderboard('leaderboardList');
        this.animate();
        this.markAppReady();
    }

    markAppReady() {
        const startBtn = document.getElementById('startButton');
        if (!startBtn) return;
        startBtn.disabled = false;
        startBtn.textContent = 'Başla';
    }

    setTrackingStatus(msg) {
        const hint = document.querySelector('#start-overlay .hint-line');
        if (hint && !this.gameStarted) hint.textContent = msg;
        console.log('[yüz takibi]', msg);
    }

    isReadyToStart() {
        return true;
    }

    waitForGlobal(name, timeoutMs = 12000) {
        return new Promise((resolve, reject) => {
            if (window[name]) {
                resolve();
                return;
            }
            const started = Date.now();
            const timer = setInterval(() => {
                if (window[name]) {
                    clearInterval(timer);
                    resolve();
                } else if (Date.now() - started > timeoutMs) {
                    clearInterval(timer);
                    reject(new Error(`${name} yüklenemedi`));
                }
            }, 50);
        });
    }

    getVideoLayout() {
        const video = this.video;
        const rect = video?.getBoundingClientRect?.() || {
            left: 0,
            top: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };
        const vw = video?.videoWidth || 640;
        const vh = video?.videoHeight || 480;
        const scale = Math.max(rect.width / vw, rect.height / vh) || 1;
        const drawW = vw * scale;
        const drawH = vh * scale;
        return {
            rect,
            vw,
            vh,
            scale,
            offsetX: (rect.width - drawW) / 2,
            offsetY: (rect.height - drawH) / 2,
            drawW,
            drawH
        };
    }

    landmarkToDisplay(lmX, lmY) {
        const { rect, offsetX, offsetY, scale, vw, vh } = this.getVideoLayout();
        const mx = 1 - lmX;
        const px = rect.left + offsetX + mx * vw * scale;
        const py = rect.top + offsetY + lmY * vh * scale;
        return {
            px,
            py,
            nx: (px - rect.left) / rect.width,
            ny: (py - rect.top) / rect.height
        };
    }

    displayNormToWorld(nx, ny) {
        const { rect } = this.getVideoLayout();
        const px = rect.left + nx * rect.width;
        const py = rect.top + ny * rect.height;
        return {
            x: px - window.innerWidth / 2,
            y: -(py - window.innerHeight / 2)
        };
    }

    async ensureCameraAndTracking() {
        if (!this.video?.srcObject) {
            this.setTrackingStatus('Kamera açılıyor...');
            await this.setupVideo();
        }
        if (!this.detectionEnabled) {
            this.setTrackingStatus('Yüz takibi yükleniyor...');
            await this.setupMediaPipe();
        }
        if (!this._detectRunning) this.startFaceDetection();

        this.setTrackingStatus('Yüzün aranıyor — kameraya bak...');
        const started = Date.now();
        while (!this._faceDetectedOnce && Date.now() - started < 15000) {
            await this.runFaceDetectionStep();
            await new Promise(r => setTimeout(r, 60));
        }
    }

    getLeaderboard() {
        try {
            return JSON.parse(localStorage.getItem('eyeLaserLeaderboard') || '[]');
        } catch (e) {
            return [];
        }
    }

    saveScoreToLeaderboard(name, score) {
        const board = this.getLeaderboard();
        board.push({ name, score, at: Date.now() });
        board.sort((a, b) => b.score - a.score || a.at - b.at);
        const top = board.slice(0, 10);
        localStorage.setItem('eyeLaserLeaderboard', JSON.stringify(top));
        return top;
    }

    renderLeaderboard(listId, highlightName = null) {
        const list = document.getElementById(listId);
        if (!list) return;
        const board = this.getLeaderboard();
        if (!board.length) {
            list.innerHTML = '<li class="empty">Henüz kahraman yok — ilk sen ol!</li>';
            return;
        }
        list.innerHTML = board.slice(0, 5).map((row, i) => {
            const active = highlightName && row.name === highlightName ? ' style="color:#ffed66"' : '';
            return `<li${active}><span class="rank">#${i + 1}</span><span class="name">${this.escapeHtml(row.name)}</span><span class="pts">${row.score}</span></li>`;
        }).join('');
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    showMilestone(message, durationMs = 2200) {
        const banner = document.getElementById('milestoneBanner');
        if (!banner) return;
        banner.textContent = message;
        banner.classList.add('show');
        if (typeof playMilestoneSound === 'function') playMilestoneSound();
        clearTimeout(this.milestoneTimer);
        this.milestoneTimer = setTimeout(() => banner.classList.remove('show'), durationMs);
    }

    checkMilestones() {
        const name = this.playerName || 'Kurtarıcı';
        this.milestones.forEach(m => {
            if (this.score >= m.score && !this.reachedMilestones.has(m.score)) {
                this.reachedMilestones.add(m.score);
                this.showMilestone(m.text(name));
            }
        });
    }

    getMouthPower() {
        // Aktif güç süresi varken tam güç; değilse ağız tek başına büyütmez
        if (Date.now() < this.powerActiveUntil) return 1;
        return 0;
    }

    isPowerActive() {
        return Date.now() < this.powerActiveUntil;
    }

    tryActivatePower() {
        if (!this.gameStarted || this.gameOver) return;
        if (this.isPowerActive()) return;
        if (this.powerCharges <= 0) {
            this.flashNoCharges();
            return;
        }
        this.powerCharges -= 1;
        this.powerUsed += 1;
        this.powerActiveUntil = Date.now() + this.powerDurationMs;
        this.updatePowerUI(true);
        this.showMilestone(`GÜÇ LAZERİ · 5 sn  |  Kalan: ${this.powerCharges}/3`);
        if (typeof setMusicIntensity === 'function') {
            const alive = this.kittens.filter(k => k.userData.alive).length;
            setMusicIntensity(this.score, true, alive === 1);
        }
    }

    flashNoCharges() {
        const el = document.getElementById('powerCharges');
        if (!el) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        const hint = document.getElementById('mouthHint');
        if (hint) {
            hint.textContent = 'Hakların bitti!';
            hint.classList.add('hot');
        }
    }

    updatePowerUI(justActivated = false) {
        const wrap = document.getElementById('powerCharges');
        const hint = document.getElementById('mouthHint');
        if (!wrap) return;

        const pips = [];
        for (let i = 0; i < this.maxPowerCharges; i++) {
            const filled = i < this.powerCharges;
            pips.push(`<span class="power-pip${filled ? ' filled' : ''}${justActivated && i === this.powerCharges ? ' spent' : ''}"></span>`);
        }
        wrap.innerHTML = pips.join('');

        const active = this.isPowerActive();
        wrap.classList.toggle('active', active);
        const bar = document.getElementById('powerTimerBar');
        if (bar) {
            if (active) {
                const left = Math.max(0, this.powerActiveUntil - Date.now());
                const pct = (left / this.powerDurationMs) * 100;
                bar.style.width = pct + '%';
                bar.parentElement?.classList.add('show');
            } else {
                bar.style.width = '0%';
                bar.parentElement?.classList.remove('show');
            }
        }

        if (hint) {
            if (active) {
                hint.textContent = 'GÜÇ LAZERİ AKTİF!';
                hint.classList.add('hot');
            } else if (this.powerCharges > 0) {
                hint.textContent = `Ağzını aç → güç (${this.powerCharges}/3)`;
                hint.classList.remove('hot');
            } else {
                hint.textContent = 'Güç hakların bitti';
                hint.classList.remove('hot');
            }
        }
        const countEl = document.getElementById('powerCount');
        if (countEl) countEl.textContent = `${this.powerCharges}/${this.maxPowerCharges}`;
    }

    getLaserWidthScale() {
        return 1 + this.getMouthPower() * 1.4;
    }

    // Daha erken baskı — hayaletler çabuk gelsin
    getSpawnInterval() {
        const s = this.score;
        if (s < 10) return 1100;
        if (s < 30) return 900;
        if (s < 70) return 750;
        if (s < 120) return 620;
        if (s < 200) return 520;
        if (s < 300) return 420;
        if (s < 400) return 340;
        return 280;
    }

    getEnemySpeed() {
        const s = this.score;
        const base = this.isMobile ? 32 + Math.random() * 20 : 42 + Math.random() * 28;
        let mult = 1.05;
        if (s >= 20) mult = 1.2;
        if (s >= 60) mult = 1.4;
        if (s >= 120) mult = 1.6;
        if (s >= 200) mult = 1.85;
        if (s >= 300) mult = 2.1;
        if (s >= 400) mult = 2.4;
        if (s >= 500) mult = 2.7;
        return base * mult;
    }

    getDoubleSpawnChance() {
        const s = this.score;
        if (s < 20) return 0.2;
        if (s < 80) return 0.32;
        if (s < 160) return 0.42;
        if (s < 280) return 0.55;
        return 0.7;
    }

    runIntroTips() {
        (this._introTimers || []).forEach(clearTimeout);
        this._introTimers = [];
        const name = this.playerName || 'Kurtarıcı';
        const tips = [
            { t: 300,  msg: `${name} — gözlerinden KIRMIZI LAZER çıkıyor!` },
            { t: 1800, msg: 'Başını hareket ettir → lazer hedefi kayar' },
            { t: 3400, msg: 'Hayaletleri lazerle yok et!' },
            { t: 5000, msg: 'Sıkışınca ağzını aç → güç lazeri' }
        ];
        tips.forEach(({ t, msg }) => {
            this._introTimers.push(setTimeout(() => {
                if (this.gameStarted && !this.gameOver) this.showMilestone(msg, 1600);
            }, t));
        });
    }

    getTitleForScore(score) {
        if (score >= 500) return 'EFSANE KURTARICI';
        if (score >= 400) return 'EFSANE KURTARICI';
        if (score >= 300) return 'HAYALET AVCISI';
        if (score >= 200) return 'ŞEHİR KAHRAMANI';
        if (score >= 100) return 'KEDİ KORUYUCUSU';
        if (score >= 50) return 'CESUR SAVUNUCU';
        if (score >= 20) return 'ACEMİ KAHRAMAN';
        return 'ÇIRAK KURTARICI';
    }

    updateKittenHpUI() {
        const el = document.getElementById('kittenHp');
        if (!el) return;
        el.innerHTML = this.kittens.map((k, i) => {
            const hp = k.userData.alive ? k.userData.hp : 0;
            const hearts = Array.from({ length: this.kittenMaxHp }, (_, h) =>
                `<span class="heart${h < hp ? ' full' : ''}"></span>`
            ).join('');
            return `<div class="kitten-hearts" title="Kedi ${i + 1}">${hearts}</div>`;
        }).join('');
    }

    updateComboUI() {
        const line = document.getElementById('comboLine');
        const banner = document.getElementById('comboBanner');
        if (line) {
            line.textContent = this.combo > 1 ? `Combo x${this.combo}` : 'Combo x1';
            line.classList.toggle('hot', this.combo >= 5);
        }
        if (banner && this.combo >= 3) {
            banner.textContent = `x${this.combo} KOMBO!`;
            banner.classList.add('show');
            clearTimeout(this._comboBannerTimer);
            this._comboBannerTimer = setTimeout(() => banner.classList.remove('show'), 700);
        }
    }

    updateWaveUI() {
        const el = document.getElementById('waveNum');
        if (el) el.textContent = String(this.wave);
    }

    registerKill(points = 1, isBoss = false) {
        const now = Date.now();
        if (now - this.lastKillAt <= this.comboWindowMs) this.combo += 1;
        else this.combo = 1;
        this.lastKillAt = now;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        const mult = Math.min(5, 1 + Math.floor((this.combo - 1) / 2));
        const gained = points * mult;
        this.score += gained;
        document.getElementById('score').textContent = this.score;
        this.updateComboUI();
        if (this.combo >= 2 && typeof playComboSound === 'function') playComboSound(this.combo);
        this.checkMilestones();
        this.checkWaveProgress();
        if (isBoss) {
            this.bossesDefeated += 1;
            if (this.powerCharges < this.maxPowerCharges) {
                this.powerCharges += 1;
                this.updatePowerUI();
                this.showMilestone('BOSS YENİLDİ! +1 güç hakkı');
            } else {
                this.showMilestone('BOSS YENİLDİ!');
            }
            if (typeof playBossDefeatSound === 'function') playBossDefeatSound();
        }
        if (typeof setMusicIntensity === 'function') {
            const alive = this.kittens.filter(k => k.userData.alive).length;
            setMusicIntensity(this.score, this.isPowerActive(), alive === 1);
        }
        return gained;
    }

    checkWaveProgress() {
        const newWave = Math.floor(this.score / 25) + 1;
        if (newWave > this.wave) {
            this.wave = newWave;
            this.updateWaveUI();
            this.showMilestone(`DALGA ${this.wave} — hayaletler öfkeleniyor!`);
        }
    }

    pickEnemyType(forceBoss = false) {
        if (forceBoss) {
            return {
                type: 'boss',
                health: 420,
                speedMult: 0.42,
                size: 150,
                color: new THREE.Color(1.0, 0.75, 0.15),
                points: 8,
                label: 'BOSS'
            };
        }
        // İlk skorlardan itibaren çeşitlilik
        if (this.score < 12) {
            return {
                type: 'normal',
                health: 55,
                speedMult: 1.05,
                size: 80,
                color: new THREE.Color(1, 1, 1),
                points: 1,
                label: 'normal'
            };
        }
        const r = Math.random();
        const s = this.score;
        const fastChance = s < 50 ? 0.22 : Math.min(0.42, 0.2 + s * 0.0015);
        const tankChance = s < 60 ? 0.12 : Math.min(0.3, 0.1 + s * 0.0012);
        if (r < fastChance) {
            return {
                type: 'fast',
                health: 40,
                speedMult: s >= 400 ? 2.2 : 1.75,
                size: 62,
                color: new THREE.Color(0.35, 0.85, 1.0),
                points: 1,
                label: 'hızlı'
            };
        }
        if (r < fastChance + tankChance) {
            return {
                type: 'tank',
                health: s >= 350 ? 240 : 170,
                speedMult: 0.65,
                size: 108,
                color: new THREE.Color(0.75, 0.35, 1.0),
                points: 2,
                label: 'tank'
            };
        }
        return {
            type: 'normal',
            health: 55,
            speedMult: 1.1,
            size: 80,
            color: new THREE.Color(1, 1, 1),
            points: 1,
            label: 'normal'
        };
    }

    startCalibration() {
        this.calibActive = true;
        this.calibStep = 0;
        document.getElementById('start-overlay').style.display = 'none';
        document.getElementById('calibOverlay').style.display = 'block';
        this.setCalibUI();
        // Yüz takibini kalibrasyon sırasında da çalıştır
        if (this.detectionEnabled && this.video) {
            this.startFaceDetection();
        }
    }

    setCalibUI() {
        const texts = [
            'Kameraya bak, yüzün ortada olsun',
            'Ağzını aç — güç lazerini test et',
            'Hazırsın — Başla!'
        ];
        const el = document.getElementById('calibStepText');
        if (el) el.textContent = texts[this.calibStep] || 'Hazır!';
        document.querySelectorAll('#calibSteps span').forEach((s) => {
            const n = Number(s.dataset.step);
            s.classList.toggle('on', n === this.calibStep);
            s.classList.toggle('done', n < this.calibStep);
        });
    }

    advanceCalibration(eyeAspect) {
        if (!this.calibActive) return;
        if (this.calibStep === 0 && this.isCalibrated) {
            this.calibStep = 1;
            this.setCalibUI();
            return;
        }
        if (this.calibStep === 1 && this.mouthOpen > 0.45) {
            this.calibStep = 3;
            this.finishCalibration();
        }
    }

    finishCalibration() {
        this.calibActive = false;
        document.getElementById('calibOverlay').style.display = 'none';
        this.beginGameplay();
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
                hp: this.kittenMaxHp,
                maxHp: this.kittenMaxHp,
                hitCooldown: 0,
                relativePosition: pos
            };
            
            this.scene.add(kitten);
            this.kittens.push(kitten);
        });
    }
    
    updateKittenPositions() {
        if (!this.isCalibrated || this.kittens.length === 0 || !this.currentFaceCenter) return;
        
        const face = this.landmarkToDisplay(this.currentFaceCenter.x, this.currentFaceCenter.y);
        
        this.kittens.forEach((kitten) => {
            if (kitten.userData.alive) {
                const relPos = kitten.userData.relativePosition;
                kitten.position.x = face.px + relPos.x * window.innerWidth - window.innerWidth / 2;
                kitten.position.y = -(face.py + relPos.y * window.innerHeight - window.innerHeight / 2);
            }
        });
    }
    
    async loadSprites() {
        const loadPromises = [
            // Load ghost texture
            new Promise((resolve) => {
                this.textureLoader.load(
                    'assets/ghost.png',
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
    
    loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[data-src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === '1') resolve();
                else existing.addEventListener('load', () => resolve(), { once: true });
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.crossOrigin = 'anonymous';
            script.dataset.src = src;
            script.onload = () => {
                script.dataset.loaded = '1';
                resolve();
            };
            script.onerror = () => reject(new Error(`Script yüklenemedi: ${src}`));
            document.head.appendChild(script);
        });
    }

    async setupLocalFaceMesh() {
        if (typeof window.FaceMesh === 'undefined') {
            await this.loadScript('/vendor/mediapipe/face_mesh/face_mesh.js');
        }
        if (typeof window.FaceMesh === 'undefined') {
            throw new Error('FaceMesh script yüklenemedi');
        }

        this.faceMesh = new window.FaceMesh({
            locateFile: (file) => `/vendor/mediapipe/face_mesh/${file}`
        });
        this.faceMesh.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.3,
            minTrackingConfidence: 0.3
        });
        this.faceMesh.onResults((results) => {
            if (results.multiFaceLandmarks?.[0]) {
                this.updateGaze(results.multiFaceLandmarks[0]);
            }
        });
        if (typeof this.faceMesh.initialize === 'function') {
            await Promise.race([
                this.faceMesh.initialize(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('FaceMesh init zaman aşımı')), 25000))
            ]);
        }
        this._useLegacyFaceMesh = true;
        this.detectionEnabled = true;
        this.setTrackingStatus('FaceMesh hazır — kameraya bak');
    }

    async setupLocalFaceLandmarker(delegate) {
        const { FaceLandmarker, FilesetResolver } = await import('/vendor/mediapipe/tasks-vision/vision_bundle.mjs');
        const vision = await FilesetResolver.forVisionTasks('/vendor/mediapipe/tasks-vision/wasm');
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: '/vendor/models/face_landmarker.task',
                delegate
            },
            runningMode: 'VIDEO',
            numFaces: 1,
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false
        });
        this._useLegacyFaceMesh = false;
        this.detectionEnabled = true;
    }

    async setupMediaPipe() {
        if (this.detectionEnabled) return;

        // 1) Yerel FaceMesh — localhost'ta çalışan sistem
        try {
            await this.setupLocalFaceMesh();
            this.setTrackingStatus('FaceMesh hazır');
            return;
        } catch (faceMeshError) {
            console.warn('Yerel FaceMesh başarısız:', faceMeshError);
        }

        // 2) Yerel FaceLandmarker yedeği
        try {
            try {
                await this.setupLocalFaceLandmarker('GPU');
            } catch {
                await this.setupLocalFaceLandmarker('CPU');
            }
            this.setTrackingStatus('FaceLandmarker hazır');
            return;
        } catch (landmarkerError) {
            console.error('Yüz takibi yüklenemedi:', landmarkerError);
            this.detectionEnabled = false;
            this.faceLandmarker = null;
            this.faceMesh = null;
        }
    }

    getFaceInput() {
        const video = this.video;
        if (!video || video.readyState < 2) return null;
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (!vw || !vh) return null;

        // Safari/HTTPS: doğrudan video yerine canvas daha güvenilir
        if (!this._faceCanvas) {
            this._faceCanvas = document.createElement('canvas');
            this._faceCtx = this._faceCanvas.getContext('2d', { willReadFrequently: true });
        }
        if (this._faceCanvas.width !== vw || this._faceCanvas.height !== vh) {
            this._faceCanvas.width = vw;
            this._faceCanvas.height = vh;
        }
        this._faceCtx.drawImage(video, 0, 0, vw, vh);
        return this._faceCanvas;
    }

    async runFaceDetectionStep() {
        if (!this.detectionEnabled) return;
        const input = this.getFaceInput();
        if (!input) return;

        if (this.faceLandmarker) {
            this._detectTs += 33;
            const results = this.faceLandmarker.detectForVideo(input, this._detectTs);
            if (results?.faceLandmarks?.[0]) {
                this.updateGaze(results.faceLandmarks[0]);
            }
            return;
        }
        if (this.faceMesh) {
            await this.faceMesh.send({ image: input });
        }
    }
    
    updateGaze(landmarks) {
        const leftEyeCenter = landmarks[468] || landmarks[33];
        const rightEyeCenter = landmarks[473] || landmarks[362];
        if (!leftEyeCenter || !rightEyeCenter) return;

        this._faceDetectedOnce = true;
        
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
        
        const left = this.landmarkToDisplay(leftEyeCenter.x, leftEyeCenter.y);
        const right = this.landmarkToDisplay(rightEyeCenter.x, rightEyeCenter.y);
        this.leftEye.x = left.nx;
        this.leftEye.y = left.ny;
        this.rightEye.x = right.nx;
        this.rightEye.y = right.ny;

        // Ağız: Space basılıysa yüz algısı ezmesin
        if (!this.spaceHeld) {
            const upperLip = landmarks[13];
            const lowerLip = landmarks[14];
            const topLip = landmarks[0];
            const chin = landmarks[17];
            if (upperLip && lowerLip) {
                const mouthGap = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
                const tallGap = (topLip && chin)
                    ? Math.hypot(topLip.x - chin.x, topLip.y - chin.y)
                    : mouthGap * 3;
                const eyeDist = Math.hypot(
                    leftEyeCenter.x - rightEyeCenter.x,
                    leftEyeCenter.y - rightEyeCenter.y
                ) || 0.05;
                // Daha hassas: hafif açık ağız yeterli
                const ratio = mouthGap / eyeDist;
                const tall = tallGap / eyeDist;
                const raw = Math.max((ratio - 0.08) / 0.35, (tall - 0.45) / 0.55);
                this.mouthOpen = Math.max(0, Math.min(1, raw));
            }
        }
        
        this.updateEyeUI();
    }
    
    updateEyeUI() {
        const { rect } = this.getVideoLayout();
        const leftX = rect.left + this.smoothLeftEye.x * rect.width;
        const leftY = rect.top + this.smoothLeftEye.y * rect.height;
        const rightX = rect.left + this.smoothRightEye.x * rect.width;
        const rightY = rect.top + this.smoothRightEye.y * rect.height;
        document.getElementById('leftEye').style.left = leftX + 'px';
        document.getElementById('rightEye').style.left = rightX + 'px';
        document.getElementById('leftEye').style.top = leftY + 'px';
        document.getElementById('rightEye').style.top = rightY + 'px';

        this.syncLaserAim();
    }

    getAimPoints() {
        // Hedef = bakış; başlangıçta (0.5, 0.5) → ekran merkezi (başlat alanı)
        const tip = this.displayNormToWorld(this.smoothGaze.x, this.smoothGaze.y);
        let tipX = tip.x;
        let tipY = tip.y;
        const left = this.displayNormToWorld(this.smoothLeftEye.x, this.smoothLeftEye.y);
        const right = this.displayNormToWorld(this.smoothRightEye.x, this.smoothRightEye.y);
        const leftX = left.x;
        const leftY = left.y;
        const rightX = right.x;
        const rightY = right.y;

        // Uç gözlerin üstüne çökerse kısa bir ışın bırak (üste fırlatma yok)
        const midX = (leftX + rightX) / 2;
        const midY = (leftY + rightY) / 2;
        let dx = tipX - midX;
        let dy = tipY - midY;
        let dist = Math.hypot(dx, dy);
        if (dist < 12) {
            tipX = 0;
            tipY = 0;
            dx = tipX - midX;
            dy = tipY - midY;
            dist = Math.hypot(dx, dy);
            if (dist < 12) {
                tipX = midX;
                tipY = midY - 180;
            } else {
                const len = 180;
                tipX = midX + (dx / dist) * len;
                tipY = midY + (dy / dist) * len;
            }
        }

        // Lazer ucu ekran dışına kaçmasın (donma / kaybolma hissi)
        const margin = 40;
        const maxX = window.innerWidth / 2 - margin;
        const maxY = window.innerHeight / 2 - margin;
        tipX = Math.max(-maxX, Math.min(maxX, tipX));
        tipY = Math.max(-maxY, Math.min(maxY, tipY));

        return { tipX, tipY, leftX, leftY, rightX, rightY };
    }

    syncLaserAim() {
        // Tek yumuşatma noktası: gözler, bakış, ışın ve yuvarlak aynı hedefi paylaşır
        this.smoothGaze.x += (this.gaze.x - this.smoothGaze.x) * 0.22;
        this.smoothGaze.y += (this.gaze.y - this.smoothGaze.y) * 0.22;
        this.smoothLeftEye.x += (this.leftEye.x - this.smoothLeftEye.x) * 0.22;
        this.smoothLeftEye.y += (this.leftEye.y - this.smoothLeftEye.y) * 0.22;
        this.smoothRightEye.x += (this.rightEye.x - this.smoothRightEye.x) * 0.22;
        this.smoothRightEye.y += (this.rightEye.y - this.smoothRightEye.y) * 0.22;
        this.smoothMouth += (this.mouthOpen - this.smoothMouth) * 0.28;

        // Ağız açılınca 1 hak harca (histerezis: yanlış tetiklenmesin)
        const openThresh = 0.28;
        const closeThresh = 0.16;
        let openNow = this.mouthWasOpen
            ? this.smoothMouth > closeThresh
            : this.smoothMouth > openThresh;
        if (openNow && !this.mouthWasOpen && this.gameStarted && !this.gameOver) {
            this.tryActivatePower();
        }
        this.mouthWasOpen = openNow;

        const power = this.getMouthPower();
        const widthScale = this.getLaserWidthScale();
        const { tipX, tipY, leftX, leftY, rightX, rightY } = this.getAimPoints();

        if (this.laserTip) {
            this.laserTip.position.x = tipX;
            this.laserTip.position.y = tipY;
            this.laserTip.visible = this.gameStarted && !this.gameOver;
            const tipScale = this.baseTipScale * (0.85 + widthScale * 0.55);
            this.laserTip.scale.setScalar(tipScale / this.baseTipScale);
        }

        if (this.persistentBeams.length >= 2) {
            this.updateBeamTransform(this.persistentBeams[0], leftX, leftY, tipX, tipY, widthScale);
            this.updateBeamTransform(this.persistentBeams[1], rightX, rightY, tipX, tipY, widthScale);
        }

        const leftEl = document.getElementById('leftEye');
        const rightEl = document.getElementById('rightEye');
        const base = window.innerWidth < 768 ? 16 : 35;
        const size = base * (1 + power * 0.9);
        [leftEl, rightEl].forEach(el => {
            if (!el) return;
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.classList.toggle('powered', power > 0.35);
        });
        this.updatePowerUI();
    }
    
    setupShaders() {
        this.laserMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                intensity: { value: 1 },
                isCore: { value: 0 }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform float time, intensity, isCore;
                varying vec2 vUv;
                void main() {
                    // Plane: x = genişlik, y = uzunluk
                    float across = abs(vUv.x - 0.5) * 2.0;
                    float along = vUv.y;

                    float stream = sin(along * 60.0 - time * 42.0) * 0.5 + 0.5;
                    float stream2 = sin(along * 28.0 - time * 30.0 + 1.4) * 0.5 + 0.5;
                    float pulse = 0.9 + 0.1 * sin(time * 24.0);
                    float flicker = 0.94 + 0.06 * sin(time * 50.0 + along * 18.0);

                    vec3 deepRed = vec3(1.0, 0.02, 0.02);
                    vec3 brightRed = vec3(1.0, 0.15, 0.05);
                    vec3 orange = vec3(1.0, 0.55, 0.12);
                    vec3 whiteHot = vec3(1.0, 0.98, 0.94);

                    if (isCore > 0.5) {
                        float core = 1.0 - smoothstep(0.0, 0.7, across);
                        float hot = 1.0 - smoothstep(0.0, 0.28, across);
                        vec3 col = mix(orange, whiteHot, hot) * (3.2 + stream * 1.0);
                        float alpha = (core * 1.6 + hot * 2.0) * intensity * pulse * flicker;
                        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
                    } else {
                        float glow = pow(1.0 - smoothstep(0.0, 1.0, across), 0.65);
                        float mid = 1.0 - smoothstep(0.0, 0.55, across);
                        float core = 1.0 - smoothstep(0.0, 0.22, across);
                        vec3 col = deepRed * glow * 2.0;
                        col += brightRed * mid * (2.2 + stream * 0.7);
                        col += orange * core * (1.8 + stream2 * 0.5);
                        col += whiteHot * core * core * 1.4;
                        float alpha = (glow * 0.95 + mid * 1.2 + core * 1.1) * intensity * pulse * flicker;
                        gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
                    }
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        
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
                    float pulse = 1.0 + sin(time * 14.0) * 0.035;
                    pos.xy *= pulse;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }`,
            fragmentShader: `
                uniform float time, intensity;
                varying vec2 vUv;
                void main() {
                    vec2 center = vUv - 0.5;
                    float dist = length(center);
                    float angle = atan(center.y, center.x);

                    float swirl = sin(angle * 5.0 + time * 18.0 - dist * 22.0) * 0.5 + 0.5;
                    float rays = pow(max(0.0, cos(angle * 7.0 - time * 9.0)), 5.0);

                    float hot = 1.0 - smoothstep(0.0, 0.09, dist);
                    float core = 1.0 - smoothstep(0.0, 0.2, dist);
                    float ring = smoothstep(0.14, 0.24, dist) * (1.0 - smoothstep(0.26, 0.4, dist));
                    float glow = 1.0 - smoothstep(0.2, 0.52, dist);

                    float pulse = 1.04 + sin(time * 20.0) * 0.12;

                    vec3 whiteHot = vec3(1.0, 0.97, 0.9);
                    vec3 orange = vec3(1.0, 0.4, 0.08);
                    vec3 red = vec3(1.0, 0.1, 0.03);

                    vec3 finalColor = whiteHot * hot * 2.4;
                    finalColor += mix(orange, whiteHot, swirl * 0.6) * core * 1.25;
                    finalColor += red * ring * (1.35 + swirl * 0.4);
                    finalColor += red * glow * 0.28;
                    finalColor += orange * rays * glow * 0.35;
                    finalColor *= pulse * intensity;

                    float alpha = (hot * 1.25 + core * 0.85 + ring * 0.95 + glow * 0.22 + rays * 0.12) * pulse * intensity;
                    if (dist > 0.52) discard;
                    gl_FragColor = vec4(finalColor, clamp(alpha, 0.0, 1.0));
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
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
                    vec3 color = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.12, 0.02), 1.0 - vLife) * 1.6;
                    gl_FragColor = vec4(color, alpha);
                }`,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
    }
    
    createLaserTip() {
        const tipGeometry = new THREE.CircleGeometry(this.baseTipScale, 48);
        this.laserTip = new THREE.Mesh(tipGeometry, this.laserTipMaterial);
        this.laserTip.position.z = 50;
        this.laserTip.visible = false;
        this.scene.add(this.laserTip);
    }

    createPersistentBeams() {
        this.persistentBeams = [];
        for (let i = 0; i < 2; i++) {
            const glowMat = this.laserMaterial.clone();
            glowMat.uniforms.time = { value: 0 };
            glowMat.uniforms.intensity = { value: 1.15 };
            glowMat.uniforms.isCore = { value: 0 };
            // 1x1 düzlem; scale ile genişlik x uzunluk verilecek
            const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
            glow.position.z = 18;

            const coreMat = this.laserMaterial.clone();
            coreMat.uniforms.time = { value: 0 };
            coreMat.uniforms.intensity = { value: 1.25 };
            coreMat.uniforms.isCore = { value: 1 };
            const core = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), coreMat);
            core.position.z = 22;

            const group = new THREE.Group();
            group.add(glow);
            group.add(core);
            group.visible = false;
            group.userData = {
                layers: [
                    { mesh: glow, mat: glowMat, width: 72 },
                    { mesh: core, mat: coreMat, width: 18 }
                ]
            };

            this.scene.add(group);
            this.persistentBeams.push(group);
        }
    }

    updateBeamTransform(group, x1, y1, x2, y2, widthScale = 1) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.max(40, Math.sqrt(dx * dx + dy * dy));

        group.visible = this.gameStarted && !this.gameOver;
        group.position.set((x1 + x2) / 2, (y1 + y2) / 2, 25);
        group.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;

        const layers = group.userData.layers || [];
        layers.forEach(({ mesh, width, mat }) => {
            mesh.scale.set(width * widthScale, dist, 1);
            mesh.visible = true;
            if (mat?.uniforms?.intensity) {
                mat.uniforms.intensity.value = Math.max(mat.uniforms.intensity.value || 0, 1.15);
            }
        });
    }
    
    async setupVideo() {
        const video = document.getElementById('videoElement');
        if (this.video?.srcObject && this.video.readyState >= 2) return;

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('Kamera desteklenmiyor');
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                },
                audio: false
            });

            video.setAttribute('playsinline', '');
            video.setAttribute('webkit-playsinline', '');
            video.muted = true;
            video.playsInline = true;
            video.srcObject = stream;
            this.video = video;

            await new Promise((resolve, reject) => {
                const finish = () => resolve();
                video.onerror = () => reject(new Error('Video yüklenemedi'));
                video.onloadedmetadata = () => {
                    video.play().then(finish).catch(reject);
                };
                if (video.readyState >= 1) {
                    video.play().then(finish).catch(reject);
                }
            });

            await new Promise((resolve) => {
                if (video.readyState >= 2 && video.videoWidth > 0) {
                    resolve();
                    return;
                }
                video.addEventListener('loadeddata', resolve, { once: true });
            });
        } catch (error) {
            console.error('Kamera hatası:', error);
            throw error;
        }
    }

    setupEventListeners() {
        const nickInput = document.getElementById('nicknameInput');
        const savedName = localStorage.getItem('eyeLaserNickname') || '';
        if (savedName && nickInput) nickInput.value = savedName;

        document.getElementById('startButton').addEventListener('click', async () => {
            const startBtn = document.getElementById('startButton');
            const name = (nickInput?.value || '').trim().slice(0, 12);
            if (!name) {
                nickInput?.focus();
                nickInput?.classList.add('hot');
                alert('Kurtarıcı adını gir — kediler kimi kutlayacak bilmek istiyor.');
                return;
            }

            startBtn.disabled = true;
            startBtn.textContent = '⏳ Hazırlanıyor...';
            try {
                await this.ensureCameraAndTracking();
            } catch (error) {
                console.error(error);
                alert('Kamera veya yüz takibi açılamadı. Tarayıcı ayarlarından kamera izni ver, sayfayı yenile.');
                startBtn.disabled = false;
                startBtn.textContent = 'Başla';
                return;
            }

            if (!this.detectionEnabled) {
                alert('Yüz takibi yüklenemedi. Sayfayı yenile (Cmd+Shift+R).');
                startBtn.disabled = false;
                startBtn.textContent = 'Başla';
                return;
            }

            if (!this._faceDetectedOnce) {
                alert('Yüzün algılanamadı. Işığı artır, gözlük varsa çıkar, kameraya doğrudan bak.');
                startBtn.disabled = false;
                startBtn.textContent = 'Başla';
                return;
            }

            this.playerName = name;
            localStorage.setItem('eyeLaserNickname', name);
            await this.beginGameplay();
            startBtn.disabled = false;
            startBtn.textContent = 'Başla';
        });

        nickInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('startButton').click();
        });

        document.getElementById('replayButton')?.addEventListener('click', () => {
            this.returnToStartScreen(true);
        });

        document.getElementById('replaySameButton')?.addEventListener('click', () => {
            document.getElementById('gameOverScreen').style.display = 'none';
            this.beginGameplay();
        });

        document.addEventListener('keydown', e => {
            if (e.key.toLowerCase() === 'c') this.recalibrate();
            if (e.code === 'Space' && this.gameStarted && !this.gameOver) {
                e.preventDefault();
                if (!this.spaceHeld) {
                    this.spaceHeld = true;
                    this.mouthOpen = 1;
                    this.tryActivatePower(); // Space doğrudan güç başlatır
                }
            }
        });
        document.addEventListener('keyup', e => {
            if (e.code === 'Space') {
                this.spaceHeld = false;
                this.mouthOpen = 0;
            }
        });
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

    returnToStartScreen(clearName = false) {
        this.gameOver = true;
        this.gameStarted = false;

        document.getElementById('gameOverScreen').style.display = 'none';
        const calib = document.getElementById('calibOverlay');
        if (calib) calib.style.display = 'none';
        document.getElementById('leftEye').style.display = 'none';
        document.getElementById('rightEye').style.display = 'none';
        this.calibActive = false;
        if (this.laserTip) this.laserTip.visible = false;
        this.persistentBeams.forEach(beam => { beam.visible = false; });

        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.particles.forEach(particle => this.scene.remove(particle));
        this.kittens.forEach(kitten => this.scene.remove(kitten));
        this.enemies = [];
        this.particles = [];
        this.kittens = [];

        this.renderLeaderboard('leaderboardList');
        const overlay = document.getElementById('start-overlay');
        overlay.style.display = 'block';

        const nickInput = document.getElementById('nicknameInput');
        const startBtn = document.getElementById('startButton');
        if (startBtn && this.isReadyToStart()) {
            startBtn.disabled = false;
            startBtn.textContent = 'Başla';
        }
        if (nickInput) {
            if (clearName) nickInput.value = '';
            nickInput.focus();
            nickInput.select();
        }
    }
    
    async beginGameplay() {
        document.getElementById('start-overlay').style.display = 'none';
        document.getElementById('gameOverScreen').style.display = 'none';
        document.getElementById('leftEye').style.display = 'block';
        document.getElementById('rightEye').style.display = 'block';
        document.getElementById('playerName').textContent = this.playerName;
        document.getElementById('milestoneBanner')?.classList.remove('show');
        document.getElementById('nearMissOverlay')?.classList.remove('show');

        // Yeni tur: lazer ucu başlat ekranı merkezinde (0,0 dünya)
        this.isCalibrated = false;
        this._detectTs = 0;
        this.gaze = { x: 0.5, y: 0.5 };
        this.smoothGaze = { x: 0.5, y: 0.5 };
        this.leftEye = { x: 0.45, y: 0.38 };
        this.rightEye = { x: 0.55, y: 0.38 };
        this.smoothLeftEye = { x: 0.45, y: 0.38 };
        this.smoothRightEye = { x: 0.55, y: 0.38 };

        this.laserTip.visible = true;
        this.persistentBeams.forEach(beam => { beam.visible = true; });
        this.gameStarted = true;
        this.gameOver = false;
        this.calibActive = false;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.lastKillAt = 0;
        this.wave = 1;
        this.bossesDefeated = 0;
        this.powerUsed = 0;
        this.nextBossAt = 80;
        this.reachedMilestones = new Set();
        this.lastEnemySpawn = Date.now() + 600; // Hemen gelsinler
        this.enemySpawnInterval = 1100;
        this.mouthOpen = 0;
        this.smoothMouth = 0;
        this.mouthWasOpen = false;
        this.spaceHeld = false;
        this.powerCharges = this.maxPowerCharges;
        this.powerActiveUntil = 0;
        this.updatePowerUI();
        this.updateComboUI();
        this.updateWaveUI();
        
        this.enemies.forEach(enemy => this.scene.remove(enemy));
        this.lasers.forEach(laser => this.scene.remove(laser));
        this.particles.forEach(particle => this.scene.remove(particle));
        this.kittens.forEach(kitten => this.scene.remove(kitten));
        this.shockwaves.forEach(s => this.scene.remove(s));
        this.enemies = [];
        this.lasers = [];
        this.particles = [];
        this.kittens = [];
        this.shockwaves = [];
        
        document.getElementById('score').textContent = this.score;
        
        this.createKittens();
        this.updateKittenHpUI();
        this.syncLaserAim();
        this.runIntroTips();
        // İlk baskı: hemen 2 hayalet
        this.spawnEnemy();
        this.spawnEnemy();
        this.lastEnemySpawn = Date.now();
        if (typeof startGameMusic === 'function') {
            try { await startGameMusic(); } catch (e) {}
        }
        if (typeof setMusicIntensity === 'function') setMusicIntensity(0, false, false);
        this.startFaceDetection();
    }

    // Geriye uyumluluk
    async startGame() {
        return this.beginGameplay();
    }
    
    async startFaceDetection() {
        if (this._detectRunning) return;
        this._detectRunning = true;
        const detect = async () => {
            try {
                await this.runFaceDetectionStep();
            } catch (e) {
                console.warn('face detect:', e);
            }
            requestAnimationFrame(detect);
        };
        detect();
    }
    
    spawnEnemy(forceBoss = false) {
        if (!forceBoss && this.score >= this.nextBossAt) {
            forceBoss = true;
            this.nextBossAt += 50;
        }
        const spec = this.pickEnemyType(forceBoss);
        const size = spec.size;
        const enemy = new THREE.Mesh(
            new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({ 
                map: this.ghostTexture, 
                transparent: true, 
                alphaTest: 0.1,
                color: spec.color.clone()
            })
        );
        
        const side = Math.floor(Math.random() * 3);
        const margin = 100 + (forceBoss ? 40 : 0);
        const positions = [
            [(Math.random() - 0.5) * window.innerWidth, -window.innerHeight / 2 - margin],
            [window.innerWidth / 2 + margin, (Math.random() - 0.5) * window.innerHeight],
            [-window.innerWidth / 2 - margin, (Math.random() - 0.5) * window.innerHeight]
        ];
        
        [enemy.position.x, enemy.position.y] = positions[side];
        enemy.position.z = forceBoss ? 5 : 0;
        
        const initialY = enemy.position.y;
        const baseSpeed = this.getEnemySpeed() * spec.speedMult;
        
        enemy.userData = { 
            type: spec.type,
            points: spec.points,
            health: spec.health,
            maxHealth: spec.health,
            dying: false,
            deathTime: 0,
            deathDuration: forceBoss ? 1.1 : 0.75,
            speed: baseSpeed,
            target: null,
            initialY: initialY,
            bobSpeed: 6 + Math.random() * 4,
            bobAmount: (forceBoss ? 20 : 40) + Math.random() * 20,
            rotationSpeed: 4 + Math.random() * 3,
            rotationAmount: (25 + Math.random() * 10) * (Math.PI / 180),
            timeOffset: Math.random() * Math.PI * 2,
            hitFlash: 0,
            lastBeamHit: 0,
            baseColor: spec.color.clone()
        };
        
        this.scene.add(enemy);
        this.enemies.push(enemy);
        if (forceBoss) {
            this.showMilestone('BOSS HAYALET GELİYOR!');
            if (typeof playBossAppearSound === 'function') playBossAppearSound();
        }
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
        // Eski ateş-unut sistemi kaldırıldı; kalıcı ışınlar kullanılıyor
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
        const { tipX, tipY } = this.getAimPoints();
        this.syncLaserAim();
        this.createParticles(tipX, tipY, 2);
        this.checkBeamHits(true);
    }

    pointToSegmentDistance(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001) {
            return Math.hypot(px - x1, py - y1);
        }
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + t * dx;
        const projY = y1 + t * dy;
        return Math.hypot(px - projX, py - projY);
    }

    applyGhostDamage(enemy, amount) {
        if (enemy.userData.dying) return;

        enemy.userData.health -= amount;
        enemy.userData.hitFlash = 0.1;
        enemy.userData.lastBeamHit = Date.now();

        const healthRatio = Math.max(0, enemy.userData.health / enemy.userData.maxHealth);
        const base = enemy.userData.baseColor || new THREE.Color(1, 1, 1);
        enemy.material.color.setRGB(
            base.r,
            base.g * (0.45 + healthRatio * 0.55),
            base.b * (0.55 + healthRatio * 0.45)
        );
        const sizeScale = (enemy.userData.type === 'boss' ? 1 : 1) * (1 + (1 - healthRatio) * 0.15);
        enemy.scale.setScalar(sizeScale);
        this.createParticles(enemy.position.x, enemy.position.y, 4);

        if (enemy.userData.health <= 0) {
            this.startGhostDeath(enemy);
        }
    }

    checkBeamHits(force = false) {
        const { tipX, tipY, leftX, leftY, rightX, rightY } = this.getAimPoints();
        const power = this.getMouthPower();
        const widthScale = this.getLaserWidthScale();
        const beamWidth = 48 * widthScale;
        const tipRadius = 70 * (0.9 + widthScale * 0.5);
        const now = Date.now();

        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            if (enemy.userData.dying) continue;

            const dLeft = this.pointToSegmentDistance(
                enemy.position.x, enemy.position.y, leftX, leftY, tipX, tipY
            );
            const dRight = this.pointToSegmentDistance(
                enemy.position.x, enemy.position.y, rightX, rightY, tipX, tipY
            );
            const dist = Math.min(dLeft, dRight);

            if (dist < beamWidth) {
                const lastHit = enemy.userData.lastBeamHit || 0;
                if (force || now - lastHit >= this.beamHitCooldownMs) {
                    const tipBonus = Math.hypot(enemy.position.x - tipX, enemy.position.y - tipY) < tipRadius ? 6 : 0;
                    // Güç lazeri: belirgin hasar artışı
                    const mouthBonus = power > 0 ? 28 : 0;
                    const baseDmg = power > 0 ? 22 : 12;
                    this.applyGhostDamage(enemy, baseDmg + tipBonus + mouthBonus);
                }
            }
        }
    }
    
    checkKittenCollisions() {
        let nearMiss = false;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            if (enemy.userData.dying) continue;
            
            for (let j = 0; j < this.kittens.length; j++) {
                const kitten = this.kittens[j];
                
                if (kitten.userData.alive) {
                    const distance = Math.sqrt(
                        (enemy.position.x - kitten.position.x) ** 2 + 
                        (enemy.position.y - kitten.position.y) ** 2
                    );

                    if (distance < 120) nearMiss = true;
                    
                    if (distance < 50) {
                        if (kitten.userData.hitCooldown > 0) break;

                        kitten.userData.hp -= 1;
                        kitten.userData.hitCooldown = 0.9;
                        kitten.material.opacity = 0.45;
                        this.createParticles(kitten.position.x, kitten.position.y, 12);
                        playKittenAlertSound();
                        this.updateKittenHpUI();

                        // Hayalet kediye çarpınca yok olur
                        this.scene.remove(enemy);
                        this.enemies.splice(i, 1);
                        this.createParticles(enemy.position.x, enemy.position.y, 8);

                        if (kitten.userData.hp <= 0) {
                            kitten.userData.alive = false;
                            kitten.visible = false;
                            this.createParticles(kitten.position.x, kitten.position.y, 18);
                        }

                        const aliveKittens = this.kittens.filter(k => k.userData.alive).length;
                        if (aliveKittens === 0) {
                            this.triggerGameOver();
                        } else if (aliveKittens === 1) {
                            this.showMilestone('SON KEDİ! Her şey sana bağlı!');
                            if (typeof setMusicIntensity === 'function') {
                                setMusicIntensity(this.score, this.isPowerActive(), true);
                            }
                        }
                        break;
                    }
                }
            }
        }
        document.getElementById('nearMissOverlay')?.classList.toggle('show', nearMiss && this.gameStarted && !this.gameOver);
    }
    
    triggerGameOver() {
        this.gameOver = true;
        this.gameStarted = false;
        (this._introTimers || []).forEach(clearTimeout);
        this._introTimers = [];

        document.getElementById('leftEye').style.display = 'none';
        document.getElementById('rightEye').style.display = 'none';
        this.laserTip.visible = false;
        this.persistentBeams.forEach(beam => { beam.visible = false; });
        document.getElementById('nearMissOverlay')?.classList.remove('show');
        
        document.getElementById('finalScore').textContent = this.score;

        const name = this.playerName || 'Kurtarıcı';
        const title = this.getTitleForScore(this.score);
        const titleEl = document.getElementById('runTitle');
        if (titleEl) titleEl.textContent = title;

        let heroMsg = `${name}, bu tur bitti — ama kediler hâlâ seni bekliyor.`;
        if (this.score >= 100) heroMsg = `${name}, efsane bir savunma yaptın. Kediler gurur duyuyor.`;
        else if (this.score >= 50) heroMsg = `${name}, 50+ hayalet! Gerçek bir kurtarıcıydın.`;
        else if (this.score >= 25) heroMsg = `${name}, iyi savundun. Bir tur daha — kediler umutlu.`;
        else if (this.score >= 10) heroMsg = `${name}, ısındın. Ağzını açıp güç lazerini dene!`;
        document.getElementById('gameOverHeroMsg').textContent = heroMsg;

        const summary = document.getElementById('runSummary');
        if (summary) {
            summary.innerHTML = `
                <div><strong>Unvan:</strong> ${title}</div>
                <div><strong>Dalga:</strong> ${this.wave}</div>
                <div><strong>En uzun combo:</strong> x${this.maxCombo}</div>
                <div><strong>Boss yenildi:</strong> ${this.bossesDefeated}</div>
                <div><strong>Güç kullanıldı:</strong> ${this.powerUsed}/3</div>
            `;
        }

        this.saveScoreToLeaderboard(name, this.score);
        this.renderLeaderboard('gameOverLeaderboard', name);
        this.renderLeaderboard('leaderboardList', name);

        document.getElementById('gameOverScreen').style.display = 'block';
    }

    startGhostDeath(enemy) {
        if (enemy.userData.dying) return;
        enemy.userData.dying = true;
        enemy.userData.deathTime = 0;
        enemy.userData.baseScale = enemy.scale.x;
        playGhostPopSound();
        this.createGhostBurst(enemy.position.x, enemy.position.y, 28);
    }

    createGhostBurst(x, y, count = 24) {
        const positions = new Float32Array(count * 3);
        const lives = new Float32Array(count);
        const velocities = new Float32Array(count * 3);
        const indices = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            const idx = i * 3;
            positions[idx] = x;
            positions[idx + 1] = y;
            positions[idx + 2] = 2;
            lives[i] = 1;
            indices[i] = i;
            const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
            const speed = 120 + Math.random() * 280;
            velocities[idx] = Math.cos(angle) * speed;
            velocities[idx + 1] = Math.sin(angle) * speed + 80;
            velocities[idx + 2] = (Math.random() - 0.5) * 50;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('life', new THREE.BufferAttribute(lives, 1));
        geometry.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3));
        geometry.setAttribute('sparkIndex', new THREE.BufferAttribute(indices, 1));

        const material = this.particleMaterial.clone();
        material.uniforms = {
            time: { value: 0 },
            size: { value: 28 }
        };
        // Pembe hayalet patlaması
        material.fragmentShader = `
            uniform float time;
            varying float vLife, vIndex;
            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                if (length(center) > 0.5) discard;
                float alpha = (1.0 - length(center) * 1.5) * vLife * 1.6;
                vec3 pink = vec3(1.0, 0.25, 0.85);
                vec3 white = vec3(1.0, 0.85, 1.0);
                vec3 color = mix(pink, white, vLife) * (1.2 + sin(time * 30.0 + vIndex) * 0.3);
                gl_FragColor = vec4(color, alpha);
            }`;
        material.needsUpdate = true;

        const particles = new THREE.Points(geometry, material);
        particles.userData = { life: 1.0, maxLife: 1.0, lives, isGhostBurst: true };
        this.scene.add(particles);
        this.particles.push(particles);
    }

    finishGhostDeath(enemy, index) {
        const isBoss = enemy.userData.type === 'boss';
        const points = enemy.userData.points || 1;
        this.scene.remove(enemy);
        if (enemy.material) enemy.material.dispose();
        this.enemies.splice(index, 1);
        this.registerKill(points, isBoss);
    }
    
    checkHit(x, y) {
        // Eski tek nokta vuruşu kaldırıldı; ışın boyunca checkBeamHits kullanılıyor
    }
    
    update(deltaTime) {
        if (this.gameOver) return;
        
        const now = Date.now();
        const time = now * 0.001;

        // Işın ve yuvarlak her kare aynı hedefe kilitli
        this.syncLaserAim();
        this.checkBeamHits(false);
        // Güç süresi / hak UI her kare güncellensin
        if (this.isPowerActive() || this._powerUiWasActive) {
            this.updatePowerUI();
            this._powerUiWasActive = this.isPowerActive();
        }
        
        // Update kitten positions to follow face
        this.updateKittenPositions();
        
        // Spawn — ekranda az hayalet kaldıysa hemen yenile (ölene kadar boşluk olmasın)
        const liveEnemies = this.enemies.filter(e => !e.userData.dying).length;
        const maxLive = 14;
        const due = now - this.lastEnemySpawn > this.getSpawnInterval();
        const starvation = liveEnemies < 2 && now - this.lastEnemySpawn > 500;
        if ((due || starvation) && liveEnemies < maxLive) {
            this.spawnEnemy();
            if (liveEnemies + 1 < maxLive && Math.random() < this.getDoubleSpawnChance()) {
                this.spawnEnemy();
            }
            this.lastEnemySpawn = now;
            this.enemySpawnInterval = this.getSpawnInterval();
        }
        
        // Kıvılcım nabzı
        if (now - this.lastLaserTime > 180) {
            this.fireLaser();
            this.lastLaserTime = now;
        }
        
        // Check kitten collisions
        this.checkKittenCollisions();

        // Kedi hasar cooldown + opacity
        this.kittens.forEach(kitten => {
            if (!kitten.userData.alive) return;
            if (kitten.userData.hitCooldown > 0) {
                kitten.userData.hitCooldown -= deltaTime;
                kitten.material.opacity = 0.4 + Math.abs(Math.sin(now * 0.02)) * 0.5;
            } else {
                kitten.material.opacity = 1;
            }
        });

        // Combo zaman aşımı
        if (this.combo > 0 && now - this.lastKillAt > this.comboWindowMs) {
            this.combo = 0;
            this.updateComboUI();
        }

        // Şok dalgası halkaları
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const ring = this.shockwaves[i];
            ring.userData.life -= deltaTime;
            const t = 1 - ring.userData.life / ring.userData.maxLife;
            const r = 20 + t * ring.userData.maxR;
            ring.scale.setScalar(r / 30);
            ring.material.opacity = Math.max(0, 1 - t);
            if (ring.userData.life <= 0) {
                this.scene.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
                this.shockwaves.splice(i, 1);
            }
        }
        
        // Update enemies with bobbing and rotation - they now target kittens
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];

            // Ölüm animasyonu: dön, şiş, sonra eriyip kaybol
            if (enemy.userData.dying) {
                enemy.userData.deathTime += deltaTime;
                const t = Math.min(1, enemy.userData.deathTime / enemy.userData.deathDuration);
                const ease = t * t;

                enemy.rotation.z += deltaTime * (18 + ease * 22);
                enemy.position.y += deltaTime * 90;

                const pop = Math.sin(t * Math.PI);
                const base = enemy.userData.baseScale || 1;
                enemy.scale.setScalar(base * (1 + pop * 0.85) * (1 - ease * 0.95));
                enemy.material.opacity = 1 - ease;
                enemy.material.color.setRGB(1, 0.3 + (1 - t) * 0.5, 0.9);

                if (t > 0.35 && !enemy.userData.burstDone) {
                    enemy.userData.burstDone = true;
                    this.createGhostBurst(enemy.position.x, enemy.position.y, 18);
                }

                if (t >= 1) {
                    this.finishGhostDeath(enemy, i);
                }
                continue;
            }

            if (enemy.userData.hitFlash > 0) {
                enemy.userData.hitFlash -= deltaTime;
                const shake = enemy.userData.hitFlash * 40;
                enemy.position.x += (Math.random() - 0.5) * shake;
                enemy.position.y += (Math.random() - 0.5) * shake;
            }

            const closestKitten = this.findClosestKitten(enemy.position);
            
            if (closestKitten) {
                const dx = closestKitten.position.x - enemy.position.x;
                const dy = closestKitten.position.y - enemy.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 5) {
                    enemy.position.x += (dx / distance) * enemy.userData.speed * deltaTime;
                    enemy.position.y += (dy / distance) * enemy.userData.speed * deltaTime;
                }
            }
            
            const bobOffset = Math.sin(time * enemy.userData.bobSpeed + enemy.userData.timeOffset) * enemy.userData.bobAmount;
            enemy.position.y += bobOffset * deltaTime;
            
            const rotationOffset = Math.sin(time * enemy.userData.rotationSpeed + enemy.userData.timeOffset) * enemy.userData.rotationAmount;
            enemy.rotation.z = rotationOffset;
        }
        
        // Kalıcı lazer ışınlarının nabız/animasyonu
        const pulse = 1.05 + 0.12 * Math.sin(time * 18.0);
        this.persistentBeams.forEach(beam => {
            const layers = beam.userData.layers || [];
            layers.forEach(({ mat }) => {
                if (mat.uniforms) {
                    mat.uniforms.time.value = time;
                    mat.uniforms.intensity.value = pulse * (mat.uniforms.isCore.value > 0.5 ? 1.3 : 1.15);
                }
            });
        });
        
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const particles = this.particles[i];
            particles.userData.life -= deltaTime;
            if (particles.material?.uniforms?.time) {
                particles.material.uniforms.time.value = time;
            }
            const lives = particles.userData.lives;
            for (let j = 0; j < lives.length; j++) {
                lives[j] -= deltaTime * (0.8 + Math.random() * 1.6);
                lives[j] = Math.max(0, lives[j]);
            }
            particles.geometry.attributes.life.needsUpdate = true;
            if (particles.userData.life <= 0) {
                this.scene.remove(particles);
                particles.geometry?.dispose();
                if (particles.userData.isGhostBurst && particles.material) {
                    particles.material.dispose();
                }
                this.particles.splice(i, 1);
            }
        }
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const time = Date.now() * 0.001;
        if (this.laserMaterial?.uniforms) this.laserMaterial.uniforms.time.value = time;
        if (this.particleMaterial?.uniforms) this.particleMaterial.uniforms.time.value = time;
        if (this.laserTipMaterial?.uniforms) this.laserTipMaterial.uniforms.time.value = time;
        
        if (this.gameStarted) {
            try {
                this.update(0.016);
                if (!this.detectionEnabled) this.updateEyeUI();
            } catch (e) {
                console.warn('update hatası (oyun devam):', e);
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('load', () => new LaserGame());
