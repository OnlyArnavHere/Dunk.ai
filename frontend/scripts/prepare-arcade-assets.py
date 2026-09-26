"""Build the arcade's web assets from the source art in frontend/game/.

    python scripts/prepare-arcade-assets.py      (run from frontend/, needs Pillow)

The source files are 1000x1000 renders of pixel art, and they are not usable
as-is on a dark UI:

* The two GIFs are opaque on a near-white (254,254,254) background, so they
  would sit on the workspace as a white square. The background is keyed out.
* The art fills about a third of each frame. Both GIFs are cropped to ONE shared
  box, so frame 0 of the launch animation lands exactly where the idle ship was
  drawn and the hand-off between them does not jump.
* The launch GIF loops forever and holds its last frame for 5s. The copy written
  here plays once (no NETSCAPE loop block) and holds that frame for LAUNCH_HOLD_MS,
  so the window can open on a known schedule.
* There is no closing animation in the source art, so ship-land.gif is the
  launch played backwards: battle ship back into the idle ship. It runs a little
  quicker than the launch, because closing should feel prompt.
* The player ship PNG is resampled to its native pixel grid (one sample per art
  cell), so the game can scale it by whole numbers and keep hard pixel edges.

The originals in frontend/game/ are never modified.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageSequence

FRONTEND = Path(__file__).resolve().parent.parent
SOURCE = FRONTEND / "game"
OUT = FRONTEND / "public" / "arcade"

IDLE_SRC = SOURCE / "idel ship.gif"
LAUNCH_SRC = SOURCE / "initializatoin into battle ship.gif"
SHIP_SRC = SOURCE / "battle ship ready.png"

# Output edge of the square GIF canvas. The launcher shows the ship at 64-96 CSS
# px, so this leaves headroom for 2x displays without shipping the 1000px frames.
GIF_SIZE = 192
# Final-frame hold for the launch animation (the source holds it for 5000ms).
LAUNCH_HOLD_MS = 350
# Reversed launch: a brief beat on the battle ship, quicker motion frames, and a
# hold on the idle ship before the bubble shrinks away.
LAND_FIRST_MS = 120
LAND_FRAME_MS = 150
LAND_HOLD_MS = 250
# Size of one art pixel in the source renders, measured from the ship PNG.
SOURCE_CELL = 266 / 12
# Column 0 of every source GIF frame carries a dotted run of palette colours --
# an encoder artefact, not art. Left in, it drags the crop box out to the frame
# edge. Nothing drawn sits within this margin, so it is cleared outright.
EDGE_MARGIN = 4


def is_background(r: int, g: int, b: int) -> bool:
    """Near-white and unsaturated. The art's lightest colour is a saturated
    yellow (min channel ~100), so it is never caught by this."""
    return min(r, g, b) > 225 and max(r, g, b) - min(r, g, b) < 25


def key_out(frame: Image.Image) -> Image.Image:
    rgba = frame.convert("RGBA")
    # convert() copies the source's info, including its `loop` count, and Pillow
    # writes that back out -- which would make the play-once GIF loop again.
    rgba.info = {}
    px = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, _ = px[x, y]
            edge = min(x, y, rgba.width - 1 - x, rgba.height - 1 - y) < EDGE_MARGIN
            px[x, y] = (0, 0, 0, 0) if edge or is_background(r, g, b) else (r, g, b, 255)
    return rgba


def frames_of(path: Path) -> list[tuple[Image.Image, int]]:
    with Image.open(path) as im:
        return [(key_out(f), int(f.info.get("duration") or 100)) for f in ImageSequence.Iterator(im)]


def union_box(frames: list[Image.Image]) -> tuple[int, int, int, int]:
    boxes = [f.getchannel("A").getbbox() for f in frames]
    boxes = [b for b in boxes if b]
    return (
        min(b[0] for b in boxes),
        min(b[1] for b in boxes),
        max(b[2] for b in boxes),
        max(b[3] for b in boxes),
    )


def square(box: tuple[int, int, int, int], pad: int) -> tuple[int, int, int, int]:
    """Grow a box to a padded square around its centre."""
    left, top, right, bottom = box
    side = max(right - left, bottom - top) + 2 * pad
    cx, cy = (left + right) / 2, (top + bottom) / 2
    return (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))


def write_gif(path: Path, frames: list[Image.Image], durations: list[int], loop: bool) -> None:
    options = dict(save_all=True, append_images=frames[1:], duration=durations, disposal=2, optimize=False)
    if loop:
        options["loop"] = 0  # omitted entirely for play-once: no NETSCAPE block
    frames[0].save(path, **options)


def build_gifs() -> dict[str, object]:
    idle = frames_of(IDLE_SRC)
    launch = frames_of(LAUNCH_SRC)

    box = square(union_box([f for f, _ in idle + launch]), pad=12)

    def fit(frame: Image.Image) -> Image.Image:
        # NEAREST keeps the pixel-art edges hard; any smoothing would also create
        # half-transparent pixels, which GIF cannot store.
        return frame.crop(box).resize((GIF_SIZE, GIF_SIZE), Image.NEAREST)

    write_gif(OUT / "idle-ship.gif", [fit(f) for f, _ in idle], [d for _, d in idle], loop=True)

    launch_frames = [fit(f) for f, _ in launch]
    launch_durations = [d for _, d in launch]
    launch_durations[-1] = LAUNCH_HOLD_MS
    write_gif(OUT / "ship-launch.gif", launch_frames, launch_durations, loop=False)

    land_frames = launch_frames[::-1]
    land_durations = [LAND_FIRST_MS] + [LAND_FRAME_MS] * (len(land_frames) - 2) + [LAND_HOLD_MS]
    write_gif(OUT / "ship-land.gif", land_frames, land_durations, loop=False)

    return {"launchMs": sum(launch_durations), "landMs": sum(land_durations), "gifSize": GIF_SIZE}


def build_player_ship() -> dict[str, object]:
    with Image.open(SHIP_SRC) as im:
        rgba = im.convert("RGBA")
    left, top, right, bottom = rgba.getchannel("A").getbbox()
    cols = round((right - left) / SOURCE_CELL)
    rows = round((bottom - top) / SOURCE_CELL)

    native = Image.new("RGBA", (cols, rows))
    for y in range(rows):
        for x in range(cols):
            sx = min(right - 1, int(left + (x + 0.5) * SOURCE_CELL))
            sy = min(bottom - 1, int(top + (y + 0.5) * SOURCE_CELL))
            r, g, b, a = rgba.getpixel((sx, sy))
            native.putpixel((x, y), (r, g, b, 255) if a >= 128 else (0, 0, 0, 0))

    native.save(OUT / "player-ship.png")
    return {"shipWidth": cols, "shipHeight": rows}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {**build_gifs(), **build_player_ship()}
    for name in ("idle-ship.gif", "ship-launch.gif", "ship-land.gif", "player-ship.png"):
        print(f"{name:18} {(OUT / name).stat().st_size / 1024:6.1f} KB")
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
