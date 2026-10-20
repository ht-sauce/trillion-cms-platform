/**
 * 数据库连接串工具
 * 用户提供的密码可能包含特殊字符（@、!、# 等），拼装 URL 前必须做百分号编码
 */
export function mpEncodeUrl(value: string): string {
  return encodeURIComponent(value)
}
