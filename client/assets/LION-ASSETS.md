# Lion costume assets, v2.1

Six original photoreal raster sprites were made with the built-in `image_gen` tool and the imagegen skill. They are generated costume interpretations, not photographs copied from the reference sources. The forehead-mounted presentation and individual dancer jacket/trousers are adaptations for an AR camera experience; a traditional southern lion costume also has a body/cape joining its dancers.

| Set | Head source PNG | Outfit source PNG | Dimensions |
| --- | --- | --- | --- |
| Cinnabar / ivory Fut San inspiration | `lion-head-v21.png` | `lion-outfit-v21.png` | Head 1254 × 1254; outfit 1024 × 1536 |
| Jade / ivory Hok San inspiration | `lion-head-jade-v21.png` | `lion-outfit-jade-v21.png` | Head 1254 × 1254; outfit 1024 × 1536 |
| Gold / black Fut San inspiration | `lion-head-gold-v21.png` | `lion-outfit-gold-v21.png` | Head 1254 × 1254; outfit 1024 × 1536 |

`lion-assets-v21-prompts.json` retains all six generation prompts, portable generated-image identifiers, and the final jade correction prompt. This public snapshot replaces machine-specific paths with `generated-image:` provenance identifiers. The red outfit had an additional background-extraction edit; its instruction summary and repository-relative final source path are recorded, since its exact edit wording was not retained. The parent build mechanically encodes the PNGs to WebP with alpha for the live and standalone bundles. No manual image retouching, background processing, or sprite-sheet cropping was used to create these six source images.

## Reference sources and design choices

- [NHB / National Museum lion head and cape](https://www.roots.gov.sg/Collection-Landing/listing/1214191): identifies the southern lion's stylised head and decorated cape in Singapore.
- [Singapore Chinese Cultural Centre: Southern lion dance](https://culturepaedia.singaporeccc.org.sg/social-practices/southern-lion-dance/): distinguishes Foshan's longer head from the flatter duck-beak Heshan head. This guided the jade head's straight shallow mouth and absence of visible upper teeth.
- [Henry Ng's Fut San head, Michelangelo Foundation](https://www.homofaber.com/en/objects/a1VTG000000eyo82AA): bamboo/rice-paper craftsmanship, high forehead, curved lips, and sharp horn guided the red and gold styles.
- [Henry Ng's Hok San head, Michelangelo Foundation](https://www.homofaber.com/en/objects/a1VTG000000eyo72AA): photographic artisan reference and bamboo/rice-paper construction.
- [Gund Kwok troupe: Our Lion Heads](https://www.gundkwok.org/our-lion-heads.html): the troupe describes Fut San's pointed horn/curved mouth and Hok San's curved horn/straight mouth. The final jade edit explicitly changes those shapes, beyond recoloring.
- [KFT full white-fur Hok San costume](https://kftliondance.com/products/kft): catalog shows matched head, collar, body, and pants with white fur and painted details, informing coherent coordinated sets.
- [Black and gold costume catalog](https://liondancecostume.com/product/lion-dance-costume-chinese-lion-dance-black-gold/): matched black/gold design, wool fur and sequin fabric inform the black-fur costume contrast.

These palettes are contemporary visual choices; the app does not assert that they precisely reproduce a named historical character or troupe's ceremonial costume.

## Renderer contract and verification

Configure `window.LION_ASSETS = {head, outfit, sets:[{id,head,outfit}, ...]}` before loading `lion-filter.js`; image strings can be URLs or embedded data URLs. `window.lionAssetsReady` resolves a boolean after all pairs load. `window.drawDancerLion(ctx,{landmarks,videoRect,time,energy,role,color,costume})` mirrors the 33 pose points; costume selects a stable set index. `window.LionFilter.reset()` clears role smoothing after a new camera session.

The entire rotated head, including the beard, stays above a conservative forehead estimate. Rotation is capped at 8 degrees; pose anchors use approximately 95 ms exponential smoothing, reset after 800 ms disappearance. A separate exclusion region protects the current unsmoothed face, so raised arms and lagging garments cannot paint over it. Headgear may shrink near the top of the frame to preserve the visible forehead and remain inside the supplied 72 px headroom. Clothing uses two affine shirt triangles and eight cheap cropped arm/leg draws, with preloaded images and no per-frame offscreen canvas allocation.

QA outputs live under `work/`: three official MediaPipe-photo composites, `lion-filter-three-qa.png`, `lion-filter-qa.cjs`, and `lion-filter-qa.json`. Each costume preserves 3,498 checked original face pixels exactly (zero changes). Tests also cover full 72 px headroom, a sudden upward pose jump despite smoothing, cache reset after disappearance, alpha transparency, and canvas transform restoration. This composite uses synthetic landmark coordinates matched to the official photograph; the parent app separately verifies actual pose inference and sharing.
