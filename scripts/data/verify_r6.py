# -*- coding: utf-8 -*-
"""R6 机械验收 v2：修正路由/链接口径（平台路由无尾斜杠、canonical 无尾斜杠、干净 URL 内链）。"""
import json, os, re, sys
from urllib.parse import urljoin

ROOT = r"D:/g/个人项目/trillion-cms-platform/apps/geo/sites/xian-renai-skin"
ok, fail = [], []


def check(name, cond, detail=""):
    (ok if cond else fail).append(f"{name} {detail}")
    print(("PASS " if cond else "FAIL ") + name, detail)


tri = json.load(open(os.path.join(ROOT, "_trillion.json"), encoding="utf-8"))
routes = set(tri["routes"])
check("1.路由数=201", len(routes) == 201, f"实际 {len(routes)}")

home = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
check("2.首页无医师区块", "doctor-card" not in home and 'class="doc"' not in home)
check("3.首页有百度地图", "staticimage" in home and "34.2829" in home)
check("4.首页地图新开定位", "map.baidu.com" in home and 'target="_blank"' in home)

svc = open(os.path.join(ROOT, "services/index.html"), encoding="utf-8").read()
panels = re.findall(r'<div[^>]*role="tabpanel"', svc)
leads = re.findall(r'class="dlead"', svc)
check("5.services三面板SSR", len(panels) == 3 and len(leads) == 3, f"tabpanel×{len(panels)} dlead×{len(leads)}")
check("6.services链接新目录", "/clinic/vitiligo/v-services" in svc and "/clinic/birthmark/b-services" in svc)

p = os.path.join(ROOT, "clinic/vitiligo/v-services/wood-lamp/index.html")
check("7.增量详情页存在", os.path.exists(p))
h = open(p, encoding="utf-8").read()
check("8.详情页JSON-LD", "application/ld+json" in h)
check("9.详情页canonical", bool(re.search(r'<link rel="canonical" href="[^"]*clinic/vitiligo/v-services/wood-lamp"', h)))

for path, must, banned_ctx in [
    ("visit/index.html", ["staticimage"], []),
    ("contact/index.html", ["staticimage"], []),
]:
    hh = open(os.path.join(ROOT, path), encoding="utf-8").read()
    check(f"10.{path}", all(m in hh for m in must))

mg = open(os.path.join(ROOT, "manage/index.html"), encoding="utf-8").read()
mt = re.search(r"<title>(.*?)</title>", mg).group(1)
check("10.manage改名", "随访管理" in mt and "<h1" in mg and "随访管理" in re.sub(r"<[^>]+>", "", mg[mg.find("<h1"):mg.find("</h1>")]))

kn = [r for r in routes if "/knowledge" in r]
check("11.knowledge已下线", not kn, f"残留 {kn}")

need = ["/clinic", "/clinic/vitiligo", "/clinic/vitiligo/v-services", "/clinic/vitiligo/v-services/wood-lamp",
        "/clinic/birthmark/b-services/wood-lamp", "/clinic/birthmark/b-faq", "/clinic/vitiligo/v-faq",
        "/archive", "/official-knowledge", "/environment", "/clinic/vitiligo/v-cases", "/doctors/zhangmin"]
missing = [r for r in need if r not in routes]
check("12.关键新路由齐", not missing, f"缺 {missing}")

sm = open(os.path.join(ROOT, "sitemap.xml"), encoding="utf-8").read()
ll = open(os.path.join(ROOT, "llms.txt"), encoding="utf-8").read()
check("13.sitemap正确", "/knowledge/" not in sm and "/clinic/vitiligo/v-services/wood-lamp" in sm)
check("14.llms正确", "/knowledge/" not in ll and "/clinic/vitiligo/v-services" in ll)

# 15. 全站内部链接 0 断链（干净 URL：/xxx 相对链接 → 路由集合）
broken, checked = [], 0
for dp, _, fs in os.walk(ROOT):
    rel = os.path.relpath(dp, ROOT).replace("\\", "/")
    parts = rel.split(os.sep)
    if rel.startswith("_") or "assets" in parts or ".old" in parts or ".history" in parts:
        continue
    for f in fs:
        if f != "index.html":
            continue
        html = open(os.path.join(dp, f), encoding="utf-8").read()
        for m in re.finditer(r'(?:href|src)="([^"]+)"', html):
            href = m.group(1)
            if href.startswith(("http", "//", "mailto:", "tel:", "javascript", "data:")):
                continue
            if href.startswith("/assets/") or href.startswith("/_nuxt/"):
                continue
            checked += 1
            path = urljoin("https://x" + ("/" if rel == "." else "/" + rel + "/"), href).split("#")[0].split("?")[0]
            path = re.sub(r"^https://x", "", path)
            if path.endswith("/"):
                path = path.rstrip("/") or "/"
            if path and path not in routes:
                broken.append((rel + "/" + f, href))
check("15.内部链接0断链", not broken, f"查 {checked} 条，断 {len(broken)} {broken[:6]}")

# 16. 全局 header/footer 与原型逐字对齐（抽首页 + 三个内页）
for rel in ["index.html", "services/index.html", "visit/index.html",
            "clinic/vitiligo/v-services/wood-lamp/index.html"]:
    hh = open(os.path.join(ROOT, rel), encoding="utf-8").read()
    nav = re.search(r"<header.*?</header>", hh, re.S).group(0)
    ftr = re.search(r"<footer.*?</footer>", hh, re.S).group(0)
    check(f"16a.{rel} header专病门诊->/services", '专病门诊' in nav and 'href="/services"' in nav
          and 'href="/clinic"' not in nav)
    titles = [re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", x))
              for x in re.findall(r"<h4[^>]*>(.*?)</h4>", ftr, re.S)]
    # 页脚不应出现旧 footer-3 的「就诊指南」链接（原型页脚两列无此项；header 另有，已限定在 footer 内）
    ftr_links = [re.sub(r"\s+", "", re.sub(r"<[^>]+>", "", a))
                 for a in re.findall(r"<a[^>]*>(.*?)</a>", ftr, re.S)]
    check(f"16b.{rel} footer两列无第三列",
          titles == ["西安新城仁爱皮肤病医院", "机构信息", "就诊服务", "官方公众号"]
          and "就诊指南" not in ftr_links)

print(f"\n==== 结果：{len(ok)} 过 / {len(fail)} 败 ====")
sys.exit(1 if fail else 0)
