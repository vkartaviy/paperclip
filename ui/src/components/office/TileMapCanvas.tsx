import { useEffect, useRef } from "react";
import type { TiledMap, TiledLayer, TiledTileset } from "./types";

// Layers to render BEFORE agents (below them)
const LAYERS_BELOW_AGENTS = ["Floor", "Walls", "Windows", "Flowers"];
// Layers to render AFTER agents (on top, creating "sitting behind desk" effect)
const LAYERS_ABOVE_AGENTS = ["Furniture", "Fruits", "Pillows"];

interface AgentSprite {
  seatId: string;
  x: number;
  y: number;
  sprite: string;
  statusColor: string;
  isRunning?: boolean;
}

interface RecordPlayerPos {
  x: number;
  y: number;
}

interface Props {
  mapData: TiledMap;
  agents: AgentSprite[];
  recordPlayer?: RecordPlayerPos | null;
  playing?: boolean;
  onReady?: () => void;
}

function findTileset(gid: number, tilesets: TiledTileset[]): TiledTileset | null {
  let match: TiledTileset | null = null;

  for (const ts of tilesets) {
    if (ts.firstgid <= gid) {
      if (!match || ts.firstgid > match.firstgid) {
        match = ts;
      }
    }
  }

  return match;
}

// Record player: 2x2 tiles from furniture spritesheet
const PLAYER_FRAMES = [219, 220, 232, 233] as const;
const PLAYER_OFFSETS = [
  [-16, -16],
  [16, -16],
  [-16, 16],
  [16, 16],
] as const;
const VINYL_FRAME = 17;

// Bob animation params (matching reference: y-2px, ~2s period, sine ease)
const BOB_AMPLITUDE = 1;
const BOB_BASE_PERIOD = 4000;
const BOB_PERIOD_VARIANCE = 2000; // each agent gets base ± up to this

// Persistent image cache across renders
const globalImageCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = globalImageCache.get(src);

  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      globalImageCache.set(src, img);
      resolve(img);
    };

    img.onerror = () => resolve(img);
    img.src = src;
  });
}

interface StaticLayers {
  below: ImageData;
  above: OffscreenCanvas;
  pw: number;
  ph: number;
}

