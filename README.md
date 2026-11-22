# game-anything

**English** | [简体中文](README.zh-CN.md)

An agent skill for building **playable games across engines** — Unity, Unreal, Godot, GameMaker,
Cocos Creator, Construct, RPG Maker, web engines (Canvas / Phaser / Three.js), code-first stacks
(Bevy, MonoGame, LÖVE, pygame, Raylib, LibGDX, HaxeFlixel, Ebitengine), and hosted platforms
(Roblox, Minecraft datapacks).

It is not a game library and not a code generator. It is a **workflow + toolchain** that an AI agent
loads so that "make me a game" ends in something that actually starts, renders, responds to input,
and can be shipped — instead of a pile of code nobody has ever run.

```
probe the project & toolchain → cut a vertical slice → build → verify → ship
```

## Why this exists

Most "AI made a game" attempts fail the same way: thousands of lines of plausible code that were
never executed. This skill makes **"it runs" the minimum bar** and ships deterministic verification
tools so the bar is checkable, not aspirational.

Four hard rules the skill enforces:

1. **Runnable beats complete.** A 5-minute playable slice first, features second.
2. **Generate assets through tools and engine APIs — never hand-write binary bytes.** Models come
   from Blender headless or procedural meshes; levels, prefabs and scenes come from UE Python /
   Unity Editor scripts / Godot tool scripts or from JSON level data. `.uasset`, `.umap`, `.unity`
   and `.yy` files are never touched by a text editor.
3. **Only report what was verified.** No "should work" claims in the final report.
4. **Feel first, visuals second.** Input latency, feedback, and pacing before art polish.

## Install

```bash
git clone https://github.com/Alaneve541/game-anything.git "$HOME/.dsh/skills/game-anything"
```

On Windows: `%USERPROFILE%\.dsh\skills\game-anything`.

DeepSeek Harness watches the skills directory, so `game-anything` shows up in the skill catalog
immediately — no restart. Any agent session can then load it by name.

**Requirements**

- Node.js 18+ (the bundled tools use the built-in `fetch` and `WebSocket`).
- Microsoft Edge or Google Chrome for headless web verification.
- Game engines are optional: install only the engine you target.

## Quick start

Ask an agent:

> "Use game-anything to build a 2D tower-defense prototype that runs in the browser."

or, in Chinese:

> "用 game-anything 做一个能跑的平台跳跃小游戏。"

The skill will:

1. run `scripts/detect-engine.mjs` to identify the project, engines, and toolchain on the machine;
2. converge scope into a one-page `DESIGN.md` and a vertical slice;
3. build engine-appropriate code with an engine-agnostic core;
4. verify with real runs (headless screenshot + state probe + input injection);
5. hand over a runnable build plus an honest list of what was and wasn't verified.

### Try the bundled template

A complete, runnable 2D game ("Orb Runner", Canvas, single file) ships in `templates/web-canvas`:

```bash
# terminal 1
node scripts/serve.mjs --root templates/web-canvas --port 8123

# terminal 2 — headless Edge/Chrome, screenshot + state + key press
node scripts/verify-web.mjs \
  --url "http://127.0.0.1:8123" \
  --out shot.png \
  --wait-for "window.__game && window.__game.ready" \
  --press KeyD:1000
```

Expected: exit code `0`, `errors 0`, a `state` JSON line showing the player moved, and `shot.png`.
![Orb Runner running headless](docs/assets/orb-runner.png)

## The tools

| Script | What it does |
|---|---|
| `scripts/detect-engine.mjs` | Scans a project directory and the machine: engine scores, install health (e.g. Unreal missing `Engine/Binaries/Win64`), toolchain (Node, .NET, browsers) and next-step suggestions. |
| `scripts/verify-web.mjs` | Headless Edge/Chrome over the DevTools protocol: waits for a probe, collects console/page errors, injects keys/clicks, evaluates JS, screenshots, exits non-zero on errors. |
| `scripts/serve.mjs` | Zero-dependency static file server (MIME table, directory-traversal protection, SPA fallback). |
| `scripts/sync-github.mjs` | Push committed content through the GitHub Git Data API when `github.com:443` is unreachable; dry-run by default, `--apply` creates one commit. |
| `scripts/prepare-engine.mjs` | Bootstraps engines so the commands actually run: Godot is downloaded, unzipped and self-tested (`--headless --version`); Unity Hub is installed silently (editor + license remain one manual/CI step); Unreal is checked for a complete `Engine/Binaries/Win64`. Dry-run by default, `--apply` to install. |
| `scripts/balance-sweep.mjs` | Runs batches of seeded matches headlessly (browser probe or a DOM-free core module), writes CSV, reports win rate, mean survival and score percentiles — so balance is measured, not guessed. |
| `scripts/publish.mjs` | One publishing entry point: itch.io (`butler`), Steam (`steamcmd` + SteamPipe VDF), web zip/deploy, WeChat mini-game CLI, Gradle/Fastlane, Xcode archive. Dry-run by default; `--apply` executes; secrets are read from env and redacted in logs. |

