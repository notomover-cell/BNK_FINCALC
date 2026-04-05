"""BNK 금융계산기 — pywebview 래퍼"""
import os
import sys
import webview


def get_resource_path():
    """PyInstaller 빌드 시 리소스 경로 반환"""
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(sys._MEIPASS, 'src')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')


def main():
    entry = os.path.join(get_resource_path(), 'index.html')
    window = webview.create_window(
        '금융계산기',
        url=entry,
        width=460,
        height=780,
        min_size=(440, 600),
        resizable=True,
        frameless=False,
        easy_drag=False,
    )
    webview.start(gui='edgechromium', debug=False)


if __name__ == '__main__':
    main()
