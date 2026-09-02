# Alphaveil showcase asset prompts

## Production method

Generate **source photographs only**. Then run each source through Alphaveil itself (remove background, upscale) and use the real outputs as the floating specimens on the home page. Every result on display was produced by the product, so the showcase stays honest.

Art direction shared by every prompt:

- Crisp commercial studio photography, realistic textures, difficult edges (hair, fur, translucent leaves, mesh).
- Backgrounds in **warm charcoal, bone, clay or muted terracotta** so the "before" already sits in the Alphaveil palette; the "after" reveals the checkerboard.
- One controlled burnt-sienna accent at most. No neon, no glow, no gradients, no lime, no purple.
- Subject fully inside the frame with generous empty space around every edge (the cutout needs breathing room).
- No text, logos, watermarks, UI, frames, hands or props touching the frame.

Negative prompt to append everywhere: `text, watermark, logo, frame, border, checkerboard, UI, glow, neon, bokeh, blur, motion blur, duplicate, cropped subject, hands, extra limbs`.

Target folder: `public/showcase/`. Sources at least 1600 px on the long side; export WebP.

## 1. Portrait with flyaway hair

Target: `portrait-source.webp` → process with BiRefNet Lite → `portrait-cutout.webp`. Aspect 4:5.

```text
Editorial studio portrait of a woman with dark curly hair and many loose flyaway strands, three-quarter view, linen shirt in warm sand tone, calm direct gaze, seamless warm charcoal paper background, soft directional key light from the upper left, faint rim light separating individual hair strands from the background, realistic skin texture and pores, premium contemporary campaign photography, subject fully inside frame with generous space around the silhouette, sharp focus, neutral warm color grade
```

## 2. Product with mesh and laces

Target: `product-source.webp` → BiRefNet Lite → `product-cutout.webp`. Aspect 4:3.

```text
Single modern trail running shoe floating a few centimeters above a matte bone-colored studio floor, side profile at a slight three-quarter angle, technical knit mesh, thin laces, one restrained burnt-sienna lace tab, warm clay cyclorama background, crisp commercial product lighting, soft contact shadow clearly separated from the shoe, complete object with empty space around every edge, extremely detailed material texture, natural reflections
```

## 3. Fine edges: botanical

Target: `fern-source.webp` → BiRefNet (full) → `fern-cutout.webp`. Aspect 1:1.

```text
Botanical studio still life of one delicate fern branch with a few thin translucent leaves, intricate overlapping stems and serrated edges, isolated against a smooth warm charcoal background, controlled side lighting revealing veins and partial translucency, scientifically precise silhouette, high-end editorial macro photography, full branch contained inside frame with clean negative space around it, realistic organic imperfections, no vase
```

## 4. Fur and whiskers

Shipped as real photos instead of generated ones: `cat.webp` (close-up, tag `fur`) and `nina.webp` (tag `whiskers`), both cut out with BEN2. Keep the prompt below for regenerating a stand-in.

Target: `dog-source.webp` → BiRefNet Lite → `dog-cutout.webp`. Aspect 1:1.

```text
Studio portrait of a scruffy terrier with wiry fur and long whiskers, sitting, head slightly tilted, looking past the camera, seamless bone-colored paper background, soft even studio light with gentle rim light on the fur edges, every hair strand sharp, natural coat colors in warm brown and cream, premium pet photography, whole dog inside the frame with generous margin
```

## 5. Translucent object

Target: `glass-source.webp` → BiRefNet (full) → `glass-cutout.webp`. Aspect 3:4.

```text
Minimal product photograph of a tall glass carafe half filled with water and one slice of orange, standing on a matte clay surface, warm charcoal background, controlled softbox reflections on the glass, visible refraction through the water, crisp edges, commercial beverage photography, object complete inside the frame with empty space on all sides
```

## 6. Upscale specimen (generate small on purpose)

Target: `camera-source.webp` at **512 × 512** → Swin2SR ×4 → `camera-upscaled.webp`.

```text
Close-up product photograph of a compact silver analog camera, front three-quarter angle, finely knurled metal dials, black leather grain, engraved mechanical details without readable brand text, warm graphite background, soft controlled studio reflections, centered object with complete silhouette visible, realistic slightly compressed web-image quality
```

## How they float on the home page

The specimens are real `<figure>` elements, not a flattened image: a tilted card per specimen (`-6°` … `+5°`), the checkerboard behind the cutout, a tiny monospace caption (`BIREFNET LITE · 1.8 S`), a slow 6–8 s vertical drift (`translateY ±6px`) with staggered delays, a subtle parallax on pointer move on desktop, and everything static under `prefers-reduced-motion`. On mobile they collapse into a horizontal strip under the upload target.

Composition reference only (never ship this as a flattened asset):

```text
Desktop interface composition reference for a browser image tool called Alphaveil, 16:9, warm bone paper background with a faint grid, editorial serif headline on the left, one large upload card on the right, four small tilted photo cards floating asymmetrically around the upload card, each showing a cutout on a checkerboard: curly-hair portrait, trail shoe, fern, cat; burnt-sienna accent only, thin crop marks and tiny monospace captions, soft diffuse shadows, no glassmorphism, no gradients, no neon, no purple, generous negative space, premium creative-tool aesthetic
```
