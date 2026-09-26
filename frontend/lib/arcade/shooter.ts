/**
 * The arcade shooter played while a pipeline run is in progress.
 *
 * Framework-free on purpose: the React window only mounts a canvas, switches
 * the loop on and off, and calls `destroy()`. Everything that could outlive the
 * window — the rAF loop, key listeners, references to the canvas — is owned
 * here, so there is one place that has to get teardown right.
 *
 * Why the kontra objects are created ONCE per page, not once per game
 * --------------------------------------------------------------------
 * kontra 10 registers an `on('init', ...)` callback in its module-level event
 * registry for every GameLoop and every GameObject/Sprite it constructs, and
 * those callbacks are anonymous, so `off()` can never remove them. GameLoop
 * additionally attaches window focus/blur listeners that are never removed
 * unless it is built with `blur: true`.
 *
 * So the obvious shape — a new loop per game, a new Sprite per bullet — grows
 * kontra's registry for the life of the tab, and every retained sprite keeps
 * its canvas context (and so the unmounted canvas) alive. Instead there is one
 * loop and fixed sprite pools, built lazily on the first game and reused by
 * every game after it. Each game borrows them, and `destroy()` hands them back
 * with their context cleared, so nothing retained points at a dead canvas.
 */

import { GameLoop, Sprite, collides } from 'kontra'

export const ARCADE_WIDTH = 272
export const ARCADE_HEIGHT = 352

export interface ShooterStats {
  score: number
  lives: number
  over: boolean
}

export interface ShooterOptions {
  canvas: HTMLCanvasElement
  /** The player ship at native pixel size; drawn at PIXEL_SCALE. Must be loaded. */
  playerImage: HTMLImageElement
  onStats: (stats: ShooterStats) => void
}

export interface Shooter {
  /**
   * Start or stop the kontra loop. Stopping cancels the animation frame, so
   * nothing updates or draws; the game state lives in this closure and the
   * canvas keeps its last frame, so starting again resumes where it stopped.
   */
  setRunning(running: boolean): void
  /**
   * Scale the game to a new on-screen width (CSS px). The playfield keeps its
   * logical ARCADE_WIDTH x ARCADE_HEIGHT and 3:4 shape; only the backing store
   * and the draw transform change, so the game plays identically at any size
   * and the pixels stay sharp instead of being stretched by CSS. Redraws the
   * current frame, so a paused game does not go blank while it is resized.
   */
  resize(cssWidth: number): void
  /** Stop the loop, remove every listener, and release the canvas. Idempotent. */
  destroy(): void
}

// ---- tuning -----------------------------------------------------------------
// kontra's loop runs a fixed 60 updates/s and sprite velocities are per update,
// so speeds below are pixels per frame unless named otherwise.

const PIXEL_SCALE = 2
const PLAYER_SPEED = 2.4
const PLAYER_LIVES = 3
const SHOT_SPEED = 5
const SHOT_COOLDOWN = 16
const BOMB_SPEED = 2
const INVULNERABLE_FRAMES = 90
const READY_FRAMES = 70

const COLS = 6
const ROWS = 3
const CELL_W = 34
const CELL_H = 24
const MARCH_SPEED = 0.3
const MARCH_DROP = 10
const BOMB_INTERVAL = [50, 110] as const

const POOL = { shots: 8, bombs: 5, sparks: 10 } as const

const COLOR = {
  space: '#05060b',
  star: '#8a93a6',
  enemy: '#63e6ff',
  shot: '#fff3a3',
  bomb: '#ff5d73',
  spark: '#ffd166',
  text: '#f5f5f5',
  dim: '#8a93a6',
}

// Two-frame invader, one character per pixel.
const ENEMY_FRAMES = [
  ['..X.....X..', '...X...X...', '..XXXXXXX..', '.XX.XXX.XX.', 'XXXXXXXXXXX', 'X.XXXXXXX.X', 'X.X.....X.X', '...XX.XX...'],
  ['..X.....X..', 'X..X...X..X', 'X.XXXXXXX.X', 'XXX.XXX.XXX', 'XXXXXXXXXXX', '.XXXXXXXXX.', '..X.....X..', '.X.......X.'],
]

// ---- shared, page-lifetime resources ------------------------------------------

type Pooled = Sprite & { active: boolean }

interface Resources {
  loop: ReturnType<typeof GameLoop>
  player: Pooled
  enemies: Pooled[]
  shots: Pooled[]
  bombs: Pooled[]
  sparks: Pooled[]
  enemyFrames: HTMLCanvasElement[]
}

let resources: Resources | null = null
/** Teardown of the game currently holding `resources`, if any. */
let releaseActive: (() => void) | null = null

