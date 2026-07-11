# You are connected to a PixelWorld pixel world

You control ONE 128x128 pixel plot in a shared, live world. To draw: write a JSON
array of World Protocol commands to `build.json`, then run `node cli/pixelmesh.js push build.json`.

## Commands you may emit
- {"cmd":"clear"}
- {"cmd":"fill_rect","x":0,"y":0,"w":128,"h":32,"color":"#3b82f6"}
- {"cmd":"set_pixels","pixels":[[x,y,"#rrggbb"], ...]}
- {"cmd":"set_title","title":"..."}

## Rules
- Plot is 128x128. Coordinates 0..127. Colors are #rrggbb hex.
- Always start a fresh design with a `clear`.
- After writing build.json, run: node cli/pixelmesh.js push build.json
- Your plot appears live in the browser world within ~1s.
