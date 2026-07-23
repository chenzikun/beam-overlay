import { describe, expect, it } from 'vitest'
import { VERSION } from '../src/index'

describe('beam-overlay', () => {
  it('exports VERSION', () => {
    expect(VERSION).toBe('0.1.0')
  })
})
