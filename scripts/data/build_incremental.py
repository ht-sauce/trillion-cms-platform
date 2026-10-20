# -*- coding: utf-8 -*-
"""
西安仁爱 · 增量 48 路由 bootstrap JSON 生成器（docs/站点代码交付方案.md §8.3）

数据源（1:1 还原口径，HC-02 事实数据只从已核验来源取）：
  1. 原型工程 data.py 母本：_站点数据与脚本备份_20261010/data.py
     （ORG/DOCTORS/V_EXAMS/V_TREATS/B_EXAMS/B_TREATS，slug 与原型路由一致）
  2. 原型 v3.2 页面 HTML：站点/**/index.html（版式文案、SEO title、目录导语、FAQ 索引链接）

输出：scripts/data/xian-renai-incremental.json
  { profile-name, channels[], pages[](48), navigations[](header/footer-1/footer-2) }
  经 scripts/bootstrap-site.mjs --file 幂等导入（按 slug/path upsert）。

用法：
  "C:/Users/ht/.workbuddy/binaries/python/envs/default/Scripts/python.exe" build_incremental.py
"""
import importlib.util
import json
import os
import re
import sys
from bs4 import BeautifulSoup

# ---------- 路径 ----------
PROTO = r"D:/g/博润公司/西安新城仁爱皮肤病医院/站点"
DATA_PY = r"D:/g/博润公司/西安新城仁爱皮肤病医院/_站点数据与脚本备份_20261010/data.py"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xian-renai-incremental.json")

ORG_NAME = "西安新城仁爱皮肤病医院"
TEL = "029-82531111"
ADDR = "西安市新城区长缨西路408-1-5号"
HOURS = "门诊时间 8:30-17:30，午间不休息，周末及法定节假日正常接诊"

# ---------- data.py 母本加载 ----------
_spec = importlib.util.spec_from_file_location("xrdata", DATA_PY)
xrdata = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xrdata)

DOCTORS = xrdata.DOCTORS          # 7 位（后 3 位胎记方向）
V_EXAMS = xrdata.V_EXAMS          # 白癜风检测 7
V_TREATS = xrdata.V_TREATS        # 白癜风治疗 15
B_EXAMS = xrdata.B_EXAMS          # 胎记检测 4
B_TREATS = xrdata.B_TREATS        # 胎记治疗 5

# ---------- 原型 HTML 工具 ----------
def soup_of(route: str) -> BeautifulSoup:
    """route 形如 /clinic/vitiligo/；读站点对应 index.html"""
    rel = "" if route == "/" else route.strip("/")
    path = os.path.join(PROTO, rel, "index.html")
    return BeautifulSoup(open(path, encoding="utf-8").read(), "html.parser")

def seo_title(route: str) -> str:
    st = soup_of(route).title
    return (st.string or "").strip() if st else ""

def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()

def main_text(soup: BeautifulSoup) -> str:
    """正文容器（crumb 之后 footer 之前）纯文本，兜底导语用"""
    body = soup.body
    for tag in body(["style", "script", "nav", "header", "footer"]):
        tag.decompose()
    crumb = body.select_one(".crumb")
    if crumb:
        crumb.decompose()
    return clean(body.get_text(" ", strip=True))

def hero_of(route: str):
    """取原型第一屏 h1 与导语（v2 页无 hero 类，取正文首个 h1 及其后首个段落）"""
    s = soup_of(route)
    h1 = s.find("h1")
    lead = ""
    if h1:
        nxt = h1.find_next(["p", "div"])
        while nxt is not None and not clean(nxt.get_text(" ", strip=True)):
            nxt = nxt.find_next(["p", "div"])
        if nxt is not None and nxt.name == "p":
            lead = clean(nxt.get_text(" ", strip=True))
    return (clean(h1.get_text(" ", strip=True)) if h1 else ""), lead, s

