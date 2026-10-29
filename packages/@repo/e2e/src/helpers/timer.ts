import ora from 'ora'

export function startTimer(label: string): {end: () => void; fail: (reason: string) => void} {
  const spinner = ora(label).start()
  const start = Date.now()
  return {
    end: () => spinner.succeed(`${label} (${formatMs(Date.now() - start)})`),
    fail: (reason) => spinner.fail(`${label} (${formatMs(Date.now() - start)}): ${reason}`),
  }
}

function formatMs(ms: number) {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}
