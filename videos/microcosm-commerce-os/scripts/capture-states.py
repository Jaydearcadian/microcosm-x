import pathlib
from playwright.sync_api import sync_playwright

BASE = "https://reputation-university-abstract-gotta.trycloudflare.com"
OUT = pathlib.Path("/opt/microcosm-x/videos/microcosm-commerce-os/assets/app")
OUT.mkdir(parents=True, exist_ok=True)

def shot(page, name):
    page.wait_for_timeout(1800)
    page.screenshot(path=str(OUT / f"{name}.png"))
    print("captured", name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path="/snap/bin/chromium",
                          args=["--no-sandbox", "--force-color-profile=srgb", "--hide-scrollbars"])
    ctx = b.new_context(viewport={"width": 1920, "height": 1080}, device_scale_factor=1)
    page = ctx.new_page()

    page.goto(BASE + "/app", wait_until="networkidle", timeout=90000)
    for label, name in [("Work", "work"), ("Audit", "audit")]:
        try:
            page.get_by_role("link", name=label).first.click(timeout=15000)
            shot(page, name)
        except Exception as e:
            print("skip", label, type(e).__name__)

    page.goto(BASE + "/app/onboarding", wait_until="networkidle", timeout=90000)
    page.wait_for_timeout(1500)
    for step in ["02", "03", "04", "05", "06"]:
        try:
            el = page.locator(f"text=STEP 0{step}").first
            if el.count() == 0:
                continue
            # step rail entries are clickable in the wizard
            rail = page.locator(f"text=0{step}").first
            rail.click(timeout=6000)
            page.wait_for_timeout(900)
        except Exception:
            pass
        try:
            page.get_by_role("button", name="Next step").click(timeout=6000)
            page.wait_for_timeout(900)
        except Exception:
            pass
        try:
            slug = {"02": "space", "03": "participants", "04": "fund", "05": "request", "06": "work"}[step]
            shot(page, f"onboarding-{slug}")
        except Exception as e:
            print("shot failed", step, e)
    b.close()