# ---------- 块实例工具 ----------
def bid(n: int) -> str:
    return f"inc_{n:04d}"

class PageBuilder:
    """顺序收集块实例；n 为全局自增 id 种子"""
    def __init__(self, n: int):
        self.blocks = []
        self.n = n

    def add(self, key: str, data: dict, section=None, enabled=True):
        blk = {"id": bid(self.n), "key": key, "enabled": enabled, "data": data}
        if section:
            blk["section"] = section
        self.n += 1
        self.blocks.append(blk)
        return blk

    def head(self, title: str, desc: str):
        return self.add("section-head", {"title": title, "desc": desc})

def telbar_data():
    return {
        "title": "初诊建议提前电话预约，到院直接取号",
        "desc": f"{HOURS}。地址 {ADDR}。初诊建议预约上午时段，争取当天拿到初步评估结果。已预约上午时段的患者，当天下午到院仍有效。",
        "actions": [{"href": f"tel:{TEL}", "label": f"预约热线 {TEL}", "primary": True}],
    }

def notice_cmpl(text="合规声明：本条内容为项目客观信息登记，仅用于医学科普与信息参考，不构成诊疗建议，不含疗效承诺。价格为院内公示价，与公示一致。"):
    return {"text": text, "variant": "cmpl"}

# ============================================================
# 页面构建：项目详情（白癜风 22 + 胎记 9）
# ============================================================

def service_detail(pb: PageBuilder, disease: str, item: dict, kind_label: str):
    """项目详情页：hero-dark + 收费设备表 + 项目说明(article-body) + related-faq + telbar"""
    name = item["name"]
    lead = item.get("intro") or item.get("pain") or ""
    chips = [kind_label, item.get("device", ""), f"价格 {item.get('price', '以院内公示为准')}"]
    chips = [c for c in chips if c]
    pb.add("hero-dark", {
        "eyebrow": f"{disease}专病 · {kind_label}",
        "h1": name,
        "lead": lead,
        "chips": chips,
        "note": f"{HOURS}；咨询电话 {TEL}",
        "actions": [
            {"href": f"tel:{TEL}", "label": f"预约热线 {TEL}", "primary": True},
            {"href": "/visit", "label": "来院路线"},
        ],
    })
    # 收费与设备登记（2 列键值表）
    rows = [["项目名称", name], ["类别", kind_label]]
    if item.get("device"):
        rows.append(["设备名称", item["device"]])
    if item.get("model"):
        rows.append(["规格型号", item["model"]])
    if item.get("reg"):
        rows.append(["注册证编号", item["reg"]])
    if item.get("price"):
        rows.append(["院内公示价", item["price"]])
    pb.head("收费与设备登记", "价格与院内公示一致；设备与注册信息逐项登记，可核验。")
    pb.add("data-table", {"headers": ["项目", "内容"], "rows": rows,
                          "caption": "本页价格为院内公示价；具体方案以医师面诊意见为准。"})
    # 项目说明（文章体）
    paras = []
    if item.get("checks"):
        paras.append({"kind": "paragraph", "text": f"检查／覆盖内容：{item['checks']}"})
    if item.get("params"):
        paras.append({"kind": "paragraph", "text": f"技术参数：{item['params']}"})
    if item.get("who"):
        paras.append({"kind": "paragraph", "text": f"适用人群与场景：{item['who']}"})
    if item.get("flow"):
        paras.append({"kind": "paragraph", "text": f"就诊流程：{item['flow']}"})
    if item.get("cycle"):
        paras.append({"kind": "paragraph", "text": f"周期与频次：{item['cycle']}"})
    if item.get("taboo"):
        paras.append({"kind": "paragraph", "text": f"禁忌与注意事项：{item['taboo']}"})
    if item.get("pain"):
        paras.append({"kind": "paragraph", "text": f"解决什么问题：{item['pain']}"})
    pb.head("项目说明", "以下说明只针对本项目在本病种目录下的应用，不作为其他病种的指征依据。")
    pb.add("article-body", {"blocks": paras,
                            "disclaimer": "本页内容为项目客观信息登记，仅用于医学科普与信息参考，不构成诊疗建议，不含疗效承诺；具体诊疗方案请以面诊执业医师意见为准。"})
    # 相关问答（链接全站 FAQ 索引，不建第二份答案）
    q = item.get("answer")
    if q:
        pb.head("相关问答", "常见疑问见全站高频问答，点击查看完整答案。")
        pb.add("related-faq", {"items": [{"idx": "Q1", "text": f"{name}适合哪些人群？", "href": "/faq/"}]})
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


