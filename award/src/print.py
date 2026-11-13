#!/usr/bin/env python3
"""slides.html -> slides.pdf with headless Chrome. usage: python3 print.py [out.pdf]"""
import sys, os
from playwright.sync_api import sync_playwright
here = os.path.dirname(os.path.abspath(__file__)); out = sys.argv[1] if len(sys.argv) > 1 else here + '/slides.pdf'
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('HATO_CHROME', '/usr/bin/google-chrome'), args=['--no-sandbox'])
    pg = b.new_page(viewport={'width': 1280, 'height': 720})
    pg.goto('file://' + here + '/slides.html'); pg.wait_for_function("[...document.images].every(i=>i.complete&&i.naturalWidth>0)", timeout=30000); pg.wait_for_timeout(500)
    over = pg.evaluate("[...document.querySelectorAll('.s')].map((s,i)=>{const b=s.querySelector('.body');if(!b)return null;const f=s.querySelector('.foot').getBoundingClientRect().top;let m=0;b.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect();if(r.height&&r.bottom>m)m=r.bottom});const sr=s.getBoundingClientRect();return [i+1, Math.round(m-sr.top), Math.round(f-sr.top)]}).filter(x=>x&&x[1]>x[2]-6)")
    print('content running into the footer (slide, content bottom, footer top):', over)
    pg.pdf(path=out, width='1280px', height='720px', print_background=True, prefer_css_page_size=True)
    b.close()
print(out, os.path.getsize(out))
