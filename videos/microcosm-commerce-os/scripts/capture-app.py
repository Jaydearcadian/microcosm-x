import sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = "https://reputation-university-abstract-gotta.trycloudflare.com"
OUT = pathlib.Path("/opt/microcosm-x/videos/microcosm-commerce-os/assets/app")
OUT.mkdir(parents=True, exist_ok=True)

ROUTES = [
    ("landing-hero", "/", 0),
    ("app-shell", "/app", 0),
    ("onboarding", "/app/onboarding", 0),
    ("access", "/app/access?code=demo", 0),
]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/snap/bin/chromium", args=["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"])
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page = ctx.new_page()
    for name, route, _ in ROUTES:
        page.goto(BASE + route, wait_until="networkidle", timeout=90000)
        page.wait_for_timeout(2500)
        page.screenshot(path=str(OUT / f"{name}.png"))
        print("captured", name, page.title())
    b.close()
