import { ESPLoader, Transport } from 'esptool-js'
import type { EspFlash, FlashProgress } from './types'

const FLASH_BAUD = 460800

const normalize = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function flashEsp(
  port: SerialPort,
  images: { address: number; data: Uint8Array }[],
  options: EspFlash,
  onProgress: (p: FlashProgress) => void,
  log: (line: string) => void
) {
  const transport = new Transport(port, false)
  const loader = new ESPLoader({
    transport,
    baudrate: FLASH_BAUD,
    romBaudrate: 115200,
    terminal: { clean: () => {}, write: (s) => s.trim() && log(s.trim()), writeLine: (s) => log(s) },
  })

  try {
    log('Connecting to the ESP bootloader…')
    await loader.main()

    if (normalize(loader.chip.CHIP_NAME) !== normalize(options.chip)) {
      throw new Error(
        `Connected chip is ${loader.chip.CHIP_NAME}, but the firmware was built for ${options.chip}. Pick the matching board and compile again.`
      )
    }

    const total = images.reduce((n, img) => n + img.data.length, 0)
    const before = images.map((_, i) => images.slice(0, i).reduce((n, img) => n + img.data.length, 0))

    await loader.writeFlash({
      fileArray: images,
      flashMode: 'keep',
      flashFreq: 'keep',
      flashSize: 'keep',
      eraseAll: false,
      compress: true,
      reportProgress: (fileIndex, written) =>
        onProgress({ phase: 'write', done: before[fileIndex] + written, total }),
    })

    log('Resetting the board…')
    await loader.after('hard_reset')
    log('Done — the board is running the new firmware.')
  } finally {
    await transport.disconnect().catch(() => {})
  }
}
