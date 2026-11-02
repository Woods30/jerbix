/**
 * 执行变更计划：**纯 IO**，不做任何判断。
 *
 * 计划里已经决定了「改成什么」，这里只负责读写。把判断留在 `plan.ts`，才能让
 * 「改了哪些文件」在单测里被断言，而不是靠跑完脚本再翻盘。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import type { InitPlan } from './plan'

/** 最小文件接口：单测里换成内存实现，CLI 里接 `node:fs`。 */
export interface FileIo {
  read: (path: string) => string
  write: (path: string, content: string) => void
}

export interface ApplyResult {
  /** 内容真的变了的文件。 */
  written: string[]
  /** 已经是目标值的文件（重跑时的常态）。 */
  unchanged: string[]
}

/**
 * 按计划写文件，返回改了哪些。
 *
 * 内容没变就不写：既省掉无意义的 mtime 变动，也让「重跑 init 不产生 diff」
 * 成为可断言的事实。
 */
export function applyPlan(plan: InitPlan, io: FileIo): ApplyResult {
  // 先全部读入并算出结果，再统一落盘：中途发现某个文件缺失时，
  // 前面几个文件不会已经被改掉（半成品比什么都不改更难收拾）。
  const prepared = plan.files.map((file) => {
    const current = io.read(file.path)
    if (current === '') throw new Error(`文件不存在或为空：${file.path}`)
    return { path: file.path, current, next: file.transform(current) }
  })

  const written: string[] = []
  const unchanged: string[] = []
  for (const entry of prepared) {
    if (entry.next === entry.current) {
      unchanged.push(entry.path)
      continue
    }
    io.write(entry.path, entry.next)
    written.push(entry.path)
  }

  return { written, unchanged }
}

/** 接 `node:fs` 的实现，路径相对当前工作目录。 */
export const fsIo: FileIo = {
  read: (path) => readFileSync(path, 'utf-8'),
  write: (path, content) => writeFileSync(path, content),
}
