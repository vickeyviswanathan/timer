/* =========================================================
   Glide Brands — Offline Event Timer & Buzzer
   100% Offline JavaScript (Web Audio API Buzzer & Ticks)
   ========================================================= */
(() => {
    'use strict';

    const CIRCUMFERENCE = 2 * Math.PI * 144; // r = 144 => 904.78

    // ---------- State ----------
    let totalSeconds = 60;
    let remainingMs = 60 * 1000;
    let running = false;
    let soundOn = true;
    let rafId = null;
    let lastTimestamp = 0;
    let lastWholeSecond = 60;

    // ---------- DOM ----------
    const $ = (sel, root = document) => root.querySelector(sel);
    const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

    const el = {
        flashOverlay: $('#flash-overlay'),
        buzzerBtn: $('#buzzer-btn'),
        soundToggle: $('#sound-toggle'),
        fullscreenToggle: $('#fullscreen-toggle'),
        timerCard: $('#timer-card'),
        ringFill: $('#ring-fill'),
        statusBadge: $('#status-badge'),
        timeDisplay: $('#time-display'),
        totalLabel: $('#total-label'),
        startPauseBtn: $('#start-pause-btn'),
        resetBtn: $('#reset-btn'),
        plus15Btn: $('#plus-15-btn'),
        minus15Btn: $('#minus-15-btn'),
        presetBtns: $$('.preset-btn'),
        customForm: $('#custom-form'),
        customMin: $('#custom-min'),
        customSec: $('#custom-sec')
    };

    // =========================================================
    // Loud Offline Buzzer & Countdown Sound Engine (Web Audio API)
    // =========================================================
    let audioCtx = null;

    function unlockAudio() {
        if (!soundOn) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state !== 'running') audioCtx.resume();
        } catch { /* ignore */ }
    }

    const sfx = {
        // Crisp tick for countdown seconds 10..4
        tick(urgent = false) {
            if (!soundOn) return;
            unlockAudio();
            if (!audioCtx || audioCtx.state !== 'running') return;
            const t = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = urgent ? 'square' : 'triangle';
            osc.frequency.setValueAtTime(urgent ? 980 : 720, t);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.exponentialRampToValueAtTime(urgent ? 0.25 : 0.14, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + (urgent ? 0.14 : 0.08));
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.16);
        },

        // Short chime when starting timer
        startChime() {
            if (!soundOn) return;
            unlockAudio();
            if (!audioCtx || audioCtx.state !== 'running') return;
            [523.25, 783.99].forEach((freq, idx) => {
                const t = audioCtx.currentTime + idx * 0.07;
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.001, t);
                gain.gain.exponentialRampToValueAtTime(0.18, t + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
                osc.connect(gain).connect(audioCtx.destination);
                osc.start(t);
                osc.stop(t + 0.22);
            });
        },

        // LOUD Multi-Harmonic Game Show Arena Buzzer Horn!
        buzzer() {
            if (!soundOn) return;
            unlockAudio();
            if (!audioCtx || audioCtx.state !== 'running') return;

            const now = audioCtx.currentTime;
            // Two blasts: 0.0s -> 0.45s, then 0.52s -> 1.45s
            const blasts = [
                { start: 0, dur: 0.42 },
                { start: 0.5, dur: 0.95 }
            ];

            blasts.forEach(({ start, dur }) => {
                const t0 = now + start;
                // Layered sawtooth + square horn frequencies for a rich, unmistakable arena buzzer
                [110, 146.83, 220, 293.66].forEach((freq, i) => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = i % 2 === 0 ? 'sawtooth' : 'square';
                    osc.frequency.setValueAtTime(freq, t0);
                    osc.frequency.linearRampToValueAtTime(freq * 0.96, t0 + dur);

                    gain.gain.setValueAtTime(0.001, t0);
                    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
                    gain.gain.setValueAtTime(0.2, t0 + dur - 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

                    osc.connect(gain).connect(audioCtx.destination);
                    osc.start(t0);
                    osc.stop(t0 + dur + 0.03);
                });
            });
        }
    };

    function triggerBuzzerEffect() {
        sfx.buzzer();
        el.flashOverlay.classList.remove('active');
        void el.flashOverlay.offsetWidth;
        el.flashOverlay.classList.add('active');
    }

    // =========================================================
    // Formatting & Display
    // =========================================================
    function formatMMSS(ms) {
        const totalSec = Math.ceil(Math.max(0, ms) / 1000);
        const mins = Math.floor(totalSec / 60);
        const secs = totalSec % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    function describeDuration(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        if (m > 0 && s === 0) return `${m} Minute${m > 1 ? 's' : ''} Round`;
        if (m === 0) return `${s} Seconds Round`;
        return `${m}m ${s}s Round`;
    }

    function updateUI() {
        const secLeft = Math.ceil(Math.max(0, remainingMs) / 1000);
        el.timeDisplay.textContent = formatMMSS(remainingMs);
        el.totalLabel.textContent = describeDuration(totalSeconds);

        // Progress ring offset
        const fraction = totalSeconds > 0 ? Math.max(0, Math.min(1, remainingMs / (totalSeconds * 1000))) : 0;
        const offset = CIRCUMFERENCE * (1 - fraction);
        el.ringFill.style.strokeDashoffset = `${offset}`;

        // State & Urgency Colors
        if (remainingMs <= 0) {
            el.timerCard.dataset.state = 'timesup';
            el.statusBadge.textContent = "🚨 TIME'S UP! 🚨";
            el.startPauseBtn.textContent = '▶ RESTART';
            el.startPauseBtn.classList.remove('running');
        } else if (running) {
            if (secLeft <= 10) {
                el.timerCard.dataset.state = 'danger';
                el.statusBadge.textContent = 'FINAL SECONDS!';
            } else if (secLeft <= 30 && totalSeconds > 30) {
                el.timerCard.dataset.state = 'warning';
                el.statusBadge.textContent = 'HURRY UP!';
            } else {
                el.timerCard.dataset.state = 'running';
                el.statusBadge.textContent = 'RUNNING';
            }
            el.startPauseBtn.textContent = '⏸ PAUSE';
            el.startPauseBtn.classList.add('running');
        } else {
            el.timerCard.dataset.state = 'idle';
            el.statusBadge.textContent = remainingMs < totalSeconds * 1000 ? 'PAUSED' : 'READY';
            el.startPauseBtn.textContent = remainingMs < totalSeconds * 1000 ? '▶ RESUME' : '▶ START';
            el.startPauseBtn.classList.remove('running');
        }
    }

    // =========================================================
    // Timer Loop (High-Precision requestAnimationFrame)
    // =========================================================
    function tickFrame(now) {
        if (!running) return;
        const delta = now - lastTimestamp;
        lastTimestamp = now;
        remainingMs = Math.max(0, remainingMs - delta);

        const currentWholeSec = Math.ceil(remainingMs / 1000);
        if (currentWholeSec !== lastWholeSecond) {
            lastWholeSecond = currentWholeSec;
            if (currentWholeSec > 0 && currentWholeSec <= 10) {
                sfx.tick(currentWholeSec <= 3);
            }
        }

        if (remainingMs <= 0) {
            running = false;
            remainingMs = 0;
            updateUI();
            triggerBuzzerEffect();
            return;
        }

        updateUI();
        rafId = requestAnimationFrame(tickFrame);
    }

    function startTimer() {
        unlockAudio();
        if (remainingMs <= 0) {
            remainingMs = totalSeconds * 1000;
        }
        running = true;
        lastTimestamp = performance.now();
        lastWholeSecond = Math.ceil(remainingMs / 1000);
        sfx.startChime();
        updateUI();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tickFrame);
    }

    function pauseTimer() {
        running = false;
        cancelAnimationFrame(rafId);
        updateUI();
    }

    function toggleStartPause() {
        if (running) pauseTimer();
        else startTimer();
    }

    function resetTimer() {
        running = false;
        cancelAnimationFrame(rafId);
        remainingMs = totalSeconds * 1000;
        lastWholeSecond = totalSeconds;
        updateUI();
    }

    function setDuration(seconds, highlightPreset = true) {
        const cleanSec = Math.max(1, Math.min(5999, Math.round(seconds)));
        running = false;
        cancelAnimationFrame(rafId);
        totalSeconds = cleanSec;
        remainingMs = cleanSec * 1000;
        lastWholeSecond = cleanSec;

        el.presetBtns.forEach(btn => {
            const match = highlightPreset && Number(btn.dataset.seconds) === cleanSec;
            btn.classList.toggle('active', match);
        });

        updateUI();
    }

    function adjustLiveSeconds(deltaSec) {
        const nextMs = Math.max(1000, Math.min(5999 * 1000, remainingMs + deltaSec * 1000));
        remainingMs = nextMs;
        if (remainingMs > totalSeconds * 1000) {
            totalSeconds = Math.ceil(remainingMs / 1000);
        }
        lastWholeSecond = Math.ceil(remainingMs / 1000);
        updateUI();
    }

    // =========================================================
    // Event Listeners & Keyboard Shortcuts
    // =========================================================
    el.startPauseBtn.addEventListener('click', toggleStartPause);
    el.resetBtn.addEventListener('click', resetTimer);
    el.plus15Btn.addEventListener('click', () => adjustLiveSeconds(15));
    el.minus15Btn.addEventListener('click', () => adjustLiveSeconds(-15));

    el.presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const sec = Number(btn.dataset.seconds) || 60;
            setDuration(sec, true);
        });
    });

    el.customForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const mins = Math.max(0, parseInt(el.customMin.value, 10) || 0);
        const secs = Math.max(0, parseInt(el.customSec.value, 10) || 0);
        const total = mins * 60 + secs;
        if (total <= 0) {
            el.customSec.value = '10';
            setDuration(10, false);
        } else {
            setDuration(total, false);
        }
    });

    el.buzzerBtn.addEventListener('click', triggerBuzzerEffect);

    el.soundToggle.addEventListener('click', () => {
        soundOn = !soundOn;
        if (soundOn) unlockAudio();
        el.soundToggle.setAttribute('aria-pressed', String(soundOn));
        el.soundToggle.textContent = soundOn ? '🔊' : '🔇';
    });

    function toggleFullscreen() {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    el.fullscreenToggle.addEventListener('click', toggleFullscreen);

    document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (['input', 'textarea', 'select'].includes(tag)) return;

        if (e.code === 'Space') {
            e.preventDefault();
            toggleStartPause();
        } else if (e.key === 'r' || e.key === 'R') {
            resetTimer();
        } else if (e.key === 'b' || e.key === 'B') {
            triggerBuzzerEffect();
        } else if (e.key === 'f' || e.key === 'F') {
            toggleFullscreen();
        }
    });

    // Init
    updateUI();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
})();
