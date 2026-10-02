# Back accessory models

These model files are bundled with the game under CC0 1.0. They are resized and combined at runtime in `public/js/world/back-assets.js`.

| Local file | Creator | Source |
| --- | --- | --- |
| `backpack.glb` | Quaternius | [Survival pack](https://github.com/Papyszoo/CC0-Public-Domain-Models/tree/main/packs/quaternius-survival) |
| `cape.glb` | KayKit | [Dungeon Remastered banner](https://github.com/Papyszoo/CC0-Public-Domain-Models/tree/main/packs/kaykit-dungeon-remastered) |
| `sword.glb` | Quaternius | [Medieval Weapons](https://github.com/Papyszoo/CC0-Public-Domain-Models/tree/main/packs/quaternius-medieval-weapons) |
| `guitar.glb` | Tim Steer (The Base Mesh) | [Acoustic guitar](https://github.com/Papyszoo/CC0-Public-Domain-Models/tree/main/packs/the-base-mesh/models/acoustic_guitar) |
| `rocketbase.glb`, `rocketfuel.glb`, `rockettop.glb` | Kenney | [Space Kit](https://github.com/Papyszoo/CC0-Public-Domain-Models/tree/main/packs/kenney-space-kit) |
| `angel_wing_low_poly.fbx` | DevMops | [Angel Wing on OpenGameArt](https://opengameart.org/content/angel-wing) |

The GLB files came from the [CC0 Public Domain Models collection](https://github.com/Papyszoo/CC0-Public-Domain-Models), which converts the original authors' models to self-contained GLB files. The wing FBX is used for the Angel, Devil, Dragon, and Golden Halo variants with different colors.

## Secret admin gifts

| File | Creator | License | Source |
| --- | --- | --- | --- |
| `secret_crown.glb` | Quaternius | CC0 1.0 | [Crown](https://poly.pizza/m/i0PZVuVlYv) |
| `secret_scythe.glb` | Quaternius | CC0 1.0 | [Scythe](https://poly.pizza/m/yE9TKCewO8) |
| `secret_helmet.glb` | Michael Fuchs | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | [Viking Helmet](https://poly.pizza/m/apPuLbVJ4N5) |

Models are fitted to the game avatar. The original Viking Helmet colors and geometry are retained. Its attribution also appears in the Secrets shop tab.

## Black ski-goggle choices

Source strap: **Ski Goggles (Ski Resort and Snow Park)** by 3DAssets.dev, CC0 1.0.
Asset/license: https://3dassets.dev/assets/ski-resort-and-snow-park-ski-goggles-54d4a696
Original GLB: https://cdn.3dassets.dev/assets/26014/v1/model.glb

`secret_goggles_shield.glb`, `secret_goggles_split.glb`, and `secret_goggles_racer.glb` are three distinct geometry designs: continuous curved Alpine and Storm lenses with thin hollow rims, plus a frameless Ridge lens with the fitted source strap. All materials changed to black; fitted as head accessories. Built with `scripts/build-ski-goggles.mjs`. These are real meshes and follow the avatar's head rotation.

The previous Viking helmet (`secret_helmet.glb`, Michael Fuchs CC BY 3.0) is now named **Bug Hunter Horns**, reserved for admin gifts to bug finders. Crown/scythe are retired from the unowned shop; existing owners retain them.
