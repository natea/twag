#!/usr/bin/env python3
"""Generate 1200×630 Open Graph share images for TWAG.

Produces three PNGs under docs/:
  - og.png           generic site card (for index.html)
  - og_boston.png    Boston Tech Week 2026
  - og_nyc.png       NY Tech Week 2026

These are the images platforms like X, LinkedIn, Mastodon, Slack, Facebook,
iMessage, etc. fetch when someone shares a TWAG URL. 1200×630 is the de
facto standard size for Open Graph / Twitter Cards "summary_large_image."

Run from the repo root (Pillow is already a project dep):
    uv run python docs/scripts/generate_og_images.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


# Brand palette.
BG = (26, 26, 26)             # site header dark
BG_ACCENT = (38, 38, 38)
ORANGE = (232, 84, 62)        # active date chip / RSVP button
MUTED = (170, 170, 170)
WHITE = (255, 255, 255)


# Where to find a presentable sans-serif. Tries each in order until one works.
# All ship on macOS. On a Linux CI you'd add DejaVuSans.ttf or similar.
FONT_CANDIDATES_BOLD = [
    "/System/Library/Fonts/Helvetica.ttc",      # macOS
    "/System/Library/Fonts/HelveticaNeue.ttc",  # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",  # Linux
]
FONT_CANDIDATES_REGULAR = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]


def _load_font(candidates: list[str], size: int) -> ImageFont.FreeTypeFont:
    last_exc: Exception | None = None
    for path in candidates:
        if not Path(path).exists():
            continue
        try:
            # .ttc collections need an index; 0 is the first face.
            if path.endswith(".ttc"):
                return ImageFont.truetype(path, size, index=0)
            return ImageFont.truetype(path, size)
        except Exception as exc:  # pragma: no cover - environment-specific
            last_exc = exc
            continue
    if last_exc:
        raise last_exc
    # Last resort: Pillow's bitmap default. Looks blocky but doesn't crash.
    return ImageFont.load_default()


def _text_size(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    # Pillow >= 10: textbbox returns (l, t, r, b); width = r-l, height = b-t.
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    return r - l, b - t


def _draw_pin(draw: ImageDraw.ImageDraw, cx: int, cy: int, scale: float = 1.0) -> None:
    """Quick map-pin glyph in the brand orange. ~60px tall at scale=1."""
    r = int(22 * scale)
    body_top = cy - int(36 * scale)
    # Outer teardrop approximation: circle on top, triangle below.
    draw.ellipse(
        [cx - r, body_top, cx + r, body_top + 2 * r],
        fill=ORANGE,
        outline=(140, 50, 35),
        width=2,
    )
    # Tail down to the point.
    draw.polygon(
        [
            (cx - int(r * 0.9), body_top + int(r * 1.4)),
            (cx + int(r * 0.9), body_top + int(r * 1.4)),
            (cx, cy + int(20 * scale)),
        ],
        fill=ORANGE,
        outline=(140, 50, 35),
    )
    # Inner white circle.
    draw.ellipse(
        [cx - int(r * 0.55), body_top + int(r * 0.35),
         cx + int(r * 0.55), body_top + int(r * 0.35) + int(r * 1.1)],
        fill=WHITE,
    )


def make_image(
    out_path: Path,
    *,
    eyebrow: str,
    headline: str,
    subhead: str,
    footer_left: str,
    footer_right: str,
) -> None:
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(img)

    # Subtle horizontal accent band behind the headline.
    draw.rectangle([0, 220, W, 420], fill=BG_ACCENT)

    # Big orange map pin on the right side as visual anchor.
    _draw_pin(draw, cx=W - 180, cy=H // 2, scale=2.4)

    # Eyebrow (small uppercase label above headline).
    f_eyebrow = _load_font(FONT_CANDIDATES_BOLD, 28)
    draw.text((80, 158), eyebrow.upper(), fill=ORANGE, font=f_eyebrow)

    # Headline.
    f_head = _load_font(FONT_CANDIDATES_BOLD, 76)
    draw.text((80, 220), headline, fill=WHITE, font=f_head)

    # Subhead.
    f_sub = _load_font(FONT_CANDIDATES_REGULAR, 34)
    draw.text((80, 330), subhead, fill=MUTED, font=f_sub)

    # Footer line — site URL on the left, attribution on the right.
    f_foot = _load_font(FONT_CANDIDATES_REGULAR, 24)
    draw.text((80, H - 70), footer_left, fill=MUTED, font=f_foot)
    fr_w, fr_h = _text_size(draw, footer_right, f_foot)
    draw.text((W - 80 - fr_w, H - 70), footer_right, fill=MUTED, font=f_foot)

    img.save(out_path, "PNG", optimize=True)
    print(f"wrote {out_path} ({out_path.stat().st_size // 1024} KB)")


def main() -> int:
    docs = Path(__file__).resolve().parent.parent
    common_footer_right = "by @natea"

    make_image(
        docs / "og_boston.png",
        eyebrow="Boston Tech Week 2026 · May 26-31",
        headline="Every event,",
        subhead="on one clustered map. Filter by day, RSVP on Partiful.",
        footer_left="natea.github.io/twag/events_map_boston.html",
        footer_right=common_footer_right,
    )

    make_image(
        docs / "og_nyc.png",
        eyebrow="NY Tech Week 2026 · June 1-7",
        headline="Every event,",
        subhead="on one clustered map. Filter by day, RSVP on Partiful.",
        footer_left="natea.github.io/twag/events_map_nyc.html",
        footer_right=common_footer_right,
    )

    make_image(
        docs / "og.png",
        eyebrow="TWAG · Tech Week event maps",
        headline="Boston + NY,",
        subhead="every Tech Week event, clustered on a map.",
        footer_left="natea.github.io/twag",
        footer_right=common_footer_right,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