# ============================================================
# 页面构建：医师详情（胎记方向 3 位，article 数据取原型页）
# ============================================================

def doctor_detail(pb: PageBuilder, d: dict, route: str):
    """结构对齐库内现有医师详情页配方：hero-dark + data-table + section-head+list-rows + notice + telbar"""
    h1, lead, soup = hero_of(route)
    # 原型 article 三个 h2 段落：医师简介 / 擅长方向 / 出诊安排
    sections = {}
    for h2 in soup.find_all("h2"):
        key = clean(h2.get_text(" ", strip=True))
        parts = []
        for sib in h2.find_next_siblings():
            if sib.name in ("h2",):
                break
            t = clean(sib.get_text(" ", strip=True))
            if t:
                parts.append(t)
        sections[key] = parts
    bio = " ".join(sections.get("医师简介", [])) or d.get("bio", "")
    tags = sections.get("擅长方向", []) or ([d.get("note")] if d.get("note") else [])
    duty = sections.get("出诊安排", [])
    pb.add("hero-dark", {
        "eyebrow": f"{d.get('title','执业医师')} · {d.get('dept','')}".strip(" ·"),
        "h1": f"{d['name']}（{d.get('title','执业医师')}）",
        "lead": bio[:180] or lead,
        "chips": tags[:4],
        "note": f"出诊信息以当日公示为准；咨询电话 {TEL}",
        "actions": [
            {"href": f"tel:{TEL}", "label": f"预约热线 {TEL}", "primary": True},
            {"href": "/doctors", "label": "返回医师团队"},
        ],
    })
    rows = [
        ["姓名", d["name"]],
        ["职称", d.get("title", "")],
        ["执业专业", d.get("dept", "")],
    ]
    if d.get("license"):
        rows.append(["执业证号", d["license"]])
    rows.append(["证照状态", "证照核验中（扫描件待补）" if not d.get("photo") else "证照已公示，可核验"])
    pb.head("执业信息登记", "执业信息可在国家卫生健康委员会电子化注册系统核验。")
    pb.add("data-table", {"headers": ["项目", "内容"], "rows": rows})
    pb.head("擅长方向", "以下为该医师公示的擅长与方向说明，不构成疗效承诺。")
    pb.add("list-rows", {"items": [{"title": "擅长方向", "desc": "；".join(tags[:4]),
                                    "type": "公示信息"} for _ in range(1)] if tags else []})
    if duty:
        pb.head("出诊安排", "出诊时间以院内当日公示为准。")
        pb.add("list-rows", {"items": [{"title": "出诊安排", "desc": t, "type": "公示信息"} for t in duty]})
    pb.add("notice", notice_cmpl("合规声明：本页为医师执业信息登记，仅用于信息公开与核验，不构成诊疗建议，不含疗效承诺。"))
    pb.add("telbar", telbar_data(), section="plain-flush")

# ============================================================
# 通用：v2 分节正文 → section-head + article-body 序列
# ============================================================

