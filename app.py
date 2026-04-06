"""BNK 금융계산기 — pywebview 래퍼 (플로팅 버튼 포함)"""
import os
import sys
import webview


def get_resource_path():
    """PyInstaller 빌드 시 리소스 경로 반환"""
    if getattr(sys, '_MEIPASS', None):
        return os.path.join(sys._MEIPASS, 'src')
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src')


FLOAT_HTML = """
<!DOCTYPE html>
<html>
<head>
<style>
* { margin:0; padding:0; }
html, body {
  background: transparent; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  height: 100vh; width: 100vw;
}
button {
  width: 48px; height: 48px; border-radius: 50%;
  border: none; cursor: pointer;
  background: #3182F6; color: #fff;
  font-size: 22px; font-weight: 700;
  box-shadow: 0 4px 14px rgba(49,130,246,0.45);
  transition: transform 0.15s, box-shadow 0.15s;
  display: flex; align-items: center; justify-content: center;
}
button:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(49,130,246,0.55); }
button:active { transform: scale(0.95); }
</style>
</head>
<body>
<button id="fab" title="금융계산기 (우클릭: 닫기)">🧮</button>
<script>
document.getElementById('fab').addEventListener('click', () => {
  window.pywebview.api.toggle_main();
});
document.getElementById('fab').addEventListener('contextmenu', (e) => {
  e.preventDefault();
  window.pywebview.api.close_app();
});
</script>
</body>
</html>
"""


class Api:
    """플로팅 버튼 ↔ 메인 창 통신 API"""

    def __init__(self):
        self.main_window = None
        self.float_window = None

    def toggle_main(self):
        if self.main_window is None:
            return
        if self.main_window.hidden:
            self.main_window.show()
            self.main_window.restore()
        else:
            self.main_window.hide()

    def close_app(self):
        """우클릭으로 전체 종료"""
        if self.main_window:
            self.main_window.destroy()
        if self.float_window:
            self.float_window.destroy()

    def set_floating(self, enabled):
        """메인 창 설정에서 플로팅 버튼 on/off"""
        if self.float_window is None:
            return
        if enabled:
            self.float_window.show()
        else:
            self.float_window.hide()


def main():
    api = Api()
    entry = os.path.join(get_resource_path(), 'index.html')

    # 메인 계산기 창
    main_win = webview.create_window(
        '금융계산기',
        url=entry,
        width=460,
        height=780,
        min_size=(440, 600),
        resizable=False,
        frameless=False,
        easy_drag=False,
        js_api=api,
    )
    api.main_window = main_win

    # 플로팅 버튼 창 (항상 위에, 프레임 없음)
    float_win = webview.create_window(
        '',
        html=FLOAT_HTML,
        width=56,
        height=56,
        resizable=False,
        frameless=True,
        easy_drag=True,
        on_top=True,
        transparent=True,
        js_api=api,
    )
    api.float_window = float_win

    def after_start():
        # 플로팅 창 위치를 우측 하단으로 이동
        try:
            import ctypes
            user32 = ctypes.windll.user32
            sw = user32.GetSystemMetrics(0)
            sh = user32.GetSystemMetrics(1)
            float_win.move(sw - 80, sh - 120)
        except Exception:
            pass  # Windows가 아니면 기본 위치 사용

        # localStorage에서 플로팅 설정 읽기 → 꺼져있으면 숨김
        try:
            result = main_win.evaluate_js(
                "localStorage.getItem('bnk_floating')"
            )
            if result == 'false':
                float_win.hide()
        except Exception:
            pass

    webview.start(gui='edgechromium', debug=False, func=after_start)


if __name__ == '__main__':
    main()
