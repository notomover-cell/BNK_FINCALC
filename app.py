"""BNK 금융계산기 — Edge --app 모드"""
import os
import sys
import subprocess
import threading
import time
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
        pass


def start_local_server(directory, port=18923):
    """로컬 HTTP 서버 시작"""
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


def find_edge():
    """Edge 실행파일 경로 탐색"""
    candidates = [
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


def main():
    src_dir = get_resource_path()
    port = start_local_server(src_dir)
    url = f'http://127.0.0.1:{port}/index.html'

    edge = find_edge()
    if edge is None:
        # Edge 없으면 기본 브라우저로 열기
        import webbrowser
        webbrowser.open(url)
        # 서버 유지
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
        return

    # Edge --app 모드로 실행
    proc = subprocess.Popen([
        edge,
        f'--app={url}',
        '--window-size=460,780',
        '--disable-extensions',
        '--disable-sync',
    ])

    # Edge 프로세스 종료 대기 → 서버도 종료
    proc.wait()


if __name__ == '__main__':
    main()