def push_sections(pb: PageBuilder, soup: BeautifulSoup, skip_h2=()):
    """把原型 v2 页正文的 h2 分节转换为 CMS 块：
       纯段落节 → article-body；表格节 → data-table；图片节 → env-grid"""
    main = soup.select_one(".sec") or soup.body
    for tag in main(["style", "script", "nav"]):
        tag.decompose()
    h2s = [h for h in main.find_all("h2")]
    for h2 in h2s:
        title = clean(h2.get_text(" ", strip=True))
        if title in skip_h2:
            continue
        parts, table_rows, imgs, desc = [], [], [], ""
        for sib in h2.find_next_siblings():
            if sib.name in ("h2", "section"):
                break
            if sib.name == "table":
                for tr in sib.find_all("tr"):
                    cells = [clean(td.get_text(" ", strip=True)) for td in tr.find_all(["th", "td"])]
                    if any(cells):
                        table_rows.append(cells)
            elif sib.name in ("ul", "ol"):
                for li in sib.find_all("li"):
                    t = clean(li.get_text(" ", strip=True))
                    if t:
                        parts.append({"kind": "paragraph", "text": f"· {t}"})
            elif sib.name == "figure":
                for im in sib.find_all("img"):
                    imgs.append(im)
                cap = sib.find("figcaption")
                if cap:
                    parts.append({"kind": "paragraph", "text": clean(cap.get_text(" ", strip=True))})
            else:
                t = clean(sib.get_text(" ", strip=True))
                if t and not desc:
                    desc = t
                elif t:
                    parts.append({"kind": "paragraph", "text": t})
        pb.head(title, desc[:150])
        if table_rows:
            headers = table_rows[0]
            body_rows = table_rows[1:] if len(table_rows) > 2 else table_rows
            pb.add("data-table", {"headers": headers,
                                  "rows": body_rows if len(headers) > 1 else [[r[0], ""] for r in body_rows]})
        if imgs:
            pb.add("env-grid", {"items": [{"img": "/assets/img/env/" + os.path.basename(im.get("src", "")),
                                           "alt": im.get("alt", "") or "院区实景",
                                           "caption": im.get("alt", "") or "院区实景",
                                           "note": ""} for im in imgs]})
        if parts:
            pb.add("article-body", {"blocks": parts, "disclaimer": ""})


def hero_from_v2(pb: PageBuilder, route: str, eyebrow: str, fallback_lead: str, chips=None, actions=None):
    h1, lead, _ = hero_of(route)
    pb.add("hero-dark", {
        "eyebrow": eyebrow,
        "h1": h1 or eyebrow,
        "lead": lead or fallback_lead,
        "chips": chips or [],
        "note": f"{HOURS}；咨询电话 {TEL}",
        "actions": actions or [
            {"href": f"tel:{TEL}", "label": f"预约热线 {TEL}", "primary": True},
            {"href": "/contact", "label": "来院路线"},
        ],
    })


# ============================================================
# 页面构建：clinic 根 + 病种目录 + services 索引 + faq 索引
# ============================================================

