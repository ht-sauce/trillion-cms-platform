# -*- coding: utf-8 -*-
"""R3 现有页改造：读取库内现块 → 生成修正 bootstrap JSON（幂等 upsert）+ knowledge 11 页下线清单。
依据 docs/站点代码交付方案.md §6（v1.1）与用户裁定 A 方案（v-services 折中 URL）。
"""
import json
import pymysql

HOST = dict(host='127.0.0.1', port=3306, user='root', password='111',
            database='trillionCms', charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor)
ORG = '西安新城仁爱皮肤病医院'
ADDR = '西安市新城区长缨西路408-1-5号'

BMAP = {
    'lat': '34.2829', 'lng': '108.9932', 'zoom': 16,
    'title': ORG, 'address': ADDR, 'ak': '',
    'width': 1200, 'height': 420, 'chip': '在百度地图中打开 ↗',
}

DSWITCH = {
    'heading': '三大病种方向 · 同一执业主体',
    'subheading': '白癜风、银屑病、胎记均为本院同一执业许可下开设的专病门诊方向——不是独立医疗机构；选择方向查看目录与问答。',
    'tabs': [
        {
            'disease': 'vitiligo', 'label': 'A · 白癜风门诊',
            'lead': '本院核心专病方向：先查清（检测 7 项）、再分期（光疗 6 项）、后定方案（调理 7 项 + 外科评估 2 项），22 个公示项目逐项成页，价格与院内公示一致。',
            'chips': ['22 个公示项目', '检测分型 · 光疗 · 外科评估'],
            'links': [
                {'text': '白癜风诊疗目录（22 项）', 'href': '/clinic/vitiligo/v-services/'},
                {'text': '白癜风高频问答（42 条）', 'href': '/clinic/vitiligo/v-faq/'},
                {'text': '白癜风专病主页', 'href': '/clinic/vitiligo/'},
            ],
            'defaultOpen': True,
        },
        {
            'disease': 'psoriasis', 'label': 'B · 银屑病门诊',
            'lead': '银屑病病种目录已在本门诊下建立：先由皮肤科医师面诊，确定分型与分期后再判断适合的诊疗方式；项目页与医师公示审核中，目录页已可查阅。',
            'chips': ['病种目录已建立', '项目页审核中'],
            'links': [
                {'text': '银屑病诊疗目录', 'href': '/clinic/psoriasis/p-services/'},
                {'text': '银屑病高频问答', 'href': '/clinic/psoriasis/p-faq/'},
                {'text': '银屑病专病主页', 'href': '/clinic/psoriasis/'},
            ],
            'defaultOpen': False,
        },
        {
            'disease': 'birthmark', 'label': 'C · 胎记门诊',
            'lead': '围绕色素型与血管型两大类胎记，给出检查评估（4 项）、光电治疗（5 项）与综合调理的真实收费及就诊入口；先定性，再选光电或综合调理。',
            'chips': ['9 个公示项目', '检测 4 · 治疗 5'],
            'links': [
                {'text': '胎记诊疗目录（9 项）', 'href': '/clinic/birthmark/b-services/'},
                {'text': '胎记高频问答', 'href': '/clinic/birthmark/b-faq/'},
                {'text': '胎记专病主页', 'href': '/clinic/birthmark/'},
            ],
            'defaultOpen': False,
        },
    ],
}


def blocks_of(cur, path):
    cur.execute("SELECT blocks FROM page WHERE site_id=3 AND path=%s", (path,))
    row = cur.fetchone()
    if not row:
        raise SystemExit(f"page not found: {path}")
    return json.loads(row['blocks'])


def drop_doctor_section(bl):
    """首页：去掉与 doctor-card 配对的 section-head + doctor-card。"""
    out, i, removed = [], 0, 0
    while i < len(bl):
        b = bl[i]
        if b['key'] == 'doctor-card':
            removed += 1
            if out and out[-1]['key'] == 'section-head' and i + 1 < len(bl):
                pass  # 前一个 section-head 保留与否：它是医师区标题，一并删
            if out and out[-1]['key'] == 'section-head':
                out.pop()
            i += 1
            continue
        out.append(b)
        i += 1
    return out, removed


