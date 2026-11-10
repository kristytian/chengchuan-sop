// Minimal Office Open XML access shared by the .docx and .xlsx readers:
// unzip the package, parse a part into an ordered element tree.
import { XMLParser } from 'fast-xml-parser'
import { unzipSync } from 'fflate'

export type ZipEntries = Record<string, Uint8Array>

/** An element in document order. Text nodes are plain strings. */
export interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: XmlNode[]
}
export type XmlNode = XmlElement | string

const utf8 = new TextDecoder()

// Keep every value as text (version "02" must not become 2) and keep order.
// htmlEntities also decodes numeric references (&#25991;), which the ledger's
// inline strings use for every CJK character; deprecated but stable in the
// pinned 5.11.2.
const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  htmlEntities: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
})

export function readZip(bytes: Uint8Array): ZipEntries {
  return unzipSync(bytes)
}

/** Parses one part of the package; throws if it is missing. */
export function readPart(entries: ZipEntries, name: string): XmlElement {
  const data = entries[name]
  if (!data) throw new Error(`package has no ${name}`)
  return parseXml(utf8.decode(data))
}

export function parseXml(xml: string): XmlElement {
  const root = toNodes(parser.parse(xml)).find(isElement)
  if (!root) throw new Error('XML has no root element')
  return root
}

export function isElement(node: XmlNode): node is XmlElement {
  return typeof node !== 'string'
}

/** Direct children with the given tag. */
export function children(el: XmlElement, tag: string): XmlElement[] {
  return el.children.filter((n): n is XmlElement => isElement(n) && n.tag === tag)
}

export function child(el: XmlElement, tag: string): XmlElement | undefined {
  return children(el, tag)[0]
}

/** All descendants with the given tag, in document order. */
export function descendants(el: XmlElement, tag: string): XmlElement[] {
  const found: XmlElement[] = []
  for (const node of el.children) {
    if (!isElement(node)) continue
    if (node.tag === tag) found.push(node)
    found.push(...descendants(node, tag))
  }
  return found
}

/** Concatenated text of all text nodes under the element. */
export function textContent(el: XmlElement): string {
  return el.children.map((n) => (isElement(n) ? textContent(n) : n)).join('')
}

// fast-xml-parser's preserveOrder shape: [{ tag: [...children], ':@': attrs }, { '#text': '…' }]
function toNodes(raw: unknown): XmlNode[] {
  if (!Array.isArray(raw)) return []
  const nodes: XmlNode[] = []
  for (const item of raw as Record<string, unknown>[]) {
    for (const [key, value] of Object.entries(item)) {
      if (key === ':@') continue
      if (key === '#text') nodes.push(String(value))
      else nodes.push({ tag: key, attrs: (item[':@'] ?? {}) as Record<string, string>, children: toNodes(value) })
    }
  }
  return nodes
}
