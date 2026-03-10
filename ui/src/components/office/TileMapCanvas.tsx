import { useEffect, useRef } from "react";
import type { TiledMap, TiledLayer, TiledTileset, TiledObject } from "./types";

// The seat layer (objectgroup with seat/record_player objects) determines agent
// z-order. The tilelayer immediately before it is the "furniture" layer — desks,
// monitors — that should render ON TOP of agents for a "sitting behind desk"
// effect. So we split one layer earlier: below = 0..furnitureIdx-1, above = rest.
const SEAT_LAYER_TYPES = new Set(["seat", "record_player"]);

function isSeatLayer(layer: TiledLayer): boolean {
  if (layer.type !== "objectgroup" || !layer.objects) {
    return false;
  }

  return layer.objects.some((obj) => SEAT_LAYER_TYPES.has(obj.type));
}

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

// Bob animation params
const BOB_AMPLITUDE = 1;
const BOB_BASE_PERIOD = 4000;
const BOB_PERIOD_VARIANCE = 2000;

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const GID_MASK = 0x1fffffff;

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

/** Resolve the image source and sprite rect for a gid, handling both grid and collection tilesets. */
function resolveTile(
  gid: number,
  ts: TiledTileset,
  obj?: TiledObject,
): { img: HTMLImageElement; srcX: number; srcY: number; srcW: number; srcH: number; destW: number; destH: number } | null {
  const localId = gid - ts.firstgid;

  // Collection tileset (columns === 0, individual images per tile)
  if (ts.columns === 0 && ts.tiles) {
    const tile = ts.tiles.find((t) => t.id === localId);

    if (!tile) {
      return null;
    }

    const img = globalImageCache.get(`/office/${tile.image}`);

    if (!img) {
      return null;
    }

    const destW = obj?.width ?? tile.imagewidth;
    const destH = obj?.height ?? tile.imageheight;

    return { img, srcX: 0, srcY: 0, srcW: tile.imagewidth, srcH: tile.imageheight, destW, destH };
  }

  // Grid tileset
  const img = globalImageCache.get(`/office/${ts.image}`);

  if (!img) {
    return null;
  }

  const srcX = (localId % ts.columns) * ts.tilewidth;
  const srcY = Math.floor(localId / ts.columns) * ts.tileheight;

  const destW = obj?.width ?? ts.tilewidth;
  const destH = obj?.height ?? ts.tileheight;

  return { img, srcX, srcY, srcW: ts.tilewidth, srcH: ts.tileheight, destW, destH };
}

/** Draw a tilelayer onto ctx. */
function drawTileLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: TiledLayer,
  tilesets: TiledTileset[],
  mapWidth: number,
  tilewidth: number,
  tileheight: number,
) {
  if (!layer.data || !layer.visible) {
    return;
  }

  for (let i = 0; i < layer.data.length; i++) {
    const rawGid = layer.data[i]!;
    const gid = rawGid & GID_MASK;

    if (gid === 0) {
      continue;
    }

    const ts = findTileset(gid, tilesets);

    if (!ts) {
      continue;
    }

    const tile = resolveTile(gid, ts);

    if (!tile) {
      continue;
    }

    const destX = (i % mapWidth) * tilewidth;
    const destY = Math.floor(i / mapWidth) * tileheight;

    ctx.drawImage(tile.img, tile.srcX, tile.srcY, tile.srcW, tile.srcH, destX, destY, tile.srcW, tile.srcH);
  }
}

