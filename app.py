"""BNK 금융계산기 — pywebview 래퍼"""
import os
import sys
import subprocess
import threading
import tkinter as tk
import winreg
import webview
from http.server import HTTPServer, SimpleHTTPRequestHandler
from functools import partial


def is_webview2_installed():
    """WebView2 런타임 설치 여부 확인"""
    try:
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
        )
        winreg.QueryValueEx(key, "pv")
        winreg.CloseKey(key)
        return True
    except (FileNotFoundError, OSError):
        return False


def install_webview2():
    """번들된 WebView2 설치파일로 자동 설치"""
    if getattr(sys, '_MEIPASS', None):
        installer = os.path.join(sys._MEIPASS, 'MicrosoftEdgeWebview2Setup.exe')
    else:
        installer = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'MicrosoftEdgeWebview2Setup.exe')

    if not os.path.exists(installer):
        return False

    try:
        subprocess.run([installer, '/silent', '/install'], check=True, timeout=120)
        return True
    except Exception:
        return False


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

    # WebView2 런타임 확인 → 없으면 자동 설치
    if not is_webview2_installed():
        splash.update_text('WebView2 설치 중...')
        if not install_webview2():
            import tkinter.messagebox as mb
            mb.showerror('오류', 'WebView2 런타임 설치에 실패했습니다.\n관리자에게 문의하세요.')
            splash.close()
            return

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
