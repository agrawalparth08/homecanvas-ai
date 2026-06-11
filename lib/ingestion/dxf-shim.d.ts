declare module 'dxf' {
  export class Helper {
    constructor(dxf: string);
    parsed: { header?: Record<string, number>; entities?: unknown[] };
    denormalised: unknown[];
    toPolylines(): { polylines: { vertices: number[][] }[] };
  }
}