/** Draw tile objects (gid-based) from an objectgroup layer. */
function drawTileObjects(
  ctx: OffscreenCanvasRenderingContext2D,
  layer: TiledLayer,
  tilesets: TiledTileset[],
) {
  if (!layer.objects || !layer.visible) {
    return;
  }

  for (const obj of layer.objects) {
    if (obj.text) {
      drawTextObject(ctx, obj);
      continue;
    }

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

    const tile = resolveTile(gid, ts, obj);

    if (!tile) {
      continue;
    }

    const destX = obj.x;
    const destY = obj.y - tile.destH;
    const rotation = obj.rotation ? (obj.rotation * Math.PI) / 180 : 0;

    ctx.save();

    if (rotation) {
      // Tiled rotates around (obj.x, obj.y) which is bottom-left for tile objects
      ctx.translate(obj.x, obj.y);
      ctx.rotate(rotation);
      ctx.translate(-obj.x, -obj.y);
    }

    if (flipH || flipV) {
      ctx.translate(destX + tile.destW / 2, destY + tile.destH / 2);
      ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
      ctx.drawImage(
        tile.img,
        tile.srcX, tile.srcY, tile.srcW, tile.srcH,
        -tile.destW / 2, -tile.destH / 2, tile.destW, tile.destH,
      );
    } else {
      ctx.drawImage(
        tile.img,
        tile.srcX, tile.srcY, tile.srcW, tile.srcH,
        destX, destY, tile.destW, tile.destH,
      );
    }

    ctx.restore();
  }
}

