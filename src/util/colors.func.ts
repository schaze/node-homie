import { HomieRGBColor, HomieHSVColor, HomieXYBriColor } from "../model";

export const COLOR_STRING_MATCH = /(\d{1,3}),\s?(\d{1,3}),\s?(\d{1,3})/;

export function parseRGBColor(colorString: string | null | undefined): HomieRGBColor {
    if (!colorString) { return { r: 0, g: 0, b: 0 }; }
    const colors = COLOR_STRING_MATCH.exec(colorString);
    if (colors === null) { return { r: 0, g: 0, b: 0 }; }
    return { r: parseInt(colors[1]), g: parseInt(colors[2]), b: parseInt(colors[3]) }
}

export function rgbColorToString(rgb: HomieRGBColor | null | undefined): string {
    if (!rgb) { return '0,0,0'; }
    return `${rgb.r},${rgb.g},${rgb.b}`;
}
export function parseHSVColor(colorString: string | null | undefined): HomieHSVColor {
    if (!colorString) { return { h: 0, s: 0, v: 0 }; }
    const colors = COLOR_STRING_MATCH.exec(colorString);
    if (colors === null) { return { h: 0, s: 0, v: 0 }; }
    return { h: parseInt(colors[1]), s: parseInt(colors[2]), v: parseInt(colors[3]) }
}

export function hsvColorToString(hsv: HomieHSVColor | null | undefined): string {
    if (!hsv) { return '0,0,0'; }
    return `${hsv.h},${hsv.s},${hsv.v}`;
}


