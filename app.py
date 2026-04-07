"""BNK 금융계산기 — pywebview 래퍼"""
import os
import sys
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


def start_local_server(directory, port=18923):
    """로컬 HTTP 서버 시작 (localStorage 지원을 위해 file:// 대신 사용)"""
    handler = partial(SimpleHTTPRequestHandler, directory=directory)
    handler.log_message = lambda *args: None  # 로그 억제
    for p in range(port, port + 10):
        try:
            server = HTTPServer(('127.0.0.1', p), handler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            return p
        except OSError:
            continue
    raise RuntimeError('사용 가능한 포트를 찾을 수 없습니다.')


def show_splash():
    """tkinter 스플래시 화면 표시 (WebView2 초기화 동안)"""
    splash = tk.Tk()
    splash.title('')
    splash.overrideredirect(True)  # 프레임 없음

    w, h = 280, 120
    sw = splash.winfo_screenwidth()
    sh = splash.winfo_screenheight()
    x = (sw - w) // 2
    y = (sh - h) // 2
    splash.geometry(f'{w}x{h}+{x}+{y}')

    splash.configure(bg='#191F28')
    splash.attributes('-topmost', True)

    label = tk.Label(
        splash, text='BNK 금융계산기', font=('맑은 고딕', 14, 'bold'),
        fg='#FFFFFF', bg='#191F28'
    )
    label.pack(expand=True)

    sub = tk.Label(
        splash, text='로딩 중...', font=('맑은 고딕', 9),
        fg='#8B95A1', bg='#191F28'
    )
    sub.pack(pady=(0, 20))

    return splash


def main():
    # 스플래시 먼저 표시
    splash = show_splash()
    splash.update()

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
        # 스플래시 닫기
        try:
            splash.destroy()
        except Exception:
            pass

    webview.start(gui='edgechromium', debug=False, func=after_start)


if __name__ == '__main__':
    main()
