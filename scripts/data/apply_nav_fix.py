# -*- coding: utf-8 -*-
"""R3.1 导航 1:1 对齐原型（幂等）：
① header「专病门诊」指回 /services（原型口径，专病门诊总览页）；
② 删除残留的 footer-3（旧兜底 4 条）与空 footer-4——原型页脚只有 机构信息/就诊服务 两列。
直接操作库（bootstrap 不支持删导航组），执行前打印影响行。
"""
import pymysql

conn = pymysql.connect(host='127.0.0.1', port=3306, user='root', password='111',
                       database='trillionCms', charset='utf8mb4',
                       cursorclass=pymysql.cursors.DictCursor)
c = conn.cursor()

# ① header「专病门诊」-> page id of /services
c.execute("SELECT id FROM page WHERE site_id=3 AND path='/services'")
services_id = c.fetchone()['id']
c.execute("""UPDATE navigationitem ni JOIN navigation n ON n.id=ni.navigation_id
             SET ni.page_id=%s, ni.href=NULL
             WHERE n.site_id=3 AND n.`key`='header' AND ni.label='专病门诊'""",
          (services_id,))
print("header 专病门诊 -> /services, rows:", c.rowcount)

# ② 删除 footer-3 / footer-4 组及其条目
c.execute("SELECT id, `key` FROM navigation WHERE site_id=3 AND `key` IN ('footer-3','footer-4')")
stale = c.fetchall()
for g in stale:
    c.execute("DELETE FROM navigationitem WHERE navigation_id=%s", (g['id'],))
    print(f"deleted items of {g['key']}:", c.rowcount)
    c.execute("DELETE FROM navigation WHERE id=%s", (g['id'],))
    print(f"deleted nav group {g['key']}:", c.rowcount)

conn.commit()

# 终态核对
c.execute("SELECT id,`key` FROM navigation WHERE site_id=3 ORDER BY sort")
groups = c.fetchall()
print("\n最终导航组:", [(g['key']) for g in groups])
for g in groups:
    c.execute("""SELECT ni.label, p.path FROM navigationitem ni
                 LEFT JOIN page p ON p.id=ni.page_id
                 WHERE ni.navigation_id=%s ORDER BY ni.sort""", (g['id'],))
    print(f"[{g['key']}]", [(r['label'], r['path']) for r in c.fetchall()])
conn.close()
