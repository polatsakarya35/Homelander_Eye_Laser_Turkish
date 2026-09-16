// sound.js — efektler + kahramanlık müziği (Tone.js)

let popSynth, dangerSynth, milestoneSynth, comboSynth, bossSynth;
let musicParts = [];
let musicReady = false;
let musicPlaying = false;
let baseBpm = 108;

function initAudioEngine() {
    if (musicReady || typeof Tone === 'undefined') return;

    popSynth = new Tone.MembraneSynth({
        pitchDecay: 0.02,
        octaves: 2,
        oscillator: { type: 'sine' },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 }
    }).toDestination();
    popSynth.volume.value = -6;

    dangerSynth = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.1, release: 0.5 },
        filterEnvelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.2,
            release: 0.4,
            baseFrequency: 200,
            octaves: 4
        }
    }).toDestination();
    dangerSynth.volume.value = -4;

    milestoneSynth = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.2, release: 0.6 }
    }).toDestination();
    milestoneSynth.volume.value = -8;

    comboSynth = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }
    }).toDestination();
    comboSynth.volume.value = -10;

    bossSynth = new Tone.MonoSynth({
        oscillator: { type: 'sawtooth' },
        envelope: { attack: 0.05, decay: 0.4, sustain: 0.2, release: 0.6 }
    }).toDestination();
    bossSynth.volume.value = -8;

    const masterGain = new Tone.Gain(0.22).toDestination();
    const bassFilter = new Tone.Filter(420, 'lowpass').connect(masterGain);
    const leadDelay = new Tone.FeedbackDelay('8n', 0.22).connect(masterGain);
    leadDelay.wet.value = 0.18;

    const bass = new Tone.MonoSynth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 }
    }).connect(bassFilter);
    bass.volume.value = -10;

    const lead = new Tone.Synth({
        oscillator: { type: 'triangle' },
        envelope: { attack: 0.005, decay: 0.15, sustain: 0.15, release: 0.25 }
    }).connect(leadDelay);
    lead.volume.value = -12;

    const pad = new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: 'sine' },
        envelope: { attack: 0.4, decay: 0.3, sustain: 0.5, release: 1.2 }
    }).connect(masterGain);
    pad.volume.value = -18;

    const arp = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.001, decay: 0.08, sustain: 0, release: 0.05 }
    }).connect(masterGain);
    arp.volume.value = -16;

    const bassNotes = ['A2', 'A2', 'E2', 'E2', 'F2', 'F2', 'G2', 'G2'];
    const leadNotes = ['A4', 'C5', 'E5', 'A5', 'G5', 'E5', 'C5', 'B4', 'A4', 'E5', 'D5', 'C5', 'B4', 'C5', 'E5', 'A4'];
    const padChords = [['A3', 'C4', 'E4'], ['E3', 'G3', 'B3'], ['F3', 'A3', 'C4'], ['G3', 'B3', 'D4']];
    const arpNotes = ['A5', 'E5', 'C5', 'E5', 'G5', 'E5', 'B4', 'E5'];

    const bassLoop = new Tone.Sequence((time, note) => {
        bass.triggerAttackRelease(note, '8n', time);
    }, bassNotes, '4n');

    const leadLoop = new Tone.Sequence((time, note) => {
        lead.triggerAttackRelease(note, '16n', time);
    }, leadNotes, '8n');

    const padLoop = new Tone.Sequence((time, chord) => {
        pad.triggerAttackRelease(chord, '2n', time);
    }, padChords, '1m');

    const arpLoop = new Tone.Sequence((time, note) => {
        arp.triggerAttackRelease(note, '32n', time);
    }, arpNotes, '8n');

    musicParts = [bassLoop, leadLoop, padLoop, arpLoop];
    musicReady = true;
}

async function startGameMusic() {
    if (typeof Tone === 'undefined') return;
    initAudioEngine();
    await Tone.start();
    Tone.Transport.bpm.value = baseBpm;
    if (!musicPlaying) {
        musicParts.forEach(p => p.start(0));
        Tone.Transport.start();
        musicPlaying = true;
    }
}

function setMusicIntensity(score, powerActive, lastKitten) {
    if (!musicPlaying || typeof Tone === 'undefined') return;
    let bpm = baseBpm + Math.min(40, Math.floor(score / 5));
    if (powerActive) bpm += 12;
    if (lastKitten) bpm += 8;
    Tone.Transport.bpm.rampTo(bpm, 0.4);
}

function stopGameMusic() {
    if (!musicPlaying) return;
    try {
        Tone.Transport.stop();
        Tone.Transport.cancel();
        musicParts.forEach(p => p.stop());
    } catch (e) {}
    musicPlaying = false;
}

function playGhostPopSound() {
    if (!popSynth) initAudioEngine();
    if (popSynth) popSynth.triggerAttackRelease('G3', '64n');
}

function playKittenAlertSound() {
    if (!dangerSynth) initAudioEngine();
    if (!dangerSynth) return;
    dangerSynth.triggerAttackRelease('C5', '16n');
    setTimeout(() => dangerSynth.triggerAttackRelease('Eb4', '16n'), 100);
    setTimeout(() => dangerSynth.triggerAttackRelease('C4', '16n'), 200);
}

function playMilestoneSound() {
    if (!milestoneSynth) initAudioEngine();
    if (!milestoneSynth) return;
    const now = Tone.now();
    milestoneSynth.triggerAttackRelease(['A4', 'C5', 'E5'], '8n', now);
    milestoneSynth.triggerAttackRelease(['C5', 'E5', 'A5'], '8n', now + 0.15);
}

function playComboSound(level) {
    if (!comboSynth) initAudioEngine();
    if (!comboSynth) return;
    const notes = ['C5', 'E5', 'G5', 'B5', 'D6', 'F6'];
    try {
        comboSynth.triggerAttackRelease(notes[Math.min(level, notes.length - 1)], '32n', Tone.now() + 0.01);
    } catch (e) {}
}

function playBossAppearSound() {
    if (!bossSynth) initAudioEngine();
    try {
        if (bossSynth) bossSynth.triggerAttackRelease('A2', '4n', Tone.now() + 0.01);
    } catch (e) {}
}

function playBossDefeatSound() {
    if (!milestoneSynth) initAudioEngine();
    if (!milestoneSynth) return;
    try {
        const now = Tone.now() + 0.01;
        milestoneSynth.triggerAttackRelease(['E4', 'G4', 'B4'], '8n', now);
        milestoneSynth.triggerAttackRelease(['G4', 'B4', 'E5'], '8n', now + 0.18);
        milestoneSynth.triggerAttackRelease(['B4', 'E5', 'G5'], '4n', now + 0.36);
    } catch (e) {}
}
