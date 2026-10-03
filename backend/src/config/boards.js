// Build targets the firmware compiler supports, and how the browser flashes each one.
// `match` is tested in order against the pipeline's free-text `processing_unit`.

export const PLATFORM_INDEX_URLS = [
  'https://espressif.github.io/arduino-esp32/package_esp32_index.json',
  'https://arduino.esp8266.com/stable/package_esp8266com_index.json',
];

const OPTIBOOT_328P = { signature: [0x1e, 0x95, 0x0f], pageSize: 128 };

export const BOARDS = [
  {
    id: 'esp32s3',
    label: 'ESP32-S3',
    fqbn: 'esp32:esp32:esp32s3',
    platform: 'esp32:esp32',
    match: [/esp32[\s_-]?s3/i, /nano[\s_-]?esp32/i],
    flash: { protocol: 'esptool', chip: 'ESP32-S3' },
  },
  {
    id: 'esp32c3',
    label: 'ESP32-C3',
    fqbn: 'esp32:esp32:esp32c3',
    platform: 'esp32:esp32',
    match: [/esp32[\s_-]?c3/i],
    flash: { protocol: 'esptool', chip: 'ESP32-C3' },
  },
  {
    id: 'esp32',
    label: 'ESP32 (WROOM / DevKit)',
    fqbn: 'esp32:esp32:esp32',
    platform: 'esp32:esp32',
    match: [/esp32/i],
    flash: { protocol: 'esptool', chip: 'ESP32' },
  },
  {
    id: 'esp8266',
    label: 'ESP8266 (ESP-12 / NodeMCU, 4 MB)',
    fqbn: 'esp8266:esp8266:nodemcuv2',
    platform: 'esp8266:esp8266',
    match: [/esp8266/i, /esp-?12/i, /nodemcu/i],
    flash: { protocol: 'esptool', chip: 'ESP8266' },
  },
  {
    id: 'mega2560',
    label: 'Arduino Mega 2560',
    fqbn: 'arduino:avr:mega:cpu=atmega2560',
    platform: 'arduino:avr',
    match: [/mega\s*2560/i, /atmega2560/i, /arduino\s*mega/i],
    flash: {
      protocol: 'manual',
      note: 'The Mega 2560 bootloader uses STK500v2, which in-browser upload does not support yet. Download the .hex and flash it with Arduino IDE or avrdude.',
    },
  },
  {
    id: 'leonardo',
    label: 'Arduino Leonardo / Micro (ATmega32U4)',
    fqbn: 'arduino:avr:leonardo',
    platform: 'arduino:avr',
    match: [/32u4/i, /leonardo/i, /arduino\s*micro\b/i],
    flash: {
      protocol: 'manual',
      note: 'ATmega32U4 boards use the AVR109 bootloader, which in-browser upload does not support yet. Download the .hex and flash it with Arduino IDE or avrdude.',
    },
  },
  {
    id: 'nano',
    label: 'Arduino Nano (ATmega328P)',
    fqbn: 'arduino:avr:nano:cpu=atmega328',
    platform: 'arduino:avr',
    match: [/nano/i],
    // Older Nanos and clones ship the 57600-baud bootloader; the flasher falls back to it.
    flash: { protocol: 'stk500v1', baudRates: [115200, 57600], ...OPTIBOOT_328P },
  },
  {
    id: 'promini',
    label: 'Arduino Pro Mini (5V, 16 MHz)',
    fqbn: 'arduino:avr:pro:cpu=16MHzatmega328',
    platform: 'arduino:avr',
    match: [/pro\s*mini/i],
    flash: { protocol: 'stk500v1', baudRates: [57600], ...OPTIBOOT_328P },
  },
  {
    id: 'uno',
    label: 'Arduino Uno / ATmega328P (Optiboot)',
    fqbn: 'arduino:avr:uno',
    platform: 'arduino:avr',
    match: [/uno/i, /atmega\s*328/i, /arduino/i, /\bavr\b/i, /atmega/i],
    flash: { protocol: 'stk500v1', baudRates: [115200, 57600], ...OPTIBOOT_328P },
  },
];

export const findBoard = (id) => BOARDS.find((b) => b.id === id) || null;

export const resolveBoard = (processingUnit = '') =>
  BOARDS.find((b) => b.match.some((re) => re.test(processingUnit))) || null;

export const publicBoard = ({ match: _match, ...board }) => board;