const noop = () => {}

function bitmap(rows: string[], color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = rows[0].length * PIXEL_SCALE
  canvas.height = rows.length * PIXEL_SCALE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = color
  rows.forEach((row, y) =>
    [...row].forEach((cell, x) => {
      if (cell === 'X') ctx.fillRect(x * PIXEL_SCALE, y * PIXEL_SCALE, PIXEL_SCALE, PIXEL_SCALE)
    })
  )
  return canvas
}

function pooled(props: Parameters<typeof Sprite>[0]): Pooled {
  const sprite = Sprite(props) as Pooled
  sprite.active = false
  return sprite
}

function getResources(): Resources {
  if (resources) return resources

  const enemyFrames = ENEMY_FRAMES.map((rows) => bitmap(rows, COLOR.enemy))

  resources = {
    // blur: true keeps kontra from attaching window focus/blur listeners it
    // never removes. Pausing on focus loss is the window's job instead.
    loop: GameLoop({ update: noop, render: noop, clearCanvas: false, blur: true }),
    player: pooled({}),
    enemies: Array.from({ length: COLS * ROWS }, () => pooled({ image: enemyFrames[0] })),
    shots: Array.from({ length: POOL.shots }, () => pooled({ width: 2, height: 6, color: COLOR.shot })),
    bombs: Array.from({ length: POOL.bombs }, () => pooled({ width: 2, height: 6, color: COLOR.bomb })),
    sparks: Array.from({ length: POOL.sparks }, () =>
      pooled({
        width: 1,
        height: 1,
        render(this: Pooled) {
          // An expanding ring of four pixels, fading over the sprite's ttl.
          const age = 18 - this.ttl
          const r = 2 + age * 0.7
          this.context.globalAlpha = Math.max(0, this.ttl / 18)
          this.context.fillStyle = COLOR.spark
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.4], [0, 1.4]]) {
            this.context.fillRect(dx * r, dy * r, 2, 2)
          }
        },
      })
    ),
    enemyFrames,
  }
  return resources
}

const allSprites = (r: Resources): Pooled[] => [r.player, ...r.enemies, ...r.shots, ...r.bombs, ...r.sparks]

const take = (pool: Pooled[]) => pool.find((s) => !s.active) ?? null

// ---- the game -----------------------------------------------------------------

