import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareEnvFile, writeEnvFile } from '../../scripts/lib/env-file'

const created: string[] = []

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'env-file-'))
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('prepareEnvFile', () => {
  it('.env 已存在时原样返回，不覆盖', () => {
    const dir = makeDir()
    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'BETTER_AUTH_SECRET=abc123\n')

    expect(prepareEnvFile(envPath, join(dir, '.env.example'))).toBe('BETTER_AUTH_SECRET=abc123\n')
  })

  it('.env 不存在时从 .env.example 复制一份', () => {
    const dir = makeDir()
    const examplePath = join(dir, '.env.example')
    writeFileSync(examplePath, '# 注释\nBETTER_AUTH_SECRET=\n')

    const content = prepareEnvFile(join(dir, '.env'), examplePath)

    expect(content).toBe('# 注释\nBETTER_AUTH_SECRET=\n')
    expect(readFileSync(join(dir, '.env'), 'utf-8')).toBe('# 注释\nBETTER_AUTH_SECRET=\n')
  })

  it('复制出来的 .env 权限是 0600', () => {
    const dir = makeDir()
    const examplePath = join(dir, '.env.example')
    writeFileSync(examplePath, 'BETTER_AUTH_SECRET=\n')

    prepareEnvFile(join(dir, '.env'), examplePath)

    const mode = lstatSync(join(dir, '.env')).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('.env 与 .env.example 都不存在时抛错', () => {
    const dir = makeDir()

    expect(() => prepareEnvFile(join(dir, '.env'), join(dir, '.env.example'))).toThrow(
      /\.env\.example/,
    )
  })

  it('.env 是符号链接时拒绝使用', () => {
    const dir = makeDir()
    const target = join(dir, 'real.env')
    writeFileSync(target, 'BETTER_AUTH_SECRET=abc123\n')
    symlinkSync(target, join(dir, '.env'))

    expect(() => prepareEnvFile(join(dir, '.env'), join(dir, '.env.example'))).toThrow(/符号链接/)
  })
})

describe('writeEnvFile', () => {
  it('写入后权限是 0600', () => {
    const dir = makeDir()
    const envPath = join(dir, '.env')

    writeEnvFile(envPath, 'BETTER_AUTH_SECRET=secret\n')

    expect(readFileSync(envPath, 'utf-8')).toBe('BETTER_AUTH_SECRET=secret\n')
    expect(lstatSync(envPath).mode & 0o777).toBe(0o600)
  })

  it('已存在的文件被改写后权限仍是 0600', () => {
    const dir = makeDir()
    const envPath = join(dir, '.env')
    writeFileSync(envPath, 'OLD=1\n')

    writeEnvFile(envPath, 'NEW=2\n')

    expect(readFileSync(envPath, 'utf-8')).toBe('NEW=2\n')
    expect(lstatSync(envPath).mode & 0o777).toBe(0o600)
  })

  it('目标是符号链接时拒绝写入', () => {
    const dir = makeDir()
    const target = join(dir, 'real.env')
    writeFileSync(target, 'KEEP=1\n')
    symlinkSync(target, join(dir, '.env'))

    expect(() => writeEnvFile(join(dir, '.env'), 'OVERWRITE=1\n')).toThrow()
    // 链接指向的真实文件不能被动过。
    expect(readFileSync(target, 'utf-8')).toBe('KEEP=1\n')
  })

  it('写入不存在的路径时创建该文件', () => {
    const dir = makeDir()
    const envPath = join(dir, '.env')

    writeEnvFile(envPath, 'A=1\n')

    expect(existsSync(envPath)).toBe(true)
  })
})
