"""BNK 금융계산기 — pywebview 래퍼"""
import os
import sys
import winreg

# WebView2 환경변수를 webview import 전에 설정
def _setup_webview2_path():
    """Edge 버전 폴더를 WebView2 경로로 지정 (import 전 실행)"""
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        )
        winreg.QueryValueEx(key, "pv")
        winreg.CloseKey(key)
        return  # WebView2 정상 등록됨
    except (FileNotFoundError, OSError):
        pass
    # Edge 버전 폴더 탐색
    for base in [r'C:\Program Files (x86)\Microsoft\Edge\Application',
                 r'C:\Program Files\Microsoft\Edge\Application']:
        if not os.path.isdir(base):
            continue
        for name in os.listdir(base):
            ver_path = os.path.join(base, name)
            if os.path.isdir(ver_path) and name[0].isdigit():
                os.environ['WEBVIEW2_BROWSER_EXECUTABLE_FOLDER'] = ver_path
                return

_setup_webview2_path()

import threading
import tkinter as tk
import webview
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial





def get_resource_path():
    """PyInstaller 빌드 시 리소스 경로 반환"""
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(sys._MEIPASS, 'src')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')


class FixedMIMEHandler(SimpleHTTPRequestHandler):
    """Windows 레지스트리 MIME 설정에 의존하지 않도록 명시적 지정"""
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.html': 'text/html',
        '.json': 'application/json',
        '.ico': 'image/x-icon',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
    }
    def log_message(self, format, *args):
        pass  # 로그 억제


def start_local_server(directory, port=18923):
    """로컬 HTTP 서버 시작 (localStorage 지원을 위해 file:// 대신 사용)"""
    handler = partial(FixedMIMEHandler, directory=directory)
    for p in range(port, port + 10):
        try:
            server = HTTPServer(('127.0.0.1', p), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            return p
        except OSError:
            continue
    raise RuntimeError('사용 가능한 포트를 찾을 수 없습니다.')


class Splash:
    """별도 스레드에서 tkinter 스플래시 표시"""

    def __init__(self):
        self._thread = None
        self._root = None
        self._sub = None

    def show(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _run(self):
        root = tk.Tk()
        self._root = root
        root.title('')
        root.overrideredirect(True)

        w, h = 280, 120
        sw = root.winfo_screenwidth()
        sh = root.winfo_screenheight()
        x = (sw - w) // 2
        y = (sh - h) // 2
        root.geometry(f'{w}x{h}+{x}+{y}')

        root.configure(bg='#191F28')
        root.attributes('-topmost', True)

        tk.Label(
            root, text='BNK 금융계산기', font=('맑은 고딕', 14, 'bold'),
            fg='#FFFFFF', bg='#191F28'
        ).pack(expand=True)

        self._sub = tk.Label(
            root, text='로딩 중...', font=('맑은 고딕', 9),
            fg='#8B95A1', bg='#191F28'
        )
        self._sub.pack(pady=(0, 20))

        root.mainloop()

    def update_text(self, text):
        try:
            if self._sub:
                self._root.after(0, lambda: self._sub.config(text=text))
        except Exception:
            pass

    def close(self):
        try:
            if self._root:
                self._root.after(0, self._root.destroy)
        except Exception:
            pass


def main():
    splash = Splash()
    splash.show()

    src_dir = get_resource_path()
    port = start_local_server(src_dir)

    # 메인 계산기 창
    main_win = webview.create_window(
        '금융계산기',
        url=f'http://127.0.0.1:{port}/index.html',
        width=460,
        height=780,
        min_size=(440, 600),
        resizable=False,
        frameless=False,
        easy_drag=False,
    )

    def after_start():
        splash.close()

    try:
        webview.start(gui='edgechromium', debug=False, func=after_start)
    except Exception:
        webview.start(debug=False, func=after_start)


if __name__ == '__main__':
    main()
