import {act, render, screen} from '@testing-library/react'
import {describe, expect, it} from 'vitest'

import {useDeferredRequestKey} from './useDeferredRequestKey'

/**
 * Records what the hook handed out on every render, so a test can assert on the
 * signal a suspending read would have captured rather than only the last one.
 */
function harness() {
  const signals: AbortSignal[] = []

  function Probe({requestKey}: {requestKey: string}) {
    const {deferredKey, signal, isPending} = useDeferredRequestKey(requestKey)
    signals.push(signal)

    return <div data-testid="out">{`${deferredKey}|${isPending ? 'pending' : 'idle'}`}</div>
  }

  return {signals, Probe}
}

const output = () => screen.getByTestId('out').textContent

describe('useDeferredRequestKey', () => {
  it('starts on the key it was given', () => {
    const {Probe} = harness()
    render(<Probe requestKey="a" />)

    expect(output()).toBe('a|idle')
  })

  it('catches up to a new key', async () => {
    const {Probe} = harness()
    const {rerender} = render(<Probe requestKey="a" />)

    await act(async () => rerender(<Probe requestKey="b" />))

    expect(output()).toBe('b|idle')
  })

  it('aborts the signal the previous key was read with', async () => {
    const {signals, Probe} = harness()
    const {rerender} = render(<Probe requestKey="a" />)
    const first = signals[0]

    await act(async () => rerender(<Probe requestKey="b" />))

    // The read for the abandoned key must not stay in flight holding a listener.
    expect(first.aborted).toBe(true)
  })

  it('hands out a live signal for the key it settled on', async () => {
    const {signals, Probe} = harness()
    const {rerender} = render(<Probe requestKey="a" />)

    // Search-as-you-type moves the key faster than the reads settle, including
    // more than once before the hook has caught up.
    await act(async () => {
      rerender(<Probe requestKey="b" />)
      rerender(<Probe requestKey="c" />)
    })
    await act(async () => rerender(<Probe requestKey="d" />))

    // Whatever it aborted along the way, the signal a suspending read would
    // start with now has to be live, or that read is cancelled before it begins.
    expect(output()).toBe('d|idle')
    expect(signals[signals.length - 1].aborted).toBe(false)
  })
})
