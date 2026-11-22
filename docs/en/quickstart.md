# Quickstart (English)

This walkthrough takes you from a fresh clone to a verified, headless-tested game run.

## 1. Prerequisites

```bash
node --version    # 18 or newer
```

A Chromium browser is required only for `verify-web.mjs`. On Windows, Edge usually exists already:
`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`. Override detection with
`--browser <path>` or `GAME_ANYTHING_BROWSER`.

## 2. Install the skill

```bash
git clone https://github.com/Alaneve541/game-anything.git "$HOME/.dsh/skills/game-anything"
```

Windows:

```powershell
git clone https://github.com/Alaneve541/game-anything.git "$env:USERPROFILE\.dsh\skills\game-anything"
```

DeepSeek Harness watches the skills directory, so the skill is registered immediately. Check by
asking an agent to list skills, or by loading it by name: `game-anything`.

## 3. Detect a project (or the machine)

```bash
node scripts/detect-engine.mjs path/to/project
```

It prints engine scores with the evidence file that triggered each score, then machine status:

```
== Project: C:\work\mygame ==
  [100] Unreal Engine  <- game.uproject
== Machine engines ==
  unity      missing
  unreal     incomplete   missing Engine/Binaries/Win64/UnrealEditor.exe
== Toolchain ==
  node       v24.14.1
  browsers   ok edge=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe
```

Scores are hints, not verdicts — a Web/HTML5 ZIP can contain a Unity project next to it. Read the
evidence column before committing to an engine.

## 4. Run the bundled template

Terminal 1:

```bash
node scripts/serve.mjs --root templates/web-canvas --port 8123
```

Terminal 2:

```bash
node scripts/verify-web.mjs \
  --url "http://127.0.0.1:8123" \
  --out shot.png \
  --wait-for "window.__game && window.__game.ready" \
  --press KeyD:1000
```

Expected output (numbers vary):

```
url        http://127.0.0.1:8123
browser    Edg/158.0.4370.33
screenshot C:\...\shot.png
wait-for   ok (window.__game && window.__game.ready)
pressed    KeyD:1000
canvas     960x540 css 1074x604
state      {"t":1.48,"score":0,"hp":3,"mode":"playing","player":{"x":794,"y":270}}
errors     0
```

Exit code `0` means: page loaded, probe satisfied, no console/page errors, screenshot written.
Exit code `1` means errors (printed) — a real failure, not a warning. Exit code `2` means bad
arguments.

## 5. Verify behavior, not just pixels

A screenshot proves rendering; it does not prove the game responds. Add assertions through `--eval`:

```bash
node scripts/verify-web.mjs --url http://127.0.0.1:8123 --out shot.png \
  --wait-for "window.__game && window.__game.ready" \
  --eval "(() => { window.__game.reset(7); window.__game.simulate(60); return window.__game.state(); })()"
```

Simulating 60 seconds without moving the player should end the run: `hp: 0, mode: "over"` and the
game-over overlay visible in the screenshot. That is a full loop test: spawn → chase → damage →
game over.

Use `--json` to get the same report as JSON for CI:

```bash
node scripts/verify-web.mjs --url http://127.0.0.1:8123 --json > report.json
```

## 6. Noise control

Known-benign errors (third-party analytics blocked, favicon 404) should be filtered explicitly,
not ignored by eye:

```bash
node scripts/verify-web.mjs --url http://127.0.0.1:8123 --ignore "analytics|favicon" --json
```

Filtered entries appear under `ignored` so they remain auditable. `--strict` turns the default
favicon filter off when you need a zero-tolerance run.

## 7. Probe contract

```js
window.__game = {
  ready: true,
  state: () => ({ t, score, hp, mode, paused, entities: 3, player: { x, y } }),
  press: (code, ms) => { /* inject input */ },
  reset: (seed) => { /* deterministic restart */ },
};
```

Keep it read-only, stable, and JSON-serializable. The same contract maps to other engines: a static
probe class in Unity writing JSON, an autoload singleton in Godot, a `UGameInstanceSubsystem` in
Unreal.

## 8. When the engine is missing

`detect-engine.mjs` reports `missing` or `incomplete` instead of guessing. Then:

1. Build the feel-critical part as a web/Canvas prototype and verify it headless.
2. Keep game rules in pure functions with deterministic tests (fixed timestep, seeded RNG).
3. Write a migration checklist (input mapping, spawn timer, collision epsilon) before installing
   the engine.
4. Install the engine, re-run detection until it reports `ok`, then port the slice.

Do not fabricate engine build output. A "cannot build: engine missing" line is a correct result.

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `wait-for TIMEOUT` | probe never set, JS error before init | open with `--eval "document.title"`; check console errors printed above |
| `canvas none` | game renders with WebGL only, or canvas not in DOM yet | add `--webgl`, or increase wait |
| Blank screenshot | page loaded but game not started | press `Enter`/`Space` first, or click the start button with `--click` |
| `net::ERR_CONNECTION_REFUSED` | dev server not running or wrong port | check `serve.mjs` output and `--url` |
| `unknown key code` | key name not in KEYMAP | use `KeyA`–`KeyZ` / `Digit0`–`Digit9` / `Arrow*` / `Space` / `Enter` / `Escape` |
| Exit 1 with only favicon 404 | browser default noise | add `--ignore "favicon"`, or leave the default filter on |

## 10. Content, balance and publishing automation

**Bootstrap the engine instead of giving up.**

```bash
node scripts/prepare-engine.mjs --engine godot            # dry-run: shows download URL
node scripts/prepare-engine.mjs --engine godot --apply    # downloads, unzips, self-tests
node scripts/prepare-engine.mjs --engine unreal           # integrity check (Binaries/Win64)
node scripts/prepare-engine.mjs --engine unity            # silent Unity Hub install
```

**Generate content with scripts, not by hand.** `templates/blender/gen_props.py` (headless GLB/FBX),
`templates/ue/gen_assets.py` (UE editor Python: import, spawn, save level), `templates/unity/Editor/BuildTools.cs`
(`-executeMethod` mesh/prefab/scene), `templates/godot/tools/gen_content.gd` (`ArrayMesh` → `.tres`/`.tscn`).

**Measure balance over many seeds.**

```bash
node scripts/balance-sweep.mjs --url http://127.0.0.1:8123 --seeds 1-100 --seconds 90 --out sweep.csv
node scripts/balance-sweep.mjs --core dist/core.mjs --seeds 1-500 --seconds 120 --json
```

Summary reports `win_rate`, `ended_rate`, `mean_survival_s` and score `p50/p90/max`. Read
`references/balance-lab.md` for target ranges and the bot-policy approach.

**Publish from one entry point.**

```bash
node scripts/publish.mjs --target itch --build dist --user <user> --game <game>          # dry-run
node scripts/publish.mjs --target steam --app <id> --depot <id> --build dist --apply     # steamcmd
node scripts/publish.mjs --target web --build dist --apply                               # zip + deploy
```

Secrets come from env vars and are redacted in logs; `--apply` is always explicit. See
`references/publishing-automation.md` for SteamPipe VDF, WeChat, Android/iOS and console limits.

## 11. Next steps

- Read `SKILL.md` for the full workflow and anti-patterns.
- Read `references/engine-routing.md` before choosing an engine.
- Read `references/verification.md` for per-engine verification recipes (Unity batchmode, Unreal
  automation, Godot headless).
