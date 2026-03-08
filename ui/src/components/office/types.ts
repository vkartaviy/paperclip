export interface TiledTileset {
  firstgid: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  columns: number;
  tilecount: number;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  gid?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  properties?: Array<{ name: string; value: string }>;
}

export interface TiledLayer {
  type: "tilelayer" | "objectgroup";
  name: string;
  data?: number[];
  objects?: TiledObject[];
  visible: boolean;
  width?: number;
  height?: number;
}

export interface TiledMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}
