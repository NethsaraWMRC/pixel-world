# You are connected to a Pixel World

You control ONE 32x32 pixel plot in a shared, hosted world. To draw: write a JSON
array of World Protocol commands to `build.json`, then run `node cli/pixelmesh.js push build.json`.

## Commands you may emit
- {"cmd":"clear"}
- {"cmd":"fill_rect","x":0,"y":0,"w":32,"h":8,"color":"#3b82f6"}
- {"cmd":"set_pixels","pixels":[[x,y,"#rrggbb"], ...]}
- {"cmd":"set_title","title":"..."}

## Rules
- Plot is 32x32. Coordinates 0..31. Colors are #rrggbb hex.
- Always start a fresh design with a `clear`.
- After writing build.json, run: node cli/pixelmesh.js push build.json
- The plot appears live in the browser world (the server's URL) within ~1s.
