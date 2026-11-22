# 代码优先的引擎

这些方案的共同点：项目全部是文本，能直接生成、能无头构建、能进 CI，不需要打开编辑器点任何东西。代价是工具链与资产管线要自己搭。

## Bevy（Rust）

```toml
# Cargo.toml
[dependencies]
bevy = "0.15"
```

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .add_systems(Update, move_player)
        .run();
}

#[derive(Component)]
struct Player;

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);
    commands.spawn((Sprite::from_color(Color::srgb(0.9, 0.3, 0.3), Vec2::splat(48.0)), Player));
}

fn move_player(
    keys: Res<ButtonInput<KeyCode>>,
    time: Res<Time>,
    mut q: Query<&mut Transform, With<Player>>,
) {
    for mut t in &mut q {
        let mut dir = Vec2::ZERO;
        if keys.pressed(KeyCode::KeyW) { dir.y += 1.0; }
        if keys.pressed(KeyCode::KeyS) { dir.y -= 1.0; }
        if keys.pressed(KeyCode::KeyA) { dir.x -= 1.0; }
        if keys.pressed(KeyCode::KeyD) { dir.x += 1.0; }
        t.translation += (dir.normalize_or_zero() * 300.0 * time.delta_secs()).extend(0.0);
    }
}
```

- `cargo run` 首次编译慢（数分钟），之后增量。
- 版本升级破坏性大：固定 minor 版本，读对应版本的 migration guide。
- 无头测试：把玩法写成纯 Rust 函数或 `App` + `MinimalPlugins`，`cargo test`。
- 本机未装 `cargo`；装 Rust 后可完全无 GUI 开发。

## MonoGame（C#）

```bash
dotnet new install MonoGame.Templates.CSharp
dotnet new mgdesktopgl -o MyGame
cd MyGame && dotnet run
```

- `Game1.cs` 里 `Initialize/LoadContent/Update/Draw`；`Content.mgcb` 用 MGCB 编辑器或 CLI 编译资产：

```bash
dotnet tool install -g dotnet-mgcb
mgcb Content/Content.mgcb /rebuild
```

- 无头测试：把玩法逻辑抽成不依赖 `GraphicsDevice` 的类，`dotnet test` 直接跑。
- 发布：`dotnet publish -c Release -r win-x64 --self-contained`。
- 本机 `dotnet` 无 SDK，需先装 .NET 8 SDK。

## LÖVE（Lua）

```lua
-- main.lua
local player = { x = 400, y = 300, r = 16 }

function love.load() love.window.setTitle("Game") end

function love.update(dt)
  local dx, dy = 0, 0
  if love.keyboard.isDown("a", "left") then dx = dx - 1 end
  if love.keyboard.isDown("d", "right") then dx = dx + 1 end
  if love.keyboard.isDown("w", "up") then dy = dy - 1 end
  if love.keyboard.isDown("s", "down") then dy = dy + 1 end
  local len = math.sqrt(dx * dx + dy * dy)
  if len > 0 then
    player.x = player.x + dx / len * 260 * dt
    player.y = player.y + dy / len * 260 * dt
  end
end

function love.draw()
  love.graphics.circle("fill", player.x, player.y, player.r)
end
```

- `conf.lua` 设窗口与模块；`love .` 运行。
- 打包：`love-release` 或把 `.love`（zip）与 `love.exe` 拼接。
- 无头测试：Lua 逻辑抽成纯模块，用 `busted` 或 `lua` 直接跑。

## pygame（Python）

```python
import pygame, sys

pygame.init()
screen = pygame.display.set_mode((960, 540))
clock = pygame.time.Clock()
pos = pygame.Vector2(480, 270)

while True:
    for e in pygame.event.get():
        if e.type == pygame.QUIT:
            pygame.quit(); sys.exit()
    keys = pygame.key.get_pressed()
    if keys[pygame.K_a]: pos.x -= 260 * clock.get_time() / 1000
    if keys[pygame.K_d]: pos.x += 260 * clock.get_time() / 1000
    screen.fill((24, 24, 32))
    pygame.draw.circle(screen, (230, 90, 90), pos, 16)
    pygame.display.flip()
    clock.tick(60)
```

- 无头测试：`SDL_VIDEODRIVER=dummy`，逻辑抽到无 pygame 的模块用 pytest。
- 打包：`pyinstaller --onefile main.py`。
- 适合教学、AI 实验、Jam；性能与移动端是短板。

## Raylib（C / 多语言绑定）

```c
#include "raylib.h"

int main(void) {
    InitWindow(960, 540, "Game");
    Vector2 pos = { 480, 270 };
    while (!WindowShouldClose()) {
        float dt = GetFrameTime();
        if (IsKeyDown(KEY_A)) pos.x -= 260 * dt;
        if (IsKeyDown(KEY_D)) pos.x += 260 * dt;
        BeginDrawing();
        ClearBackground((Color){ 24, 24, 32, 255 });
        DrawCircleV(pos, 16, (Color){ 230, 90, 90, 255 });
        EndDrawing();
    }
    CloseWindow();
}
```

- 单头文件风格、依赖少，适合 C/C++/Go/Python/Rust 绑定。
- 无头：`SetTraceLogLevel` + 跳过 `BeginDrawing`，或纯逻辑测试。

## LibGDX（Java/Kotlin）

- `gdx-liftoff` 生成工程；`./gradlew lwjgl3:run` 桌面运行，`./gradlew desktop:dist` 打包。
- 逻辑放 `core/`，平台各建 `android/ios/lwjgl3` 模块。
- 无头测试：`HeadlessApplication` + JUnit。

## HaxeFlixel / OpenFL

- `haxelib install flixel`，`lime build windows`、`lime build html5`。
- 一份 Haxe 代码多平台输出；生态较小，适合 2D 与 Flash 迁移。

## Ebitengine（Go）

```go
package main

import (
    "image/color"
    "github.com/hajimehoshi/ebiten/v2"
)

type Game struct{ x, y float64 }

func (g *Game) Update() error {
    if ebiten.IsKeyPressed(ebiten.KeyD) { g.x += 3 }
    if ebiten.IsKeyPressed(ebiten.KeyA) { g.x -= 3 }
    return nil
}
func (g *Game) Draw(s *ebiten.Image) { s.Fill(color.RGBA{24, 24, 32, 255}) }
func (g *Game) Layout(w, h int) (int, int) { return 960, 540 }

func main() { ebiten.RunGame(&Game{}) }
```

- 纯 Go、跨平台、编译快；3D 能力有限。

## 通用建议

- 逻辑与渲染分离，逻辑用宿主语言原生测试框架（`cargo test`、`dotnet test`、`pytest`、`go test`）。
- 资产用通用格式（PNG、OGG、JSON、glTF），不要绑定引擎私有格式。
- 固定步长与种子随机自己实现，别依赖渲染帧。
- 先跑通「窗口出现 + 一个圆能动能退出」，再堆功能。
- 这些引擎的调试器普遍弱于 Unity/UE，日志与断言要早写。