export function TileMapCanvas({ mapData, agents, recordPlayer, playing, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const staticRef = useRef<StaticLayers | null>(null);
  const phaseRef = useRef(new Map<string, { phase: number; period: number }>());

  // Ensure each agent has a random phase + period (in effect to satisfy react-hooks/purity)
  useEffect(() => {
    for (const a of agents) {
      if (!phaseRef.current.has(a.seatId)) {
        phaseRef.current.set(a.seatId, {
          phase: Math.random() * BOB_BASE_PERIOD,
          period: BOB_BASE_PERIOD + (Math.random() - 0.5) * BOB_PERIOD_VARIANCE,
        });
      }
    }
  }, [agents]);

  // Build static layers whenever map/recordPlayer/playing changes
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { width, height, tilewidth, tileheight, tilesets, layers } = mapData;
      const pw = width * tilewidth;
      const ph = height * tileheight;

      // Load all images
      const srcs = new Set<string>(tilesets.map((ts) => `/office/${ts.image}`));

      srcs.add("/office/tilesets/furniture-state1-16x16.png");
      srcs.add("/office/tilesets/furniture-state2-16x16.png");
      srcs.add("/office/tilesets/small-items-16x16.png");

      for (const a of agents) {
        srcs.add(`/office/characters/${a.sprite}`);
      }

      await Promise.all([...srcs].map(loadImage));

      if (cancelled) {
        return;
      }

      // Render static layers to offscreen canvas
      const offscreen = new OffscreenCanvas(pw, ph);
      const ctx = offscreen.getContext("2d")!;

      ctx.imageSmoothingEnabled = false;

      function drawLayer(layer: TiledLayer) {
        if (!layer.data || !layer.visible) {
          return;
        }
        for (let i = 0; i < layer.data.length; i++) {
          const rawGid = layer.data[i]!;
          const gid = rawGid & 0x1fffffff;

          if (gid === 0) {
            continue;
          }

          const ts = findTileset(gid, tilesets);

          if (!ts) {
            continue;
          }

          const img = globalImageCache.get(`/office/${ts.image}`);

          if (!img) {
            continue;
          }

          const localId = gid - ts.firstgid;
          const srcX = (localId % ts.columns) * ts.tilewidth;
          const srcY = Math.floor(localId / ts.columns) * ts.tileheight;
          const destX = (i % width) * tilewidth;
          const destY = Math.floor(i / width) * tileheight;

          ctx.drawImage(
            img,
            srcX,
            srcY,
            ts.tilewidth,
            ts.tileheight,
            destX,
            destY,
            ts.tilewidth,
            ts.tileheight
          );
        }
      }

      // Below-agent layers
      for (const name of LAYERS_BELOW_AGENTS) {
        const layer = layers.find((l) => l.name === name && l.type === "tilelayer");

        if (layer) {
          drawLayer(layer);
        }
      }

      // Save the below-agents snapshot (we'll need to sandwich agents between layers)
      const belowSnapshot = ctx.getImageData(0, 0, pw, ph);

      // Above-agent layers (drawn on a separate temp)
      const aboveCanvas = new OffscreenCanvas(pw, ph);
      const aboveCtx = aboveCanvas.getContext("2d")!;

      aboveCtx.imageSmoothingEnabled = false;

      for (const name of LAYERS_ABOVE_AGENTS) {
        const layer = layers.find((l) => l.name === name && l.type === "tilelayer");

        if (layer) {
          if (!layer.data || !layer.visible) {
            continue;
          }
          for (let i = 0; i < layer.data.length; i++) {
            const rawGid = layer.data[i]!;
            const gid2 = rawGid & 0x1fffffff;

            if (gid2 === 0) {
              continue;
            }

            const ts = findTileset(gid2, tilesets);

            if (!ts) {
              continue;
            }

            const img = globalImageCache.get(`/office/${ts.image}`);

            if (!img) {
              continue;
            }

            const localId = gid2 - ts.firstgid;
            const srcX = (localId % ts.columns) * ts.tilewidth;
            const srcY = Math.floor(localId / ts.columns) * ts.tileheight;
            const destX = (i % width) * tilewidth;
            const destY = Math.floor(i / width) * tileheight;

            aboveCtx.drawImage(
              img,
              srcX,
              srcY,
              ts.tilewidth,
              ts.tileheight,
              destX,
              destY,
              ts.tilewidth,
              ts.tileheight
            );
          }
        }
      }

      // Tile objects from object layers
      const FLIP_H = 0x80000000;
      const FLIP_V = 0x40000000;
      const GID_MASK = 0x1fffffff;

      for (const layer of layers) {
        if (layer.type !== "objectgroup" || !layer.objects) {
          continue;
        }
        for (const obj of layer.objects) {
          const rawGid = obj.gid ?? 0;

          if (!rawGid) {
            continue;
          }

          const gid = rawGid & GID_MASK;
          const flipH = (rawGid & FLIP_H) !== 0;
          const flipV = (rawGid & FLIP_V) !== 0;
          const ts = findTileset(gid, tilesets);

          if (!ts) {
            continue;
          }

          const img = globalImageCache.get(`/office/${ts.image}`);

          if (!img) {
            continue;
          }

          const localId = gid - ts.firstgid;
          const srcX = (localId % ts.columns) * ts.tilewidth;
          const srcY = Math.floor(localId / ts.columns) * ts.tileheight;
          const destX = obj.x;
          const destY = obj.y - ts.tileheight;

          aboveCtx.save();

          if (flipH || flipV) {
            aboveCtx.translate(destX + ts.tilewidth / 2, destY + ts.tileheight / 2);
            aboveCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
            aboveCtx.drawImage(
              img,
              srcX,
              srcY,
              ts.tilewidth,
              ts.tileheight,
              -ts.tilewidth / 2,
              -ts.tileheight / 2,
              ts.tilewidth,
              ts.tileheight
            );
          } else {
            aboveCtx.drawImage(
              img,
              srcX,
              srcY,
              ts.tilewidth,
              ts.tileheight,
              destX,
              destY,
              ts.tilewidth,
              ts.tileheight
            );
          }

          aboveCtx.restore();
        }
      }

      // Record player
      if (recordPlayer) {
        const px = recordPlayer.x + 32;
        const py = recordPlayer.y + 32;
        const furnitureSheet = playing
          ? "tilesets/furniture-state2-16x16.png"
          : "tilesets/furniture-state1-16x16.png";
        const furnitureImg = globalImageCache.get(`/office/${furnitureSheet}`);
        const smallItemsImg = globalImageCache.get("/office/tilesets/small-items-16x16.png");
        const TILE16 = 16;
        const FCOLS = 13;

        if (furnitureImg) {
          for (let i = 0; i < PLAYER_FRAMES.length; i++) {
            const frame = PLAYER_FRAMES[i];
            const [ox, oy] = PLAYER_OFFSETS[i];
            const srcX = (frame % FCOLS) * TILE16;
            const srcY = Math.floor(frame / FCOLS) * TILE16;

            aboveCtx.drawImage(
              furnitureImg,
              srcX,
              srcY,
              TILE16,
              TILE16,
              px + ox - TILE16,
              py + oy - TILE16,
              TILE16 * 2,
              TILE16 * 2
            );
          }
        }
        if (smallItemsImg) {
          const SCOLS = 8;
          const vSrcX = (VINYL_FRAME % SCOLS) * TILE16;
          const vSrcY = Math.floor(VINYL_FRAME / SCOLS) * TILE16;

          aboveCtx.drawImage(
            smallItemsImg,
            vSrcX,
            vSrcY,
            TILE16,
            TILE16,
            px + 12,
            py - 12,
            TILE16 * 2,
            TILE16 * 2
          );
        }
      }

      // Store both layers for the animation loop
      staticRef.current = { below: belowSnapshot, above: aboveCanvas, pw, ph };

      onReady?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [mapData, recordPlayer, playing, agents, onReady]);

  // Composites: below layers → agents (with bob) → above layers
  // Only runs a continuous rAF loop when agents are running; otherwise draws once.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const { tileheight, width, height } = mapData;
    const pw = width * mapData.tilewidth;
    const ph = height * tileheight;

    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }

    const hasAgents = agents.length > 0;
    const hasRunning = agents.some((a) => a.isRunning);
    // Running agents: 60fps for smooth fast bob. Idle only: ~10fps for subtle slow bob.
    const frameBudgetMs = hasRunning ? 0 : 100;
    let rafId: number | null = null;
    let lastDrawTime = 0;

    function draw(time: number) {
      const layers = staticRef.current;

      if (!layers) {
        rafId = requestAnimationFrame(draw);

        return;
      }

      // Throttle idle-only frames
      if (time - lastDrawTime < frameBudgetMs) {
        rafId = requestAnimationFrame(draw);

        return;
      }

      lastDrawTime = time;

      const ctx = canvas!.getContext("2d")!;

      ctx.imageSmoothingEnabled = false;

      // 1. Draw below-agent layers
      ctx.putImageData(layers.below, 0, 0);

      // 2. Draw agents with bob
      for (const agent of agents) {
        const img = globalImageCache.get(`/office/characters/${agent.sprite}`);

        if (!img) {
          continue;
        }

        const params = phaseRef.current.get(agent.seatId) ?? { phase: 0, period: BOB_BASE_PERIOD };
        // Running agents bob faster and bigger
        const period = agent.isRunning ? params.period * 0.08 : params.period;
        const amplitude = agent.isRunning ? BOB_AMPLITUDE * 2 : BOB_AMPLITUDE;
        const bob =
          ((1 - Math.cos(((time + params.phase) / period) * Math.PI * 2)) / 2) * amplitude;

        ctx.drawImage(img, agent.x, agent.y - img.height + tileheight / 2 + bob);
      }

      // 3. Draw above-agent layers + objects + record player
      ctx.drawImage(layers.above, 0, 0);

      if (hasAgents) {
        rafId = requestAnimationFrame(draw);
      }
    }

    rafId = requestAnimationFrame(draw);

    return () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [mapData, agents, playing]);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-auto"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