export function createShooter({ canvas, playerImage, onStats }: ShooterOptions): Shooter {
  // One game at a time. A second create (React StrictMode's remount, or a new
  // window racing an old one's unmount) takes the pools over cleanly.
  releaseActive?.()

  const r = getResources()
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const context = canvas.getContext('2d')!

  // Resizing a canvas resets its whole 2D state, so the transform and the
  // smoothing flag are re-applied every time rather than set once.
  function fit(cssWidth: number) {
    const scale = (cssWidth / ARCADE_WIDTH) * dpr
    canvas.width = Math.round(ARCADE_WIDTH * scale)
    canvas.height = Math.round(ARCADE_HEIGHT * scale)
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.imageSmoothingEnabled = false
  }
  fit(ARCADE_WIDTH)

  // The ship is upscaled once into its own canvas, so kontra draws it 1:1 and
  // the sprite's width/height (used for collisions) are the drawn size.
  const shipCanvas = document.createElement('canvas')
  shipCanvas.width = playerImage.naturalWidth * PIXEL_SCALE
  shipCanvas.height = playerImage.naturalHeight * PIXEL_SCALE
  const shipCtx = shipCanvas.getContext('2d')!
  shipCtx.imageSmoothingEnabled = false
  shipCtx.drawImage(playerImage, 0, 0, shipCanvas.width, shipCanvas.height)

  for (const sprite of allSprites(r)) {
    sprite.context = context
    sprite.active = false
  }
  r.player.image = shipCanvas
  r.player.width = shipCanvas.width
  r.player.height = shipCanvas.height
  r.loop.context = context

  const enemyW = r.enemyFrames[0].width
  const enemyH = r.enemyFrames[0].height
  const playerY = ARCADE_HEIGHT - r.player.height - 12

  const stars = Array.from({ length: 48 }, () => ({
    x: Math.random() * ARCADE_WIDTH,
    y: Math.random() * ARCADE_HEIGHT,
    speed: 0.15 + Math.random() * 0.6,
  }))

  // ---- state (everything a pause must preserve) ----
  let score = 0
  let lives = PLAYER_LIVES
  let over = false
  let cooldown = 0
  let invulnerable = 0
  let ready = READY_FRAMES
  let bombTimer = BOMB_INTERVAL[1]
  let marchX = 0
  let marchY = 0
  let marchDir = 1
  let animFrame = 0
  let animTimer = 0
  let lastStats = ''

  const keys = { left: false, right: false, fire: false }
  let restartArmed = false

  function spawnWave() {
    marchX = (ARCADE_WIDTH - ((COLS - 1) * CELL_W + enemyW)) / 2
    marchY = 36
    marchDir = 1
    r.enemies.forEach((enemy) => {
      enemy.active = true
    })
    r.bombs.forEach((b) => (b.active = false))
    bombTimer = BOMB_INTERVAL[1]
  }

  function reset() {
    score = 0
    lives = PLAYER_LIVES
    over = false
    cooldown = 0
    invulnerable = 0
    ready = READY_FRAMES
    restartArmed = false
    r.player.x = (ARCADE_WIDTH - r.player.width) / 2
    r.player.y = playerY
    for (const pool of [r.shots, r.sparks]) pool.forEach((s) => (s.active = false))
    spawnWave()
  }

  function burst(x: number, y: number) {
    const spark = take(r.sparks)
    if (!spark) return
    spark.active = true
    spark.x = x
    spark.y = y
    spark.ttl = 18
  }

  function emitStats() {
    const key = `${score}|${lives}|${over}`
    if (key === lastStats) return
    lastStats = key
    onStats({ score, lives, over })
  }

  function loseLife() {
    burst(r.player.x + r.player.width / 2, r.player.y + r.player.height / 2)
    lives -= 1
    invulnerable = INVULNERABLE_FRAMES
    if (lives <= 0) {
      over = true
      // The fire key is probably held at the moment of death; require a fresh
      // press so the game-over screen is not skipped instantly.
      restartArmed = !keys.fire
    }
  }

  function update() {
    for (const star of stars) {
      star.y += star.speed
      if (star.y > ARCADE_HEIGHT) {
        star.y = 0
        star.x = Math.random() * ARCADE_WIDTH
      }
    }

    r.sparks.forEach((s) => {
      if (!s.active) return
      s.ttl -= 1
      if (s.ttl <= 0) s.active = false
    })

    if (over) {
      if (!keys.fire) restartArmed = true
      else if (restartArmed) reset()
      emitStats()
      return
    }

    if (ready > 0) ready -= 1
    if (invulnerable > 0) invulnerable -= 1
    if (cooldown > 0) cooldown -= 1

    // Player
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    r.player.x = Math.max(4, Math.min(ARCADE_WIDTH - r.player.width - 4, r.player.x + dir * PLAYER_SPEED))

    if (keys.fire && cooldown === 0) {
      const shot = take(r.shots)
      if (shot) {
        shot.active = true
        shot.x = r.player.x + r.player.width / 2 - 1
        shot.y = r.player.y - 4
        shot.dy = -SHOT_SPEED
        cooldown = SHOT_COOLDOWN
      }
    }

    for (const shot of r.shots) {
      if (!shot.active) continue
      shot.update()
      if (shot.y < -shot.height) shot.active = false
    }

    // Formation: marches faster as it thins out, the classic pressure curve.
    const alive = r.enemies.filter((e) => e.active)
    if (alive.length === 0) spawnWave()

    const speed = MARCH_SPEED * (1 + 2.2 * (1 - alive.length / r.enemies.length))
    marchX += marchDir * speed

    let minX = Infinity
    let maxX = -Infinity
    alive.forEach((enemy) => {
      const i = r.enemies.indexOf(enemy)
      const x = marchX + (i % COLS) * CELL_W
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x + enemyW)
    })
    if ((marchDir > 0 && maxX >= ARCADE_WIDTH - 6) || (marchDir < 0 && minX <= 6)) {
      marchDir *= -1
      marchY += MARCH_DROP
    }

    animTimer += 1
    if (animTimer >= Math.max(10, 30 - (r.enemies.length - alive.length))) {
      animTimer = 0
      animFrame ^= 1
    }

    r.enemies.forEach((enemy, i) => {
      enemy.x = marchX + (i % COLS) * CELL_W
      enemy.y = marchY + Math.floor(i / COLS) * CELL_H
      enemy.image = r.enemyFrames[animFrame]
    })

    // Enemy fire: from the lowest live invader in a random column.
    bombTimer -= 1
    if (bombTimer <= 0 && ready === 0 && alive.length) {
      bombTimer = BOMB_INTERVAL[0] + Math.random() * (BOMB_INTERVAL[1] - BOMB_INTERVAL[0])
      const shooter = alive[Math.floor(Math.random() * alive.length)]
      const col = r.enemies.indexOf(shooter) % COLS
      const lowest = alive.filter((e) => r.enemies.indexOf(e) % COLS === col).pop() ?? shooter
      const bomb = take(r.bombs)
      if (bomb) {
        bomb.active = true
        bomb.x = lowest.x + enemyW / 2 - 1
        bomb.y = lowest.y + enemyH
        bomb.dy = BOMB_SPEED
      }
    }

    for (const bomb of r.bombs) {
      if (!bomb.active) continue
      bomb.update()
      if (bomb.y > ARCADE_HEIGHT) bomb.active = false
    }

    // Collisions
    for (const shot of r.shots) {
      if (!shot.active) continue
      const hit = alive.find((enemy) => enemy.active && collides(shot, enemy))
      if (hit) {
        hit.active = false
        shot.active = false
        score += 10
        burst(hit.x + enemyW / 2, hit.y + enemyH / 2)
      }
    }

    if (invulnerable === 0) {
      const bomb = r.bombs.find((b) => b.active && collides(b, r.player))
      if (bomb) {
        bomb.active = false
        loseLife()
      }
    }

    // An invader that reaches the ship's row ends the game outright.
    if (alive.some((enemy) => enemy.active && enemy.y + enemyH >= playerY)) {
      lives = 1
      loseLife()
    }

    emitStats()
  }

  function text(value: string, y: number, size: number, color: string) {
    context.fillStyle = color
    context.font = `bold ${size}px ui-monospace, "JetBrains Mono", monospace`
    context.textAlign = 'center'
    context.fillText(value, ARCADE_WIDTH / 2, y)
  }

  function render() {
    context.globalAlpha = 1
    context.fillStyle = COLOR.space
    context.fillRect(0, 0, ARCADE_WIDTH, ARCADE_HEIGHT)

    context.fillStyle = COLOR.star
    for (const star of stars) {
      context.globalAlpha = 0.25 + star.speed
      context.fillRect(Math.round(star.x), Math.round(star.y), 1, 1)
    }
    context.globalAlpha = 1

    for (const pool of [r.enemies, r.shots, r.bombs, r.sparks]) {
      for (const sprite of pool) if (sprite.active) sprite.render()
    }
    context.globalAlpha = 1

    // Blink while invulnerable; hidden entirely once the game is over.
    if (!over && (invulnerable === 0 || Math.floor(invulnerable / 6) % 2 === 0)) r.player.render()

    if (ready > 0 && !over) text('READY', ARCADE_HEIGHT / 2 + 20, 14, COLOR.text)

    if (over) {
      text('GAME OVER', ARCADE_HEIGHT / 2 - 8, 20, COLOR.text)
      text(`SCORE ${score}`, ARCADE_HEIGHT / 2 + 16, 12, COLOR.dim)
      text('PRESS SPACE', ARCADE_HEIGHT / 2 + 40, 11, COLOR.dim)
    }
  }

  // ---- input: scoped to the canvas, so typing in the chat is never captured ----

  const bindings: Record<string, keyof typeof keys> = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    Space: 'fire',
    ArrowUp: 'fire',
    KeyW: 'fire',
  }

  const onKey = (event: KeyboardEvent) => {
    const action = bindings[event.code]
    if (!action) return
    event.preventDefault()
    keys[action] = event.type === 'keydown'
  }
  // A key released while the canvas is not focused never delivers its keyup,
  // so every key is dropped on blur rather than left stuck down.
  const onBlur = () => {
    keys.left = keys.right = keys.fire = false
  }

  canvas.addEventListener('keydown', onKey)
  canvas.addEventListener('keyup', onKey)
  canvas.addEventListener('blur', onBlur)

  r.loop.update = update
  r.loop.render = render

  reset()
  render()
  emitStats()

  let destroyed = false

  const destroy = () => {
    if (destroyed) return
    destroyed = true

    r.loop.stop()
    r.loop.update = noop
    r.loop.render = noop

    canvas.removeEventListener('keydown', onKey)
    canvas.removeEventListener('keyup', onKey)
    canvas.removeEventListener('blur', onBlur)

    // The pools outlive this game; nothing they keep may point at its canvas.
    for (const sprite of allSprites(r)) {
      sprite.active = false
      sprite.context = undefined as unknown as CanvasRenderingContext2D
    }
    r.player.image = undefined as unknown as HTMLCanvasElement
    r.loop.context = undefined as unknown as CanvasRenderingContext2D

    if (releaseActive === destroy) releaseActive = null
  }

  releaseActive = destroy

  return {
    setRunning(running) {
      if (destroyed) return
      if (running) r.loop.start()
      else r.loop.stop()
    },
    resize(cssWidth) {
      if (destroyed) return
      fit(cssWidth)
      render()
    },
    destroy,
  }
}
