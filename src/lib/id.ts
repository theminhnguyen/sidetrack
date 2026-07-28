import { customAlphabet } from 'nanoid'

const generate = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)

export type IdPrefix = 'u' | 't' | 'm' | 'log'

export function createId(prefix: IdPrefix): string {
  return `${prefix}_${generate()}`
}