export function componentToHex(c: number) {
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

export function rgbColorToHex(color: HomieRGBColor | null | undefined): string {
    if (!color) { return '000000'; }
    return `${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`
}

export function rgbToHsv(rgb: HomieRGBColor | null | undefined): HomieHSVColor {
    if (!rgb) { return { h: 0, s: 0, v: 0 }; }

    var max = Math.max(rgb.r, rgb.g, rgb.b),
        min = Math.min(rgb.r, rgb.g, rgb.b),
        d = max - min,
        h = 0,
        s = (max === 0 ? 0 : d / max),
        v = max / 255;

    switch (max) {
        case min: h = 0; break;
        case rgb.r: h = (rgb.g - rgb.b) + d * (rgb.g < rgb.b ? 6 : 0); h /= 6 * d; break;
        case rgb.g: h = (rgb.b - rgb.r) + d * 2; h /= 6 * d; break;
        case rgb.b: h = (rgb.r - rgb.g) + d * 4; h /= 6 * d; break;
    }

    return {
        h: h,
        s: s,
        v: v
    };
}





/// NEW
/*! based on phoscon-app 2021-08-19 */

export function rgbToXy(rgb: HomieRGBColor | null | undefined): HomieXYBriColor {
    if (!rgb) { return { x: 0, y: 0 }; }

    const X = .412453 * rgb.r + .35758 * rgb.g + .180423 * rgb.b;
    const Y = .212671 * rgb.r + .71516 * rgb.g + .072169 * rgb.b;
    const Z = .019334 * rgb.r + .119193 * rgb.g + .950227 * rgb.b;
    return {
        x: X / (X + Y + Z),
        y: Y / (X + Y + Z)
    };
}

export function toLinearRgbChannel(rgbChannel: number): number {
    return rgbChannel > .04045 ? Math.pow((rgbChannel + .055) / 1.055, 2.4) : rgbChannel / 12.92;
}

export function rgbToRgbL(rgb: HomieRGBColor | null | undefined): HomieRGBColor {
    if (!rgb) { return { r: 0, g: 0, b: 0 }; }
    return {
        r: toLinearRgbChannel(rgb.r),
        g: toLinearRgbChannel(rgb.g),
        b: toLinearRgbChannel(rgb.b)
    }
}


export function rgbToXy2(rgb: HomieRGBColor | null | undefined): HomieXYBriColor {

    const rgbL = rgbToRgbL(rgb);

    const X = .649926 * rgbL.r + .103455 * rgbL.g + .197109 * rgbL.b;
    const Y = .234327 * rgbL.r + .743075 * rgbL.g + .022598 * rgbL.b;
    const Z = 0 * rgbL.r + .053077 * rgbL.g + 1.035763 * rgbL.b;

    return {
        x: X / (X + Y + Z),
        y: Y / (X + Y + Z)
    }

}


export function hsvToRgb(hsv: HomieHSVColor | null | undefined): HomieRGBColor {
    if (!hsv) { return { r: 0, g: 0, b: 0 }; }

    var r: number = 0, g: number = 0, b: number = 0;
    const i = Math.floor(hsv.h * 6);
    const f = hsv.h * 6 - i;
    const p = hsv.v * (1 - hsv.s);
    const q = hsv.v * (1 - f * hsv.s);
    const t = hsv.v * (1 - (1 - f) * hsv.s);
    switch (i % 6) {
        case 0: r = hsv.v, g = t, b = p; break;
        case 1: r = q, g = hsv.v, b = p; break;
        case 2: r = p, g = hsv.v, b = t; break;
        case 3: r = p, g = q, b = hsv.v; break;
        case 4: r = t, g = p, b = hsv.v; break;
        case 5: r = hsv.v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}

export function hueToHex(hue: number) {
    var rgb: HomieRGBColor = { r: 0, g: 0, b: 0 }
        , h = hue
        , t1 = 255
        , t3 = h % 60 * 255 / 60;

    360 == h && (h = 0),
        h < 60 ? (rgb.r = t1, rgb.b = 0, rgb.g = 0 + t3) :
            h < 120 ? (rgb.g = t1, rgb.b = 0, rgb.r = t1 - t3) :
                h < 180 ? (rgb.g = t1, rgb.r = 0, rgb.b = 0 + t3) :
                    h < 240 ? (rgb.b = t1, rgb.r = 0, rgb.g = t1 - t3) :
                        h < 300 ? (rgb.b = t1, rgb.g = 0, rgb.r = 0 + t3) :
                            h < 360 ? (rgb.r = t1, rgb.g = 0, rgb.b = t1 - t3) :
                                (rgb.r = 0, rgb.g = 0, rgb.b = 0);
    return rgbColorToHex(rgb);
}

export function mapHueTo360(hue: number) {
    return Math.floor(360 / 65535 * hue)
}

export function mapHueFrom360(hue: number) {
    return Math.floor(hue / 360 * 65535)
}

export function xyToHs(xy: HomieXYBriColor): HomieHSVColor {
    const x = xy.x
    const y = xy.y
    const X = 0 === y ? 0 : 1 / y * x
    const Z = 0 === y ? 0 : 1 / y * (1 - x - y);

    let r = 3.2406 * X - 1.5372 - .4986 * Z
    let g = .9689 * -X + 1.8758 + .0415 * Z
    let b = .0557 * X - .204 + 1.057 * Z;

    r > b && r > g && r > 1 ? (g /= r, b /= r, r = 1) :
        g > b && g > r && g > 1 ? (r /= g, b /= g, g = 1) :
            b > r && b > g && b > 1 && (r /= b, g /= b, b = 1),
        r = r <= .0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - .055,
        g = g <= .0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - .055,
        b = b <= .0031308 ? 12.92 * b : 1.055 * Math.pow(b, 1 / 2.4) - .055,
        r < 0 && (r = 0),
        g < 0 && (g = 0),
        b < 0 && (b = 0);
    const hsv = rgb2hsv(255 * r, 255 * g, 255 * b);
    return {
        h: hsv[0],
        s: Math.round(100 * hsv[1]),
        v: xy.bri ? xy.bri : Math.round(100 * hsv[2])
    }
}

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
    // r = parseInt(("" + r).replace(/\s/g, ""), 10),
    //     g = parseInt(("" + g).replace(/\s/g, ""), 10),
    //     b = parseInt(("" + b).replace(/\s/g, ""), 10);
    if (!(null == r || null == g || null == b || isNaN(r) || isNaN(g) || isNaN(b) || r < 0 || g < 0 || b < 0 || r > 255 || g > 255 || b > 255)) {
        r /= 255,
            g /= 255,
            b /= 255;
        var minRGB = Math.min(r, Math.min(g, b))
            , maxRGB = Math.max(r, Math.max(g, b));
        return minRGB == maxRGB ? [0, 0, minRGB] : [60 * ((r == minRGB ? 3 : b == minRGB ? 1 : 5) - (r == minRGB ? g - b : b == minRGB ? r - g : b - r) / (maxRGB - minRGB)), (maxRGB - minRGB) / maxRGB, maxRGB]
    }
    return [0, 0, 0];
}

