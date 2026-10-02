import { SerialReader, sleep, writeBytes } from './serial-reader'
import type { FlashProgress, Stk500Flash } from './types'

// STK500v1 as spoken by Optiboot (Uno, Nano, Pro Mini, bare ATmega328P).
const STK_OK = 0x10
const STK_INSYNC = 0x14
const CRC_EOP = 0x20
const GET_SYNC = 0x30
const ENTER_PROGMODE = 0x50
const LEAVE_PROGMODE = 0x51
const LOAD_ADDRESS = 0x55
const PROG_PAGE = 0x64
const READ_PAGE = 0x74
const READ_SIGN = 0x75
const MEM_FLASH = 0x46

const hex = (bytes: ArrayLike<number>) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ')

class Stk500 {
  constructor(private port: SerialPort, private reader: SerialReader) {}

  async command(body: number[], replyLength = 0, timeoutMs = 600): Promise<Uint8Array> {
    await writeBytes(this.port, Uint8Array.from([...body, CRC_EOP]))
    const reply = await this.reader.read(replyLength + 2, timeoutMs)
    if (reply[0] !== STK_INSYNC || reply[reply.length - 1] !== STK_OK) {
      throw new Error(`Bootloader replied out of sync (${hex(reply)})`)
    }
    return reply.subarray(1, reply.length - 1)
  }

  // Pulsing DTR/RTS resets the MCU through the board's auto-reset capacitor,
  // and Optiboot listens for about a second after reset.
  async reset() {
    await this.port.setSignals({ dataTerminalReady: false, requestToSend: false })
    await sleep(250)
    await this.port.setSignals({ dataTerminalReady: true, requestToSend: true })
    await sleep(50)
    this.reader.drain()
  }

  async sync(attempts = 8): Promise<boolean> {
    for (let i = 0; i < attempts; i++) {
      try {
        await this.command([GET_SYNC], 0, 200)
        this.reader.drain()
        return true
      } catch {
        this.reader.drain()
      }
    }
    return false
  }

  loadAddress(byteAddress: number) {
    const word = byteAddress >> 1
    return this.command([LOAD_ADDRESS, word & 0xff, (word >> 8) & 0xff])
  }
}

export async function flashStk500(
  port: SerialPort,
  image: Uint8Array,
  options: Stk500Flash,
  onProgress: (p: FlashProgress) => void,
  log: (line: string) => void
) {
  const { pageSize } = options

  for (const baudRate of options.baudRates) {
    log(`Opening port at ${baudRate} baud and resetting the board…`)
    await port.open({ baudRate })
    const reader = new SerialReader(port)
    const stk = new Stk500(port, reader)
    try {
      await stk.reset()
      if (!(await stk.sync())) {
        log(`No response from the bootloader at ${baudRate} baud.`)
        continue
      }
      log('Bootloader in sync.')

      const signature = await stk.command([READ_SIGN], 3)
      if (hex(signature) !== hex(options.signature)) {
        throw new Error(
          `Device signature ${hex(signature)} does not match the selected board (${hex(options.signature)}). Check the board selection.`
        )
      }
      log(`Device signature ${hex(signature)} OK.`)

      await stk.command([ENTER_PROGMODE])
      const pages = Math.ceil(image.length / pageSize)
      const pageAt = (n: number) => {
        const page = new Uint8Array(pageSize).fill(0xff)
        page.set(image.subarray(n * pageSize, (n + 1) * pageSize))
        return page
      }

      for (let n = 0; n < pages; n++) {
        await stk.loadAddress(n * pageSize)
        await stk.command([PROG_PAGE, pageSize >> 8, pageSize & 0xff, MEM_FLASH, ...pageAt(n)], 0, 1500)
        onProgress({ phase: 'write', done: n + 1, total: pages })
      }
      log(`Wrote ${image.length} bytes.`)

      for (let n = 0; n < pages; n++) {
        await stk.loadAddress(n * pageSize)
        const read = await stk.command([READ_PAGE, pageSize >> 8, pageSize & 0xff, MEM_FLASH], pageSize, 1500)
        const expected = pageAt(n)
        const mismatch = read.findIndex((b, i) => b !== expected[i])
        if (mismatch !== -1) {
          throw new Error(`Verification failed at 0x${(n * pageSize + mismatch).toString(16)}.`)
        }
        onProgress({ phase: 'verify', done: n + 1, total: pages })
      }
      log('Verified.')

      await stk.command([LEAVE_PROGMODE])
      log('Done — the board is running the new firmware.')
      return
    } finally {
      await reader.close()
      await port.close().catch(() => {})
    }
  }

  throw new Error(
    'Could not reach the bootloader. Check the cable and port, and that the board has an Arduino (Optiboot) bootloader — a bare ATmega328P on a custom PCB needs one burned once over ISP.'
  )
}