def insert_before(bl, new, key):
    for i, b in enumerate(bl):
        if b['key'] == key:
            return bl[:i] + [new] + bl[i:]
    return bl + [new]


def ensure_block(bl, key, data, before_key=None, after_key=None):
    """幂等：同 key 块只保留第一个（更新其 data），无则插入。返回完整块列表。"""
    out, done = [], False
    for b in bl:
        if b['key'] == key:
            if not done:
                b['data'] = json.loads(json.dumps(data))
                out.append(b)
                done = True
            continue  # 丢弃重复
        out.append(b)
    if done:
        return out
    new = {'key': key, 'data': json.loads(json.dumps(data))}
    if before_key:
        return insert_before(out, new, before_key)
    if after_key:
        for i, b in enumerate(out):
            if b['key'] == after_key:
                return out[:i + 1] + [new] + out[i + 1:]
    return out + [new]


def main():
    conn = pymysql.connect(**HOST)
    cur = conn.cursor()
    pages = []

    # ---- 1. 首页：删医师区块 + 插地图 ----
    bl = blocks_of(cur, '/')
    bl, removed = drop_doctor_section(bl)
    bl = ensure_block(bl, 'bmap-live', BMAP, before_key='telbar')
    pages.append({'channelSlug': 'home', 'slug': 'home', 'kind': 'static',
                  'title': ORG, 'summary': '', 'blocks': bl})
    print('home: doctor-card removed =', removed, 'blocks =', [b['key'] for b in bl])

    # ---- 2. /services：插三病种切换 + 医师区标题改白癜风口径 ----
    bl = blocks_of(cur, '/services')
    bl = ensure_block(bl, 'disease-switch', DSWITCH, after_key='hero-dark')
    for b in bl:
        if b['key'] == 'section-head' and '出诊本门诊的医师' in (b['data'].get('title') or ''):
            b['data']['title'] = '出诊白癜风门诊的医师'
            if b['data'].get('desc'):
                b['data']['desc'] = '以下医师在本门诊出诊，出诊时间以院内当日公示为准。'
    pages.append({'channelSlug': 'services', 'slug': 'index', 'kind': 'static',
                  'title': '专病门诊', 'summary': '', 'blocks': bl})
    print('services: blocks =', [b['key'] for b in bl])

    # ---- 3. /visit：nap-grid 后插地图 ----
    bl = blocks_of(cur, '/visit')
    out = ensure_block(bl, 'bmap-live', BMAP, after_key='nap-grid')
    pages.append({'channelSlug': 'visit', 'slug': 'index', 'kind': 'static',
                  'title': '预约就诊', 'summary': '', 'blocks': out})
    print('visit: blocks =', [b['key'] for b in out])

    # ---- 4. /contact：telbar 前插地图 ----
    bl = blocks_of(cur, '/contact')
    bl = ensure_block(bl, 'bmap-live', BMAP, before_key='telbar')
    pages.append({'channelSlug': 'contact', 'slug': 'index', 'kind': 'static',
                  'title': '联系我们', 'summary': '', 'blocks': bl})
    print('contact: blocks =', [b['key'] for b in bl])

    # ---- 5. /manage：改名随访管理（含 hero 标题）----
    bl = blocks_of(cur, '/manage')
    for b in bl:
        if b['key'] == 'hero-dark':
            h1 = b['data'].get('h1') or ''
            if '就诊指南' in h1:
                b['data']['h1'] = h1.replace('就诊指南', '随访管理')
    pages.append({'channelSlug': 'manage', 'slug': 'index', 'kind': 'static',
                  'title': '随访管理', 'summary': '随访管理：复诊预约、疗效随访与就诊档案说明。', 'blocks': bl})
    print('manage: blocks =', [b['key'] for b in bl])

    # ---- 6. /sitemap：删 11 条 knowledge + 补增量路由条目（§9.3 页面块补删）----
    cur.execute("SELECT blocks FROM page WHERE site_id=3 AND path='/sitemap'")
    bl = json.loads(cur.fetchone()['blocks'])
    cur.execute("SELECT path,title FROM page WHERE site_id=3 AND status='published'")
    titles = {r['path']: r['title'] or '' for r in cur.fetchall()}

    def label(path, fallback):
        t = titles.get(path, '')
        return t.split('｜')[0].strip() or fallback

    added = {'dx': 0, 'doc': 0, 'org': 0}
    for b in bl:
        if b['key'] != 'index-list':
            continue
        for g in b['data']['groups']:
            its = g.get('items', [])
            # 删 knowledge 条目
            g['items'] = [x for x in its if '/knowledge' not in json.dumps(x, ensure_ascii=False)]
            have = {x.get('href') for x in g['items']}
            title = g.get('title', '')
            new = []
            if '诊疗' in title:
                for pth, txt in [('/clinic', '专病门诊总览'), ('/clinic/vitiligo', '白癜风专病'),
                                 ('/clinic/psoriasis', '银屑病专病'), ('/clinic/birthmark', '胎记专病'),
                                 ('/clinic/vitiligo/v-services', '白癜风诊疗目录'),
                                 ('/clinic/psoriasis/p-services', '银屑病诊疗目录'),
                                 ('/clinic/birthmark/b-services', '胎记诊疗目录'),
                                 ('/clinic/vitiligo/v-cases', '白癜风临床参考（案例库）')]:
                    if pth not in have:
                        new.append({'href': pth, 'text': txt})
                for pth in sorted(titles):
                    if pth.startswith('/clinic/vitiligo/v-services/') and pth not in have:
                        new.append({'href': pth, 'text': label(pth, pth)})
                        added['dx'] += 1
                    elif pth.startswith('/clinic/birthmark/b-services/') and pth not in have:
                        new.append({'href': pth, 'text': label(pth, pth)})
                        added['dx'] += 1
                    elif pth.startswith('/clinic/psoriasis/p-services/') and pth not in have:
                        new.append({'href': pth, 'text': label(pth, pth)})
                        added['dx'] += 1
            elif '医师' in title:
                for slug in ('zhangmin', 'huangwenjuan', 'xiaojunfeng'):
                    pth = f'/doctors/{slug}'
                    if pth in titles and pth not in have:
                        new.append({'href': pth, 'text': label(pth, slug)})
                        added['doc'] += 1
            elif '机构' in title:
                for pth, txt in [('/archive', '机构实体档案'), ('/official-knowledge', '官方信息公示'),
                                 ('/environment', '院区实景')]:
                    if pth not in have:
                        new.append({'href': pth, 'text': txt})
                        added['org'] += 1
            g['items'] = g['items'] + new
    pages.append({'channelSlug': 'sitemap', 'slug': 'index', 'kind': 'static',
                  'title': '全站导览', 'summary': '', 'blocks': bl})
    print('sitemap: removed knowledge, added', added)

    out = {'slug': 'xian-renai-skin', 'name': ORG, 'profile': {},
           'channels': [], 'pages': pages, 'navigations': [], 'publish': False}
    with open('scripts/data/xian-renai-r3.json', 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('written scripts/data/xian-renai-r3.json')

    # ---- 6. knowledge 11 页下线（status → draft，保留内容可再启用）----
    cur.execute("SELECT id,path FROM page WHERE site_id=3 AND path LIKE '/knowledge%'")
    rows = cur.fetchall()
    ids = [r['id'] for r in rows]
    cur.executemany("UPDATE page SET status='draft' WHERE id=%s", [(i,) for i in ids])
    conn.commit()
    print('knowledge offline:', len(ids), [r['path'] for r in rows])
    conn.close()


if __name__ == '__main__':
    main()
