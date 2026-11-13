"""Shared locations for the tools.

Every script in this directory imports its paths from here. Override them with environment variables:

  HATO_DIR     directory that holds the app (default: <repository>/app)
  HATO_OUT     directory for stills, clips and the assembled video (default: <repository>/media)
  HATO_TMP     scratch directory for frames and intermediate files (default: <system temp>/hato)
  HATO_CHROME  Chrome / Chromium executable used by Playwright (default: /usr/bin/google-chrome)
"""
import os
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
APP = os.environ.get('HATO_DIR') or os.path.join(ROOT, 'app')
MEDIA = os.environ.get('HATO_OUT') or os.path.join(ROOT, 'media')
TMP = os.environ.get('HATO_TMP') or os.path.join(tempfile.gettempdir(), 'hato')
CHROME = os.environ.get('HATO_CHROME') or '/usr/bin/google-chrome'
os.makedirs(TMP, exist_ok=True)
