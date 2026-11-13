(async () => { const { Sound } = await import('./js/audio.js'); const SR = 44100, out = {};
  const render = async (name, secs, fn) => { const off = new OfflineAudioContext(2, SR * secs, SR), s = new Sound(); s.start(off); s.master.gain.cancelScheduledValues(0); s.master.gain.setValueAtTime(s.vol, 0); fn(s); const buf = await off.startRendering(); const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, i16 = new Int16Array(n); let peak = 0, sq = 0; for (let i = 0; i < n; i++) { const v = (L[i] + R[i]) * 0.5; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); sq += v * v; i16[i] = Math.max(-32768, Math.min(32767, Math.round(v * 32767))); } let bin = ''; const u8 = new Uint8Array(i16.buffer); for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sq / n).toFixed(4), b64: btoa(bin) }; };
  await render('river_near', 3, s => s.ambience(1, 0.1, 0));
  await render('city_far', 3, s => s.ambience(0.05, 0.22, 0));
  await render('wind_flight', 3, s => s.ambience(0.2, 0.1, 0.9));
  await render('coo_1m', 2.2, s => s.coo(1, 0));
  await render('flap_alarm_2m', 1.6, s => s.flap(2, 0, 8, true));
  await render('flush_6m', 3, s => s.flush(6, 0, 14));
  await render('kite_80m', 2.2, s => s.kite(80));
  await render('peck_30cm', 0.4, s => s.peck(0.3, 0));
  await render('splash_3m', 0.8, s => s.splash(3, 0));
  await render('bell', 6, s => s.bell());
  await render('clap', 0.5, s => s.clap());
  return JSON.stringify(out); })()
