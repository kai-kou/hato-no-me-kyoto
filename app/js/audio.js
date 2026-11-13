// Procedural soundscape (WebAudio, no samples): river, city air, wind, coos, wing beats, pecks, splashes.
export class Sound {
  constructor() { this.ctx = null; this.on = false; this.muted = false; this.vol = 0.85; }
  start(offline) { // offline: an OfflineAudioContext (used by the automated sound checks)
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC && !offline) return;
    const c = this.ctx = offline || new AC(); this.master = c.createGain(); this.master.gain.value = 0;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5; this.master.connect(comp); comp.connect(c.destination); try { this.an = c.createAnalyser(); this.an.fftSize = 2048; comp.connect(this.an); } catch (e) { }   // a tap on the output, so the page can report whether anything is actually sounding
    const len = c.sampleRate * 4, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22; }
    this.noise = buf;
    const loop = (type, freq, q) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start(0, Math.random() * 3); return { g, f }; };
    this.river = loop('bandpass', 850, 0.45); this.riverHi = loop('highpass', 2600, 0.3); this.city = loop('lowpass', 170, 0.3); this.cityMid = loop('bandpass', 430, 0.35); this.wind = loop('bandpass', 380, 0.9);
    this.on = true; this.master.gain.linearRampToValueAtTime(this.muted ? 0 : this.vol, c.currentTime + 1.8);
  }
  // output level in dB (RMS of the last 2048 samples); about -100 when silent
  level() { if (!this.an) return -100; try { const a = this._lv || (this._lv = new Float32Array(this.an.fftSize)); this.an.getFloatTimeDomainData(a); let q = 0; for (let i = 0; i < a.length; i++) q += a[i] * a[i]; return 10 * Math.log10(q / a.length + 1e-10); } catch (e) { return -100; } }
  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : this.vol, this.ctx.currentTime, 0.15); }
  ambience(river, city, wind) { if (!this.on) return; const t = this.ctx.currentTime; this.river.g.gain.setTargetAtTime(river * 0.55, t, 0.4); this.riverHi.g.gain.setTargetAtTime(river * river * 0.10, t, 0.4); this.city.g.gain.setTargetAtTime(city * 0.9, t, 0.6); this.cityMid.g.gain.setTargetAtTime(city * 0.22, t, 0.6); this.wind.g.gain.setTargetAtTime(wind * 0.5, t, 0.25); this.wind.f.frequency.setTargetAtTime(300 + wind * 500, t, 0.3); }
  _out(pan) { const c = this.ctx; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(this.master); return p; } return this.master; }
  _burst(t, dur, freq, q, gain, pan, type = 'bandpass') { const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.7 + Math.random() * 0.8; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(this._out(pan)); s.start(t, Math.random() * 3, dur + 0.05); }
  _att(dist, ref) { return 1 / (1 + (dist / ref) * (dist / ref)); }
  // n wing beats; alarm take-offs start with wing claps
  flap(dist, pan, n = 6, alarm = false, delay = 0) { if (!this.on || dist > 90) return; const t0 = this.ctx.currentTime + delay, a = this._att(dist, 7);
    for (let i = 0; i < n; i++) { const t = t0 + i * (0.108 + Math.random() * 0.012), k = 1 - i / (n + 2); this._burst(t, 0.07, 900 + Math.random() * 500, 0.9, 1.25 * a * k, pan); this._burst(t + 0.045, 0.05, 420, 0.8, 0.5 * a * k, pan); if (alarm && i < 3) this._burst(t + 0.01, 0.022, 2600, 1.4, 1.9 * a, pan); } }
  flush(dist, pan, n) { if (!this.on || dist > 140) return; const a = this._att(dist, 12), t0 = this.ctx.currentTime; this._burst(t0, 1.6, 600, 0.5, 1.1 * a, pan); for (let i = 0; i < Math.min(26, n * 2); i++) this.flap(dist + Math.random() * 4, pan + (Math.random() - 0.5) * 0.9, 5 + (Math.random() * 4 | 0), i < 6, Math.random() * 0.9); }
  coo(dist, pan) { if (!this.on || dist > 40) return; const c = this.ctx, t = c.currentTime + 0.02, a = this._att(dist, 4) * 0.34, out = this._out(pan);
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), g2 = c.createGain(), lp = c.createBiquadFilter(), trem = c.createOscillator(), tg = c.createGain(); lp.type = 'lowpass'; lp.frequency.value = 950; o.type = 'sine'; o2.type = 'triangle';
    const base = 340 + Math.random() * 50, F = (f, tt) => { o.frequency.linearRampToValueAtTime(f, tt); o2.frequency.linearRampToValueAtTime(f * 2, tt); };
    o.frequency.setValueAtTime(base * 0.9, t); o2.frequency.setValueAtTime(base * 1.8, t); F(base * 1.08, t + 0.16); F(base * 0.96, t + 0.34); F(base * 1.04, t + 0.46); F(base * 1.06, t + 0.86); F(base * 1.12, t + 1.0); F(base * 0.82, t + 1.5);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.08); g.gain.linearRampToValueAtTime(a * 0.55, t + 0.34); g.gain.linearRampToValueAtTime(a * 0.15, t + 0.42); g.gain.linearRampToValueAtTime(a, t + 0.52); g.gain.linearRampToValueAtTime(a * 0.9, t + 0.88); g.gain.linearRampToValueAtTime(a * 0.2, t + 0.96); g.gain.linearRampToValueAtTime(a * 0.95, t + 1.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    trem.frequency.value = 24 + Math.random() * 6; tg.gain.setValueAtTime(0, t); tg.gain.setValueAtTime(a * 0.5, t + 0.46); tg.gain.setValueAtTime(0, t + 0.92); trem.connect(tg); tg.connect(g.gain);
    g2.gain.value = 0.12; o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(out); o.start(t); o2.start(t); trem.start(t); o.stop(t + 1.7); o2.stop(t + 1.7); trem.stop(t + 1.7); }
  peck(dist, pan) { if (!this.on || dist > 6) return; this._burst(this.ctx.currentTime, 0.018, 3200, 2.0, 3.2 * this._att(dist, 0.8), pan); }
  step(dist, pan) { if (!this.on || dist > 2.5) return; this._burst(this.ctx.currentTime, 0.02, 1800, 1.2, 0.12 * this._att(dist, 0.5), pan); }
  splash(dist, pan) { if (!this.on || dist > 30) return; const a = this._att(dist, 4); this._burst(this.ctx.currentTime, 0.28, 1500, 0.7, 1.3 * a, pan); this._burst(this.ctx.currentTime + 0.05, 0.2, 3800, 0.9, 0.65 * a, pan); }
  kite(dist) { if (!this.on || dist > 500) return; const c = this.ctx, t = c.currentTime + 0.05, a = 0.14 / (1 + dist / 140), out = this._out((Math.random() - 0.5) * 0.9), o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1900, t); o.frequency.linearRampToValueAtTime(2260, t + 0.12); o.frequency.setValueAtTime(2260, t + 0.48); o.frequency.linearRampToValueAtTime(1720, t + 1.55);
    lfo.frequency.value = 12.5; lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(120, t + 0.5); lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.06); g.gain.setValueAtTime(a, t + 0.48); g.gain.linearRampToValueAtTime(a * 0.7, t + 1.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.65);
    o.connect(g); g.connect(out); o.start(t); lfo.start(t); o.stop(t + 1.75); lfo.stop(t + 1.75); }
  clap() { if (!this.on) return; const t = this.ctx.currentTime; this._burst(t, 0.05, 1500, 0.6, 5.0, 0); this._burst(t + 0.003, 0.12, 700, 0.5, 2.6, 0); }
  bell() { if (!this.on) return; const c = this.ctx, t = c.currentTime, out = this._out(0.2); for (const [f, a, d] of [[98, 0.5, 9], [196.5, 0.32, 7], [247, 0.16, 5], [392, 0.10, 3.2], [521, 0.05, 2.2]]) { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * 0.22, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.1); } }
}
