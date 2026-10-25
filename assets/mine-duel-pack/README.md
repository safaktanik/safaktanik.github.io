# Mine Duel — Starter Game Asset Pack

A cohesive starter set of original SVG assets for the Mine Duel browser game.

## Contents
- `01_branding/`: logo and app icon
- `02_characters/`: two stylized character avatars with expressions
- `03_mines/`: mine variants
- `04_board_tiles/`: closed/open tiles, numbers 1–8, flags, radar, protection, win and mine tiles
- `05_game_icons/`: common UI icons
- `06_ability_icons/`: radar, shield, extra turn, scans, bonuses
- `07_emojis/`: player reactions
- `08_ui/`: buttons, panels, player cards, progress bar, modal
- `09_backgrounds/`: gameplay, menu, victory
- `10_achievements/`: achievement badges
- `11_effects/`: simple visual overlays
- `asset_manifest.json`: machine-readable asset inventory

## Use with Claude-generated React/Vite project
1. Unzip this folder.
2. Copy the `mine_duel_asset_pack` folder into your project, for example as `public/assets/mine-duel/`.
3. Reference files with paths such as `/assets/mine-duel/04_board_tiles/tile_number_1.svg`.
4. Use SVG files as `<img src="/assets/mine-duel/03_mines/mine_classic.svg" alt="Classic mine" />`.
5. Keep gameplay data (mine coordinates, scores, turns) in game logic; assets are presentation only.

## Notes
- These are lightweight vector starter assets designed to be usable immediately, not a full illustrated 3D art pack.
- If the game uses React, CSS can provide hover, glow, scale, and reveal animations around the SVG assets.
- Check any third-party assets separately if you add them later. This pack was generated for this project.
