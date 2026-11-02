/**
 * JSONC 的定点改写。
 *
 * `wrangler.jsonc` 里存着「为什么 R2 被注释掉」「资源 ID 是账号相关的、换账号必须重新
 * 绑定」这类运维说明。用 `JSON.parse` → `JSON.stringify` 回写会把它们**全部抹掉**，
 * 而这些注释恰恰是后来者最需要的信息。
 *
 * 因此本模块只替换目标值对应的那一段字节，其余（注释、空白、缩进、键序）原样保留。
 */

/** 路径的一段：对象用键名，数组用下标。 */
export type JsoncPath = readonly (string | number)[]

interface JsoncNode {
  kind: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'
  /** 值在源文本中的起始偏移（含）。 */
  start: number
  /** 值在源文本中的结束偏移（不含）。 */
  end: number
  value: unknown
  /** 对象的成员：键名 → 成员值的节点。 */
  members?: Map<string, JsoncNode>
  /** 数组的元素节点。 */
  elements?: JsoncNode[]
}

/**
 * 读取 JSONC 里某个路径的值；路径不存在返回 `undefined`。
 *
 * 解析会跳过 `//` 与 `/* *\/` 注释，键名与字符串值按 JSON 转义规则还原。
 */
export function getJsoncValue(source: string, path: JsoncPath): unknown {
  const node = resolvePath(new JsoncParser(source).parse(), path)
  return node?.value
}

/**
 * 把 JSONC 里某个路径的值替换成新值，**只替换那一段字节**，其余原样保留。
 *
 * 路径不存在时抛错 —— 静默新建一个键会让「改错了路径」这件事在部署时才暴露。
 */
export function setJsoncValue(source: string, path: JsoncPath, value: unknown): string {
  const node = resolvePath(new JsoncParser(source).parse(), path)
  if (!node) throw new Error(`JSONC: 路径不存在：${formatPath(path)}`)

  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new Error(`JSONC: 值无法序列化：${formatPath(path)}`)

  return source.slice(0, node.start) + encoded + source.slice(node.end)
}

/** 沿路径走到目标节点；任一段不存在则返回 `undefined`。 */
function resolvePath(root: JsoncNode, path: JsoncPath): JsoncNode | undefined {
  let node: JsoncNode | undefined = root
  for (const segment of path) {
    if (!node) return undefined
    node = typeof segment === 'number' ? node.elements?.[segment] : node.members?.get(segment)
  }
  return node
}

function formatPath(path: JsoncPath): string {
  return path.map((segment) => (typeof segment === 'number' ? `[${segment}]` : segment)).join('.')
}

/** 递归下降的 JSONC 解析器，顺带记录每个值在源文本中的字节区间。 */
class JsoncParser {
  private pos = 0

  constructor(private readonly src: string) {}

  parse(): JsoncNode {
    this.skipTrivia()
    const node = this.parseValue()
    this.skipTrivia()
    return node
  }

  /** 跳过空白与注释。 */
  private skipTrivia(): void {
    for (;;) {
      const ch = this.src[this.pos]
      if (ch === undefined) return
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.pos++
        continue
      }
      if (ch === '/' && this.src[this.pos + 1] === '/') {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++
        continue
      }
      if (ch === '/' && this.src[this.pos + 1] === '*') {
        const end = this.src.indexOf('*/', this.pos + 2)
        this.pos = end === -1 ? this.src.length : end + 2
        continue
      }
      return
    }
  }

  private parseValue(): JsoncNode {
    this.skipTrivia()
    const ch = this.src[this.pos]
    if (ch === '{') return this.parseObject()
    if (ch === '[') return this.parseArray()
    if (ch === '"') return this.parseString()
    if (this.src.startsWith('true', this.pos)) return this.parseLiteral('true', true)
    if (this.src.startsWith('false', this.pos)) return this.parseLiteral('false', false)
    if (this.src.startsWith('null', this.pos)) return this.parseLiteral('null', null)
    return this.parseNumber()
  }

  private parseObject(): JsoncNode {
    const start = this.pos
    this.pos++ // '{'
    const members = new Map<string, JsoncNode>()

    for (;;) {
      this.skipTrivia()
      // 尾随逗号：`,` 之后允许直接 `}`。
      if (this.src[this.pos] === '}') {
        this.pos++
        break
      }

      const key = this.parseString()
      this.skipTrivia()
      if (this.src[this.pos] !== ':') throw new SyntaxError(`JSONC: 期望 ':'，位置 ${this.pos}`)
      this.pos++

      const value = this.parseValue()
      members.set(String(key.value), value)

      this.skipTrivia()
      if (this.src[this.pos] === ',') {
        this.pos++
        continue
      }
      if (this.src[this.pos] === '}') {
        this.pos++
        break
      }
      throw new SyntaxError(`JSONC: 对象中期望 ',' 或 '}'，位置 ${this.pos}`)
    }

    const value = Object.fromEntries([...members].map(([key, node]) => [key, node.value]))
    return { kind: 'object', start, end: this.pos, value, members }
  }

  private parseArray(): JsoncNode {
    const start = this.pos
    this.pos++ // '['
    const elements: JsoncNode[] = []

    for (;;) {
      this.skipTrivia()
      if (this.src[this.pos] === ']') {
        this.pos++
        break
      }

      elements.push(this.parseValue())

      this.skipTrivia()
      if (this.src[this.pos] === ',') {
        this.pos++
        continue
      }
      if (this.src[this.pos] === ']') {
        this.pos++
        break
      }
      throw new SyntaxError(`JSONC: 数组中期望 ',' 或 ']'，位置 ${this.pos}`)
    }

    return {
      kind: 'array',
      start,
      end: this.pos,
      value: elements.map((node) => node.value),
      elements,
    }
  }

  private parseString(): JsoncNode {
    const start = this.pos
    this.pos++ // '"'
    let out = ''

    for (;;) {
      const ch = this.src[this.pos]
      if (ch === undefined) throw new SyntaxError('JSONC: 字符串未闭合')
      if (ch === '"') {
        this.pos++
        break
      }
      if (ch === '\\') {
        const escapeChar = this.src[this.pos + 1]
        this.pos += 2
        switch (escapeChar) {
          case '"':
            out += '"'
            break
          case '\\':
            out += '\\'
            break
          case '/':
            out += '/'
            break
          case 'b':
            out += '\b'
            break
          case 'f':
            out += '\f'
            break
          case 'n':
            out += '\n'
            break
          case 'r':
            out += '\r'
            break
          case 't':
            out += '\t'
            break
          case 'u': {
            const hex = this.src.slice(this.pos, this.pos + 4)
            const code = Number.parseInt(hex, 16)
            if (Number.isNaN(code)) throw new SyntaxError(`JSONC: 非法 \\u 转义，位置 ${this.pos}`)
            out += String.fromCharCode(code)
            this.pos += 4
            break
          }
          default:
            throw new SyntaxError(`JSONC: 非法转义 \\${escapeChar ?? ''}`)
        }
        continue
      }
      out += ch
      this.pos++
    }

    return { kind: 'string', start, end: this.pos, value: out }
  }

  private parseNumber(): JsoncNode {
    const start = this.pos
    const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos))
    if (!match?.[0]) throw new SyntaxError(`JSONC: 位置 ${this.pos} 处不是合法值`)
    this.pos += match[0].length
    return { kind: 'number', start, end: this.pos, value: Number(match[0]) }
  }

  private parseLiteral(text: string, value: unknown): JsoncNode {
    const start = this.pos
    this.pos += text.length
    return { kind: text === 'null' ? 'null' : 'boolean', start, end: this.pos, value }
  }
}
