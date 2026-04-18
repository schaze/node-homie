export interface HomieRGBColor {
    r: number;
    g: number;
    b: number;
}
export function isHomieRGBColor(color: any): color is HomieRGBColor {
    return color !== undefined && color !== null && Object.prototype.hasOwnProperty.call(color, 'r') && Object.prototype.hasOwnProperty.call(color, 'g') && Object.prototype.hasOwnProperty.call(color, 'b');
}
export interface HomieHSVColor {
    h: number;
    s: number;
    v: number;
}
export function isHomieHSVColor(color: any): color is HomieHSVColor {
    return color !== undefined && color !== null && Object.prototype.hasOwnProperty.call(color, 'h') && Object.prototype.hasOwnProperty.call(color, 's') && Object.prototype.hasOwnProperty.call(color, 'v');
}

export interface HomieXYBriColor {
    x: number;
    y: number;
    bri?: number;
}
export function isHomieXYBriColor(color: any): color is HomieXYBriColor {
    return color !== undefined && color !== null && Object.prototype.hasOwnProperty.call(color, 'x') && Object.prototype.hasOwnProperty.call(color, 'y');
}