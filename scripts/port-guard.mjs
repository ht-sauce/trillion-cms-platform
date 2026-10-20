#!/usr/bin/env node
/**
 * 端口守护：查询 / 结束 / 释放被占用端口的进程（开发启动器与上线器共用）
 *
 * 背景：`pnpm allDev`（开发形态）与 `pnpm release:*`（上线形态）在启动前都要先结束
 * 占用端口的旧进程，否则会遇到「端口被占用」而反复排查；两处共用本模块，
 * 避免 netstat / lsof 的解析逻辑出现两份实现。
 *
 * 跨平台：
 * - Windows：`netstat -ano -p tcp` 查 LISTENING 行取 PID，`taskkill /T /F` 连子进程一起杀
 *   （不加 /T 会残留派生的 nuxt / nest 子进程，端口仍被占）
 * - POSIX：`lsof -ti tcp:<port> -sTCP:LISTEN` 取 PID，`process.kill(pid, 'SIGKILL')`
 */
import { execSync } from 'node:child_process'

export const IS_WIN = process.platform === 'win32'

/** 查询监听指定端口的进程号列表（跨平台） */
export function findPortPids(port) {
  try {
    if (IS_WIN) {
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      const pattern = new RegExp(`:${port}\\s`)
      const pids = output
        .split(/\r?\n/)
        .filter((line) => /LISTENING/i.test(line) && pattern.test(line))
        .map((line) => line.trim().split(/\s+/).pop())
        .filter(Boolean)
      return [...new Set(pids)]
    }
    const output = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    })
    return [...new Set(output.split(/\s+/).filter(Boolean))]
  } catch {
    /** 无占用时 lsof 返回非零退出码，属正常情况 */
    return []
  }
}

/**
 * 一次性取回本机所有 LISTENING 端口（跨平台），供就绪轮询批量判断
 * 与 `findPortPids()` 的区别：这里只看端口集合（不取 PID），用于「是否已启动完成」的判定
 * @returns {Set<number>}
 */
export function findListeningPorts() {
  const ports = new Set()
  try {
    if (IS_WIN) {
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      for (const line of output.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue
        const match = line
          .trim()
          .split(/\s+/)[1]
          ?.match(/:(\d+)$/)
        if (match) ports.add(Number(match[1]))
      }
      return ports
    }
    const output = execSync('lsof -nP -iTCP -sTCP:LISTEN', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const line of output.split(/\r?\n/)) {
      const match = line.match(/:(\d+)\s*\(LISTEN\)/)
      if (match) ports.add(Number(match[1]))
    }
  } catch {
    /** 无监听端口时命令可能返回非零退出码，属正常情况 */
  }
  return ports
}

/** 结束进程（Windows 连子进程一起杀，避免残留 nuxt / nest 进程） */
export function killPid(pid) {
  try {
    if (IS_WIN) execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
    else process.kill(Number(pid), 'SIGKILL')
  } catch {
    /** 进程可能已自行退出，忽略 */
  }
}

/**
 * 释放端口：发现旧进程即结束，并等待端口真正可用
 * @param {number} port 目标端口
 * @param {string} appName 应用短名 / 标题（仅用于日志）
 * @param {{ tag?: string }} [options] tag 为日志前缀，默认「启动器」（上线器传「上线器」）
 * @returns {Promise<boolean>} 端口最终是否可用
 */
export async function freePort(port, appName, options = {}) {
  const tag = options.tag || '启动器'
  const pids = findPortPids(port)
  if (!pids.length) {
    console.log(`[${tag}] ${appName} 端口 ${port} 空闲`)
    return true
  }

  console.log(`[${tag}] ${appName} 端口 ${port} 被旧进程占用（PID ${pids.join(', ')}），先结束再启动`)
  pids.forEach(killPid)

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    const rest = findPortPids(port)
    if (!rest.length) return true
    /** 前 1 秒内可能处于 TIME_WAIT，若持续占用则再补一刀 */
    if (attempt === 4 || attempt === 8) rest.forEach(killPid)
  }

  console.warn(`[${tag}] 警告：端口 ${port} 仍被占用（PID ${findPortPids(port).join(', ')}），启动可能失败`)
  return false
}
