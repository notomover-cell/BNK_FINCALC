# -*- mode: python ; coding: utf-8 -*-
"""BNK 금융계산기 PyInstaller 빌드 스펙"""

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=[('src', 'src')],
    hiddenimports=['webview'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='BNK_금융계산기',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    icon='src/img/favicon.ico',
)