/** Draw a text object onto ctx. */
function drawTextObject(ctx: OffscreenCanvasRenderingContext2D, obj: TiledObject) {
  const t = obj.text!;
  const size = t.pixelsize ?? 16;
  const font = t.fontfamily ?? "sans-serif";
  const rotation = obj.rotation ? (obj.rotation * Math.PI) / 180 : 0;

  ctx.save();

  if (rotation) {
    ctx.translate(obj.x, obj.y);
    ctx.rotate(rotation);
    ctx.translate(-obj.x, -obj.y);
  }

  ctx.font = `${size}px "${font}"`;
  ctx.fillStyle = t.color ?? "#ffffff";
  ctx.textBaseline = t.valign === "bottom" ? "bottom" : t.valign === "center" ? "middle" : "top";

  let x = Math.round(obj.x);

  if (t.halign === "center") {
    ctx.textAlign = "center";
    x = Math.round(obj.x + obj.width / 2);
  } else if (t.halign === "right") {
    ctx.textAlign = "right";
    x = Math.round(obj.x + obj.width);
  } else {
    ctx.textAlign = "left";
  }

  let y = Math.round(obj.y);

  if (t.valign === "center") {
    y = Math.round(obj.y + obj.height / 2);
  } else if (t.valign === "bottom") {
    y = Math.round(obj.y + obj.height);
  }

  ctx.fillText(t.text, x, y);
  ctx.restore();
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

      // Collect all image sources to preload
      const srcs = new Set<string>();

      for (const ts of tilesets) {
        if (ts.image) {
          srcs.add(`/office/${ts.image}`);
        }
        if (ts.tiles) {
          for (const tile of ts.tiles) {
            srcs.add(`/office/${tile.image}`);
          }
        }
      }

      srcs.add("/office/tilesets/furniture-state1-16x16.png");
      srcs.add("/office/tilesets/furniture-state2-16x16.png");
      srcs.add("/office/tilesets/small-items-16x16.png");

      for (const a of agents) {
        srcs.add(`/office/characters/${a.sprite}`);
      }

      await Promise.all([...srcs].map(loadImage));

      // Preload fonts used by text objects so canvas can render them
      const fontFamilies = new Set<string>();

      for (const layer of layers) {
        if (layer.type !== "objectgroup" || !layer.objects) {
          continue;
        }
        for (const obj of layer.objects) {
          if (obj.text?.fontfamily) {
            fontFamilies.add(obj.text.fontfamily);
          }
        }
      }

      if (fontFamilies.size > 0) {
        await Promise.all(
          [...fontFamilies].map((f) => document.fonts.load(`16px "${f}"`).catch(() => {})),
        );
      }

      if (cancelled) {
        return;
      }

      // Split layers into below-agents and above-agents at the seat layer boundary
      const seatLayerIdx = layers.findIndex(isSeatLayer);

      // Find the last tilelayer before the seat layer — that's the "furniture"
      // layer (desks/monitors) which must render above agents.
      let furnitureIdx = seatLayerIdx;

      if (seatLayerIdx > 0) {
        for (let i = seatLayerIdx - 1; i >= 0; i--) {
          if (layers[i]!.type === "tilelayer") {
            furnitureIdx = i;
            break;
          }
        }
      }

      const splitIdx = furnitureIdx === -1 ? layers.length : furnitureIdx;
      const belowLayers = layers.slice(0, splitIdx);
      const aboveLayers = layers.filter((_, i) => i >= splitIdx && !isSeatLayer(layers[i]!));

      // Render below-agent layers
      const belowCanvas = new OffscreenCanvas(pw, ph);
      const belowCtx = belowCanvas.getContext("2d")!;

      belowCtx.imageSmoothingEnabled = false;

      for (const layer of belowLayers) {
        if (!layer.visible) {
          continue;
        }
        if (layer.type === "tilelayer") {
          drawTileLayer(belowCtx, layer, tilesets, width, tilewidth, tileheight);
        } else if (layer.type === "objectgroup") {
          drawTileObjects(belowCtx, layer, tilesets);
        }
      }

      const belowSnapshot = belowCtx.getImageData(0, 0, pw, ph);

      // Render above-agent layers
      const aboveCanvas = new OffscreenCanvas(pw, ph);
      const aboveCtx = aboveCanvas.getContext("2d")!;

      aboveCtx.imageSmoothingEnabled = false;

      for (const layer of aboveLayers) {
        if (!layer.visible) {
          continue;
        }
        if (layer.type === "tilelayer") {
          drawTileLayer(aboveCtx, layer, tilesets, width, tilewidth, tileheight);
        } else if (layer.type === "objectgroup") {
          drawTileObjects(aboveCtx, layer, tilesets);
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
              srcX, srcY, TILE16, TILE16,
              px + ox - TILE16, py + oy - TILE16, TILE16 * 2, TILE16 * 2,
            );
          }
        }
        if (smallItemsImg) {
          const SCOLS = 8;
          const vSrcX = (VINYL_FRAME % SCOLS) * TILE16;
          const vSrcY = Math.floor(VINYL_FRAME / SCOLS) * TILE16;

          aboveCtx.drawImage(
            smallItemsImg,
            vSrcX, vSrcY, TILE16, TILE16,
            px + 12, py - 12, TILE16 * 2, TILE16 * 2,
          );
        }
      }

      staticRef.current = { below: belowSnapshot, above: aboveCanvas, pw, ph };

      onReady?.();
    })();

    return () => {
      cancelled = true;
    };
  }, [mapData, recordPlayer, playing, agents, onReady]);

  // Animation loop: below layers → agents (with bob) → above layers
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
    const frameBudgetMs = hasRunning ? 0 : 100;
    let rafId: number | null = null;
    let lastDrawTime = 0;

    function draw(time: number) {
      const staticLayers = staticRef.current;

      if (!staticLayers) {
        rafId = requestAnimationFrame(draw);

        return;
      }

      if (time - lastDrawTime < frameBudgetMs) {
        rafId = requestAnimationFrame(draw);

        return;
      }

      lastDrawTime = time;

      const ctx = canvas!.getContext("2d")!;

      ctx.imageSmoothingEnabled = false;

      // 1. Draw below-agent layers
      ctx.putImageData(staticLayers.below, 0, 0);

      // 2. Draw agents with bob
      for (const agent of agents) {
        const img = globalImageCache.get(`/office/characters/${agent.sprite}`);

        if (!img) {
          continue;
        }

        const params = phaseRef.current.get(agent.seatId) ?? { phase: 0, period: BOB_BASE_PERIOD };
        const period = agent.isRunning ? params.period * 0.08 : params.period;
        const amplitude = agent.isRunning ? BOB_AMPLITUDE * 2 : BOB_AMPLITUDE;
        const bob =
          ((1 - Math.cos(((time + params.phase) / period) * Math.PI * 2)) / 2) * amplitude;

        ctx.drawImage(img, agent.x, agent.y - img.height + tileheight / 2 + bob);
      }

      // 3. Draw above-agent layers + objects + record player
      ctx.drawImage(staticLayers.above, 0, 0);

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
