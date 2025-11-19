// sound.js
// Import Tone.js
const toneScript = document.createElement('script');
toneScript.src = "https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js";
document.head.appendChild(toneScript);

// Sound player setup
let popSynth, dangerSynth;

toneScript.onload = () => {
    // Retro Pop Synth for ghost hit
    popSynth = new Tone.MembraneSynth().toDestination();
    popSynth.volume.value = -4;

    // Danger Alert Synth for kitten capture
    dangerSynth = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        envelope: {
            attack: 0.001,
            decay: 0.3,
            sustain: 0.1,
            release: 0.5
        },
        filterEnvelope: {
            attack: 0.01,
            decay: 0.2,
            sustain: 0.2,
            release: 0.4,
            baseFrequency: 200,
            octaves: 4
        }
    }).toDestination();
    dangerSynth.volume.value = -2; // Louder and more alarming
};

// Play pop when ghost is hit
function playGhostPopSound() {
    if (popSynth) {
        popSynth.triggerAttackRelease("g3", "64n");
    }
}

// Play alert when kitten disappears
function playKittenAlertSound() {
    if (dangerSynth) {
        dangerSynth.triggerAttackRelease("C5", "16n");
        setTimeout(() => dangerSynth.triggerAttackRelease("EB4", "16n"), 100);
        setTimeout(() => dangerSynth.triggerAttackRelease("C4", "16n"), 200);
    }
}
