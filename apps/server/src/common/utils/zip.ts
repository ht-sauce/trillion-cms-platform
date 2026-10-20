/**
 * 最小 ZIP 打包器（零第三方依赖）
 *
 * 用途：站点下载（09 §8.5）需要把产物目录流式打成 zip。
 * 为什么自研：引入 archiver/jszip 只为一处功能不划算，且本仓库依赖安装环境较敏感；
 * ZIP 是稳定格式，store/deflate + CRC32 实现约百行，足以覆盖「目录打包下载」。
 *
 * 支持：UTF-8 文件名（general purpose flag bit 11）、deflate 压缩（zlib.deflateRawSync）。
 * 不支持：ZIP64（单包 >4GB）、加密、多卷 —— 站点产物远小于 4GB，无需覆盖。
 */
import { deflateRawSync } from 'node:zlib'

/** CRC32 查表（多项式 0xEDB88320） */
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = -1
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

/** Date → MS-DOS 时间/日期（ZIP 固定字段） */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

export interface ZipEntry {
  /** 包内路径，统一用 `/` 分隔（目录项以 `/` 结尾） */
  name: string
  data: Buffer
  /** 修改时间，缺省为打包时刻 */
  mtime?: Date
}

/** 把条目列表打包为 zip Buffer */
export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8')
    const data = entry.data
    const compressed = deflateRawSync(data, { level: 6 })
    /** 压缩后不更小则改用 store（method 0），避免无谓膨胀 */
    const useDeflate = compressed.length < data.length
    const payload = useDeflate ? compressed : data
    const method = useDeflate ? 8 : 0
    const crc = crc32(data)
    const stamp = dosDateTime(entry.mtime ?? now)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(stamp.time, 10)
    local.writeUInt16LE(stamp.date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuffer.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuffer, payload)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(20, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(0x0800, 8)
    centralHeader.writeUInt16LE(method, 10)
    centralHeader.writeUInt16LE(stamp.time, 12)
    centralHeader.writeUInt16LE(stamp.date, 14)
    centralHeader.writeUInt32LE(crc, 16)
    centralHeader.writeUInt32LE(payload.length, 20)
    centralHeader.writeUInt32LE(data.length, 24)
    centralHeader.writeUInt16LE(nameBuffer.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE(0, 38)
    centralHeader.writeUInt32LE(offset, 42)

    central.push(centralHeader, nameBuffer)
    offset += local.length + nameBuffer.length + payload.length
  }

  const centralBuffer = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuffer.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...chunks, centralBuffer, end])
}
