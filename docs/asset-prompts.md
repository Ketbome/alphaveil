# BG Studio Asset Prompts

## Production Method

Generate source images only. Process those sources with BG Studio to create the transparent cutouts and upscaled details used by the interface. This keeps the showcase truthful: every result displayed by the product was produced by the product.

Use a consistent photographic direction across all source images:

- Crisp commercial studio photography
- Cool charcoal and muted blue backgrounds
- One controlled lime accent at most
- Realistic textures and difficult edges
- No text, logos, watermarks, UI, frames, or checkerboard backgrounds
- Natural contrast without neon glow or cyberpunk styling

## Portrait Source

Target file: `public/showcase/portrait-source.webp`

Aspect ratio: 4:5, at least 1200 x 1500.

```text
Editorial studio portrait of a person with dark curly hair and several loose flyaway strands, three-quarter view, charcoal overshirt with subtle woven texture, calm confident expression, cool slate seamless paper background, soft directional key light from the upper left, restrained rim light separating individual hair strands, realistic skin texture, premium contemporary campaign photography, subject fully inside frame with generous space around the silhouette, sharp focus, neutral color grade, no text, no logos, no accessories touching the frame, no bokeh, no glow
```

Process with BiRefNet Lite and export as `portrait-cutout.webp` with transparency.

## Product Source

Target file: `public/showcase/product-source.webp`

Aspect ratio: 4:3, at least 1600 x 1200.

```text
Single modern trail running shoe suspended a few centimeters above a matte cool-gray studio floor, side profile at a slight three-quarter angle, technical mesh, fine laces, translucent rubber details, one restrained acid-lime lace tab, soft charcoal cyclorama background, crisp commercial product lighting, realistic contact shadow separated from the shoe, complete object visible with empty space around every edge, extremely detailed material texture, natural reflections, no text, no brand mark, no pedestal, no props, no glow, no motion blur
```

Process with BiRefNet Lite and export as `product-cutout.webp` with transparency.

## Complex Edge Source

Target file: `public/showcase/complex-source.webp`

Aspect ratio: 1:1, at least 1400 x 1400.

```text
Botanical studio still life of one delicate fern branch and a small cluster of thin translucent leaves, intricate overlapping stems and serrated edges, isolated against a smooth deep blue-gray background, controlled side lighting revealing fine veins and partial translucency, scientifically precise silhouette, high-end editorial macro photography, full branch contained inside frame with clean negative space around it, realistic organic imperfections, no vase, no text, no insects, no decorative border, no glow
```

Process with full BiRefNet and export as `complex-cutout.webp` with transparency.

## Upscale Detail Source

Target file: `public/showcase/detail-source.webp`

Generate at 512 x 512 so the comparison starts from a genuinely small source.

```text
Close-up product photograph of a compact silver analog camera, front three-quarter angle, finely knurled metal dials, black leather grain, engraved mechanical details without readable brand text, neutral graphite background, soft controlled studio reflections, centered object with complete silhouette visible, realistic slightly compressed web-image quality, no hands, no strap crossing the object, no props, no watermark, no glow
```

Process with Swin2SR x4 and export the result as `detail-upscaled.webp`.

## Floating Showcase Composition

The production interface should render the processed assets inside real HTML figures. Use this prompt only to explore composition, not as a final flattened UI asset.

```text
Desktop product-interface composition reference for a browser-based local image editor called BG Studio, 16:9 canvas, dark near-black technical workbench, restrained acid-lime accent, one large upload area on the right and concise editorial headline on the left, four small floating image specimens arranged asymmetrically around the upload area: curly-hair portrait cutout, technical shoe cutout, delicate fern cutout, and camera resolution detail, thin crop marks and tiny monospace metadata, subtle depth with no glassmorphism, no gradients, no neon glow, no fake charts, no purple, no oversized rounded cards, clean premium creative-tool aesthetic, generous negative space, every control legible and physically plausible
```

## Logo Mark

Generate the symbol separately from the wordmark. AI-generated text should not be used in the final logo.

```text
Minimal geometric app icon for BG Studio, a browser tool for background removal, cropping, and image upscaling, construct one bold uppercase B from two crop-corner brackets and a clean negative-space cut through the right side, the removed section should subtly suggest a transparent layer peeling away, flat vector geometry, strong silhouette readable at 16 pixels, acid-lime symbol on near-black background, square 1:1 composition, no text, no initials besides the abstract B, no gradient, no shadow, no glow, no 3D, no camera aperture, no magic wand, no generic sparkle, no mockup presentation
```

Export a 1024 x 1024 PNG, redraw the selected geometry as SVG, and test it at 16, 24, 32, and 128 pixels before replacing `public/favicon.svg` and the header mark.
