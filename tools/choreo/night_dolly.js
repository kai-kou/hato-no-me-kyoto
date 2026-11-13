// Night cut along Shinbashi-dori in Gion: the camera travels east at a slow walking pace, about 1.5 m above the paving.
// The start point, the point it looks at and the field of view come from the query (free=x,y,z,lx,ly,lz,fov); this only moves them, one step per frame.
(() => { const a = __app, F = a.FREE, f = a.flock, u = f.update.bind(f); const v = 1.1 / 30, dx = 0.994, dz = 0.110;
  f.update = (dt, h) => { F[0] += dx * v; F[2] += dz * v; F[3] += dx * v; F[5] += dz * v; return u(dt, h); };
  return 'dolly east, 1.1 m/s'; })()