`verify-web.mjs` flags worth knowing:

- `--press KeyD:1200` — hold one key for a custom duration; repeatable, executed in order.
- `--click 640,360` — single click at page coordinates (start buttons, menus, click-based games).
- `--ignore <regex>` — repeatable; matches error text and resource URLs. Ignored items are listed
  under `ignored` and do **not** fail the run.
- `--strict` — disables the default noise filter (favicon 404) when you want a zero-tolerance run.
- `--json` — full machine-readable report (`ignored`, `pressPlan`, `click`, canvas size, state).

The probe contract for a web game:

```js
window.__game = {
  ready: true,
  state: () => ({ t, score, hp, mode, entities: 3, player: { x, y } }),
  press: (code, ms) => {},
  reset: (seed) => {},
};
```

## Engine support — honest status

| Tier | Engines | Status |
|---|---|---|
| Verified end-to-end | Web / HTML5 (Canvas, Phaser, Three.js) | Runs and verifies headless on Windows + Edge 158 |
| Guided (engine must be installed) | Unity, Unreal Engine, Godot, GameMaker, Cocos Creator, RPG Maker MV/MZ | Complete build/test/verify command references; scripts are only exercised once the engine is present |
| Code-first recipes | Bevy, MonoGame, LÖVE, pygame, Raylib, LibGDX, HaxeFlixel, Ebitengine | Minimal runnable code per engine, no editor needed |
| No automation | Construct 3 | Manual `.c3p` export; no scriptable CLI |

If the target engine is missing, the skill does not stop at "install it yourself": `prepare-engine.mjs`
bootstraps Godot fully automatically (portable zip), installs Unity Hub silently, and reports exactly
which Unreal binaries are missing. Only after that does it fall back to a web prototype plus a
migration plan — and it never claims an engine build succeeded when it did not.

## Content and balance are scripted too

- `templates/blender/gen_props.py` — headless Blender: builds props, materials, exports GLB/FBX.
- `templates/ue/gen_assets.py` — UE editor Python: imports models, spawns actors, saves a level.
- `templates/unity/Editor/BuildTools.cs` — Unity `-executeMethod`: procedural mesh, prefab, scene.
- `templates/godot/tools/gen_content.gd` — Godot tool script: `ArrayMesh` → `.tres`, `.tscn` scene.
- `node scripts/balance-sweep.mjs --url http://127.0.0.1:8123 --seeds 1-100 --seconds 90` —
  batch runs, CSV, win-rate/survival/percentile summary; `--core dist/core.mjs` for faster sweeps.

## Repository layout

```
SKILL.md                # the skill body the agent loads (Chinese, canonical)
references/             # 15 deep-dive docs: engines, architecture, asset pipeline, balance lab,
                        # verification, publishing automation, assets & audio, shipping
scripts/                # detect-engine, prepare-engine, verify-web, balance-sweep, publish, serve
templates/web-canvas/   # runnable Canvas game with probe, save, audio
templates/blender/      # headless Blender prop generator (GLB/FBX)
templates/ue/           # Unreal editor Python asset + level generator
templates/unity/        # Unity editor batch content generator
templates/godot/        # Godot tool script content generator
docs/en/quickstart.md   # English walkthrough
docs/assets/            # screenshots
```

## Automation coverage (what used to be a limitation)

| Area | How it is automated now | What still needs a human |
|---|---|---|
| Models / levels / prefabs | Blender headless; UE Python, Unity Editor, Godot tool scripts; JSON level data | Art direction choices |
| Engine setup | `prepare-engine.mjs`: Godot fully automated; Unity Hub silent install; Unreal integrity check | Unity license activation; Unreal's 30–80 GB installer |
| Publishing | `publish.mjs`: butler, steamcmd, web zip/deploy, WeChat CLI, Gradle/Fastlane, Xcode archive | First login, 2FA, store review submission |
| Balance & feel | `balance-sweep.mjs`: seeded batch runs, CSV, win rate / survival / score percentiles | Final subjective polish |

The only genuinely non-automatable parts are art-direction calls, Unity license activation, the Unreal
30–80 GB installer, first login/2FA and store review, and the final subjective polish. Everything else is a
command. When one of these blocks the loop, hand it back with the exact command and expected artifact
instead of faking automation.

## License

No license file yet. Pick one (MIT is a common default) before redistributing or accepting
contributions.
