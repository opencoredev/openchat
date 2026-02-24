// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useEffect } from 'react'

function TestComp() {
  useEffect(() => {
    try {
      sessionStorage.getItem('test-key')
    } catch (e) {
      console.warn('caught error', e)
    }
  }, [])
  return <div>test</div>
}

describe('session test', () => {
  it('catches sessionStorage.getItem error via stubGlobal', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const mockStorage = {
      getItem: vi.fn(() => { throw new Error('storage fail') }),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
    vi.stubGlobal('sessionStorage', mockStorage)
    render(<TestComp />)
    expect(warnSpy).toHaveBeenCalledWith('caught error', expect.any(Error))
    vi.unstubAllGlobals()
    warnSpy.mockRestore()
  })
})