def clinic_home(pb: PageBuilder):
    route = "/clinic/"
    hero_from_v2(pb, route, "专病门诊 · 三大病种方向",
                 "本院设白癜风、银屑病、胎记三个专病门诊方向，均由同一执业许可的门诊承接——不是独立医疗机构。")
    s = soup_of(route)
    push_sections(pb, s, skip_h2=("联系与到院（NAP）", "出诊医师"))
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def disease_home(pb: PageBuilder, disease: str, route: str, lead: str):
    hero_from_v2(pb, route, f"{disease}专病 · 同一执业主体", lead)
    s = soup_of(route)
    push_sections(pb, s, skip_h2=("就诊信息（NAP）", "出诊本病的医师", "出诊医师安排", "胎记方向医师"))
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def services_index(pb: PageBuilder, disease: str, route: str, lead: str, groups: list):
    """groups: [(分组标题, items, kind_label)]，items 为 data.py 条目"""
    hero_from_v2(pb, route, f"{disease}专病 · 诊疗目录", lead)
    for title, items, kind_label in groups:
        pb.head(title, "以下项目价格与院内公示一致；点击查看项目详情。")
        cards = []
        for it in items:
            dev = " + ".join(x for x in [it.get("device"), it.get("model"), it.get("reg")] if x)
            rows = []
            if it.get("who"):
                rows.append({"k": "适用人群", "v": it["who"][:120]})
            if it.get("flow"):
                rows.append({"k": "流程", "v": it["flow"]})
            if it.get("cycle"):
                rows.append({"k": "周期", "v": it["cycle"]})
            ch = "vitiligo" if it in V_EXAMS + V_TREATS else "birthmark"
            pre = "v-services" if it in V_EXAMS + V_TREATS else "b-services"
            cards.append({"cat": kind_label, "name": it["name"], "dev": dev, "rows": rows,
                          "price": (it.get("price") or "").replace("/次", "元") or "以公示为准",
                          "href": f"/clinic/{ch}/{pre}/{it['slug']}"})
        pb.add("service-card", {"columns": "3", "items": cards})
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def faq_index(pb: PageBuilder, disease: str, route: str, lead: str):
    """病种 FAQ 索引：hero-dark + anchor-bar + faq-index（链全站 /faq/qNNN，不建第二份答案）"""
    s = soup_of(route)
    # 抽 FAQ 详情链接（../../faq/qNNN/ → /faq/qNNN/）与问题文本
    items, cats = [], []
    for a in s.find_all("a"):
        href = a.get("href") or ""
        m = re.search(r"faq/(q\d+)/", href)
        if not m:
            continue
        qid = m.group(1)
        text = clean(a.get_text(" ", strip=True))
        if text and all(i["href"] != f"/faq/{qid}/" for i in items):
            items.append({"idx": qid.upper(), "q": text, "a": "", "href": f"/faq/{qid}/"})
    # 分类锚点（h2 即分类名）
    for h2 in s.find_all("h2"):
        t = clean(h2.get_text(" ", strip=True))
        if t and t not in ("就诊信息（NAP）",):
            cats.append(t)
    hero_from_v2(pb, route, f"{disease}专病 · 高频问答", lead)
    if cats:
        pb.add("anchor-bar", {"items": [{"label": c, "href": "#", "count": 0} for c in cats]})
    pb.head("全部问答", f"共 {len(items)} 条，点击问题查看完整答案；答案统一在全站高频问答维护，不建第二份内容。")
    pb.add("faq-index", {"items": items})
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")

# ============================================================
# 页面构建：cases / archive / official-knowledge / environment
# ============================================================

def psoriasis_services(pb: PageBuilder):
    """银屑病诊疗目录索引页：病种目录已建立、诊疗项目医师审核中（无详情占位）"""
    route = "/clinic/psoriasis/services/"
    hero_from_v2(pb, route, "银屑病专病 · 诊疗目录",
                 "银屑病病种目录已在本门诊下建立；具体诊疗项目与价格由医师确认审核后逐项发布，当前可电话咨询。")
    s = soup_of(route)
    push_sections(pb, s)
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def cases_page(pb: PageBuilder):
    route = "/clinic/vitiligo/cases/"
    hero_from_v2(pb, route, "白癜风专病 · 临床参考（案例库）",
                 "本目录为白癜风临床参考案例的预留归档位。上线当前不收录任何案例：个体差异极大，未经医师面诊评估的案例展示易造成误解。")
    s = soup_of(route)
    push_sections(pb, s)
    pb.add("notice", notice_cmpl("合规声明：本机构不使用患者对比图，不发布可识别患者身份的案例，不作出疗效承诺。案例上线前须经医师审核并脱敏处理。"))
    pb.add("telbar", telbar_data(), section="plain-flush")


