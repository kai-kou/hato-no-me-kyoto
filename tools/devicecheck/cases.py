# The cases every target runs: (label, query). Kept short so that a run fits in a free CI job.
CASES = [('eye_day', 't=11&m=eye'), ('chase_day', 't=11&m=chase'), ('over_day', 't=11&m=over'), ('tele_day', 't=11&m=tele'), ('cine_day', 't=11&m=cine'),
         ('eye_night', 't=20&m=eye'), ('tele_night', 't=20&m=tele'), ('eye_day_asset', 't=11&m=eye&people=asset'), ('tele_day_asset', 't=11&m=tele&people=asset')]
# extra cases for telling apart what a phone browser does differently (same view, one thing changed)
DIAG = [('over_day_nobsh', 't=11&m=over&nobsh=1'), ('over_day_high', 't=11&m=over&q=high'), ('over_day_low', 't=11&m=over&q=low')]
def url(port, target, label, query, settle=8, samples=8):
    return 'http://localhost:%d/index.html?auto=1&seed=7&%s&report=%s--%s&settle=%s&samples=%s' % (port, query, target, label, settle, samples)
def wait_report(out, rid, timeout):
    import json, os, time
    t0 = time.time(); f = os.path.join(out, 'reports.jsonl')
    while time.time() - t0 < timeout:
        if os.path.exists(f):
            for line in open(f, encoding='utf-8'):
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                if o.get('id') == rid:
                    return o
        time.sleep(1)
    return None