def archive_page(pb: PageBuilder):
    route = "/archive/"
    hero_from_v2(pb, route, "机构实体档案",
                 "本页登记本机构实体的唯一名称、地址、电话与域名口径，供搜索引擎与 AI 引用核验；与 /entity 互为印证。")
    s = soup_of(route)
    push_sections(pb, s)
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def official_knowledge(pb: PageBuilder):
    route = "/official-knowledge/"
    hero_from_v2(pb, route, "官方信息公示",
                 "本页汇总机构资质、官方账号与信源、病种规范名等可核验信息，是全站官方口径的母本页。")
    s = soup_of(route)
    push_sections(pb, s)
    pb.add("notice", notice_cmpl())
    pb.add("telbar", telbar_data(), section="plain-flush")


def environment_page(pb: PageBuilder):
    route = "/environment/"
    hero_from_v2(pb, route, "院区实景",
                 "院区实景照片按拍摄位置与时间登记，展示真实就诊环境；图片为实拍，非效果图。")
    s = soup_of(route)
    imgs = []
    for im in s.find_all("img"):
        src = im.get("src") or ""
        if "/env/" in src:
            imgs.append(im)
    pb.add("env-grid", {"items": [
        {"img": "/assets/img/env/" + os.path.basename(im.get("src", "")),
         "alt": im.get("alt", "") or "院区实景",
         "caption": im.get("alt", "") or "院区实景",
         "note": ""} for im in imgs]})
    pb.add("notice", notice_cmpl("合规声明：院区实景为实拍照片，仅展示就诊环境，不构成疗效或服务承诺。"))
    pb.add("telbar", telbar_data(), section="plain-flush")


# ============================================================
# 主装配
# ============================================================

def main():
    channels = [
        {"slug": "clinic", "name": "专病门诊"},
        {"slug": "vitiligo", "name": "白癜风专病", "parentSlug": "clinic"},
        {"slug": "v-services", "name": "白癜风诊疗目录", "parentSlug": "vitiligo"},
        {"slug": "v-faq", "name": "白癜风问答", "parentSlug": "vitiligo"},
        {"slug": "v-cases", "name": "白癜风案例库", "parentSlug": "vitiligo"},
        {"slug": "psoriasis", "name": "银屑病专病", "parentSlug": "clinic"},
        {"slug": "p-services", "name": "银屑病诊疗目录", "parentSlug": "psoriasis"},
        {"slug": "p-faq", "name": "银屑病问答", "parentSlug": "psoriasis"},
        {"slug": "birthmark", "name": "胎记专病", "parentSlug": "clinic"},
        {"slug": "b-services", "name": "胎记诊疗目录", "parentSlug": "birthmark"},
        {"slug": "b-faq", "name": "胎记问答", "parentSlug": "birthmark"},
        {"slug": "archive", "name": "机构实体档案"},
        {"slug": "official-knowledge", "name": "官方信息公示"},
        {"slug": "environment", "name": "院区实景"},
    ]
    pages = []
    n = 1

    def page(channelSlug, slug, kind, title, summary, builder_fn, *args, **kw):
        nonlocal n
        pb = PageBuilder(n)
        builder_fn(pb, *args, **kw)
        n = pb.n
        route_map = {
            ("clinic", "index"): "/clinic/",
            ("vitiligo", "index"): "/clinic/vitiligo/",
            ("psoriasis", "index"): "/clinic/psoriasis/",
            ("birthmark", "index"): "/clinic/birthmark/",
            ("v-services", "index"): "/clinic/vitiligo/services/",
            ("p-services", "index"): "/clinic/psoriasis/services/",
            ("b-services", "index"): "/clinic/birthmark/services/",
            ("v-faq", "index"): "/clinic/vitiligo/faq/",
            ("p-faq", "index"): "/clinic/psoriasis/faq/",
            ("b-faq", "index"): "/clinic/birthmark/faq/",
            ("v-cases", "index"): "/clinic/vitiligo/cases/",
            ("archive", "index"): "/archive/",
            ("official-knowledge", "index"): "/official-knowledge/",
            ("environment", "index"): "/environment/",
        }
        route = route_map.get((channelSlug, slug))
        seo = seo_title(route) if route else f"{title} — {ORG_NAME}"
        pages.append({
            "channelSlug": channelSlug, "slug": slug, "kind": kind, "title": title,
            "summary": (summary or "")[:200], "seoTitle": seo,
            "seoDescription": (summary or "")[:160],
            "blocks": pb.blocks,
        })

    # --- clinic 根 ---
    page("clinic", "index", "static", "专病门诊", "白癜风、银屑病、胎记三个专病门诊方向，同一执业主体承接。", clinic_home)
    # --- 病种目录 ---
    page("vitiligo", "index", "static", "白癜风专病",
         "白癜风专病门诊：检测分型、光疗、中西医调理与外科评估，22 个公示项目逐项成页。",
         disease_home, "白癜风", "/clinic/vitiligo/",
         "本院核心专病方向：先查清（检测）、再分期（分型）、后定方案；22 个公示项目逐项成页，价格与院内公示一致。")
    page("psoriasis", "index", "static", "银屑病专病",
         "银屑病专病门诊：病种目录已建立，就诊由同一执照、同一地址、同一电话的门诊承接。",
         disease_home, "银屑病", "/clinic/psoriasis/",
         "银屑病病种目录已在本门诊下建立：先由皮肤科医师面诊，确定分型与分期后再判断适合的诊疗方式。")
    page("birthmark", "index", "static", "胎记专病",
         "胎记专病门诊：色素型与血管型胎记的检查评估、光电治疗与综合调理。",
         disease_home, "胎记", "/clinic/birthmark/",
         "围绕色素型与血管型两大类胎记，给出检查评估、光电治疗与综合调理的真实收费及就诊入口；先定性，再选光电或综合调理。")
    # --- services 索引与详情 ---
    page("v-services", "index", "static", "白癜风诊疗目录",
         "白癜风检测 7 项 + 治疗 15 项，价格与院内公示一致。",
         services_index, "白癜风", "/clinic/vitiligo/services/",
         "白癜风 22 个公示项目分检测与治疗两组，逐项登记设备、注册证与价格。",
         [("检测项目（7项）", V_EXAMS, "检测 · EXAM"), ("治疗项目（15项）", V_TREATS, "治疗 · THERAPY")])
    for it in V_EXAMS:
        page("v-services", it["slug"], "detail", f"{it['name']}｜白癜风项目",
             it.get("intro", ""), service_detail, "白癜风", it, "检测")
    for it in V_TREATS:
        page("v-services", it["slug"], "detail", f"{it['name']}｜白癜风项目",
             it.get("intro", ""), service_detail, "白癜风", it, "治疗")
    page("b-services", "index", "static", "胎记诊疗目录",
         "胎记检测 4 项 + 治疗 5 项，价格与院内公示一致。",
         services_index, "胎记", "/clinic/birthmark/services/",
         "胎记 9 个公示项目分检测与治疗两组，逐项登记设备、注册证与价格。",
         [("检测项目（4项）", B_EXAMS, "检测 · EXAM"), ("治疗项目（5项）", B_TREATS, "治疗 · THERAPY")])
    page("p-services", "index", "static", "银屑病诊疗目录",
         "银屑病病种目录已建立；诊疗项目与价格由医师确认审核后逐项发布。",
         psoriasis_services)
    for it in B_EXAMS:
        page("b-services", it["slug"], "detail", f"{it['name']}｜胎记项目",
             it.get("intro", ""), service_detail, "胎记", it, "检测")
    for it in B_TREATS:
        page("b-services", it["slug"], "detail", f"{it['name']}｜胎记项目",
             it.get("intro", ""), service_detail, "胎记", it, "治疗")
    # --- FAQ 索引 ---
    page("v-faq", "index", "list", "白癜风高频问答",
         "白癜风诊疗、病因与副作用风险相关高频问答，共 42 条，链接全站 FAQ 详情。",
         faq_index, "白癜风", "/clinic/vitiligo/faq/",
         "本页收录白癜风相关高频问答，点击问题查看完整答案。")
    page("p-faq", "index", "list", "银屑病高频问答",
         "银屑病就诊相关高频问答，链接全站 FAQ 详情。",
         faq_index, "银屑病", "/clinic/psoriasis/faq/",
         "本页收录银屑病相关高频问答，点击问题查看完整答案。")
    page("b-faq", "index", "list", "胎记高频问答",
         "胎记就诊相关高频问答，链接全站 FAQ 详情。",
         faq_index, "胎记", "/clinic/birthmark/faq/",
         "本页收录胎记相关高频问答，点击问题查看完整答案。")
    # --- 案例库（合规占位） ---
    page("v-cases", "index", "static", "白癜风临床参考（案例库）",
         "临床参考案例预留归档位；上线当前不收录案例。", cases_page)
    # --- 单页 ---
    page("archive", "index", "static", "实体档案与消歧",
         "机构实体唯一 NAP、名称与域名消歧表、sameAs 建议。", archive_page)
    page("official-knowledge", "index", "static", "官方信息公示",
         "机构资质、官方账号与信源、病种规范名等可核验信息母本。", official_knowledge)
    page("environment", "index", "static", "院区实景",
         "院区实拍实景 28 张，按位置与时间登记。", environment_page)
    # --- 医师详情 3（胎记方向） ---
    for d in DOCTORS:
        if d.get("photo"):
            continue
        slug = {"zhangmin": "zhangmin", "huangwenjuan": "huangwenjuan", "xiaojunfeng": "xiaojunfeng"}.get(
            d["slug"], d["slug"])
        route = f"/doctors/{slug}/"
        if not os.path.exists(os.path.join(PROTO, "doctors", slug, "index.html")):
            continue
        page("doctors", slug, "detail", f"{d['name']}（{d.get('title','执业医师')}）｜医师详情",
             (d.get("bio") or "")[:180], doctor_detail, d, route)

    navigations = [
        {"key": "header", "items": [
            {"label": "首页", "pageSlug": "home"},
            {"label": "机构资质", "pageSlug": "qualifications/index"},
            {"label": "医师团队", "pageSlug": "doctors/index"},
            {"label": "设备与实景", "pageSlug": "devices/index"},
            {"label": "专病门诊", "pageSlug": "services/index"},
            {"label": "新闻资讯", "pageSlug": "news/index"},
            {"label": "高频问答", "pageSlug": "faq/index"},
            {"label": "就诊指南", "pageSlug": "contact/index"},
        ]},
        {"key": "footer-1", "items": [
            {"label": "机构简介", "pageSlug": "about/index"},
            {"label": "官方账号与信源", "pageSlug": "platforms/index"},
            {"label": "专业术语通俗解释", "pageSlug": "terms/index"},
            {"label": "官方信息公示", "pageSlug": "official-knowledge/index"},
        ]},
        {"key": "footer-2", "items": [
            {"label": "随访管理", "pageSlug": "manage/index"},
            {"label": "联系我们", "pageSlug": "contact/index"},
            {"label": "全站导览", "pageSlug": "sitemap/index"},
        ]},
    ]

    out = {
        "slug": "xian-renai-skin",
        "name": ORG_NAME,
        "profile": {},
        "channels": channels,
        "pages": pages,
        "navigations": navigations,
        "publish": False,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"channels={len(channels)} pages={len(pages)} blocks={sum(len(p['blocks']) for p in pages)}")
    for p in pages:
        print(f"  /{p['channelSlug']}/{p['slug'] if p['slug'] != 'index' else ''} [{p['kind']}] {len(p['blocks'])}块 {p['title'][:24]}")


if __name__ == "__main__":
    main()
