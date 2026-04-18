import { HomieDatatype } from "../model/Base.model";

/**
 * Validates a Homie property value string against its datatype and optional format.
 *
 * Follows the Homie v5 convention specification for all 9 datatypes.
 * Mirrors the validation logic from the Rust homie5 crate (HomieValue::validate / HomieValue::parse).
 */
export function validateHomieValue(value: string | undefined, datatype: HomieDatatype, format?: string): boolean {
    if (value === undefined) return false;

    switch (datatype) {
        case 'string':
            return true;
        case 'boolean':
            return value === 'true' || value === 'false';
        case 'integer':
            return validateInteger(value, format);
        case 'float':
            return validateFloat(value, format);
        case 'enum':
            return validateEnum(value, format);
        case 'color':
            return validateColor(value, format);
        case 'datetime':
            return validateDateTime(value);
        case 'duration':
            return validateDuration(value);
        case 'json':
            return validateJson(value);
        default:
            return true;
    }
}

// ---- Number range format parsing ----

interface NumberRange {
    min?: number;
    max?: number;
    step?: number;
}

/**
 * Parses a Homie format string for integer or float ranges: `[min]:[max][:step]`
 * Examples: "0:100", ":10", "2:6:2", "-20.5:120.0"
 * Mirrors Rust's IntegerRange::parse / FloatRange::parse.
 */
function parseRangeFormat(format: string, parseNum: (s: string) => number | undefined): NumberRange | null {
    const parts: string[] = [];
    let start = 0;

    for (let i = 0; i < format.length; i++) {
        if (format[i] === ':') {
            parts.push(format.substring(start, i));
            start = i + 1;
        }
    }
    parts.push(format.substring(start));

    if (parts.length > 3) return null;

    const result: NumberRange = {};

    for (let i = 0; i < parts.length; i++) {
        if (parts[i] !== '') {
            const num = parseNum(parts[i]);
            if (num === undefined) return null;
            if (i === 0) result.min = num;
            else if (i === 1) result.max = num;
            else if (i === 2) result.step = num;
        }
    }

    // Validate range consistency (matches Rust's validate_integer_range / validate_float_range)
    if (result.step !== undefined && result.step <= 0) return null;
    if (result.min !== undefined && result.max !== undefined && result.min > result.max) return null;
    if (result.min !== undefined && result.max !== undefined && result.step !== undefined) {
        if (result.step > result.max - result.min) return null;
    }

    return result;
}

/**
 * Validates a number against a range with optional step.
 * Step validation: value must sit exactly on a step boundary.
 * Rounding rule from Homie spec: floor(x + 0.5), base is min (preferred), then max, then value.
 */
function validateNumberInRange(value: number, range: NumberRange): boolean {
    if (range.step !== undefined && range.step > 0) {
        const base = range.min ?? range.max ?? value;
        const rounded = Math.floor((value - base) / range.step + 0.5) * range.step + base;
        // Check value is on step boundary (use epsilon for float precision)
        if (Math.abs(rounded - value) > 1e-9) return false;
        // Check rounded value in range
        if (range.min !== undefined && rounded < range.min - 1e-9) return false;
        if (range.max !== undefined && rounded > range.max + 1e-9) return false;
    } else {
        if (range.min !== undefined && value < range.min) return false;
        if (range.max !== undefined && value > range.max) return false;
    }
    return true;
}

// ---- Integer validation ----

const INTEGER_REGEX = /^-?\d+$/;

function validateInteger(value: string, format?: string): boolean {
    if (!INTEGER_REGEX.test(value)) return false;
    const num = parseInt(value, 10);
    if (!isFinite(num)) return false;

    if (format) {
        const range = parseRangeFormat(format, s => {
            if (!INTEGER_REGEX.test(s)) return undefined;
            const n = parseInt(s, 10);
            return isFinite(n) ? n : undefined;
        });
        if (range && (range.min !== undefined || range.max !== undefined || range.step !== undefined)) {
            return validateNumberInRange(num, range);
        }
    }
    return true;
}

// ---- Float validation ----

function validateFloat(value: string, format?: string): boolean {
    if (value === '') return false;
    const num = Number(value);
    if (isNaN(num) || !isFinite(num)) return false;

    if (format) {
        const range = parseRangeFormat(format, s => {
            if (s === '') return undefined;
            const n = Number(s);
            return (isNaN(n) || !isFinite(n)) ? undefined : n;
        });
        if (range && (range.min !== undefined || range.max !== undefined || range.step !== undefined)) {
            return validateNumberInRange(num, range);
        }
    }
    return true;
}

// ---- Enum validation ----

function validateEnum(value: string, format?: string): boolean {
    if (!format) return false; // enum format is required per spec
    const values = format.split(',');
    return values.includes(value);
}

// ---- Color validation ----

/**
 * Validates a Homie color value string.
 * Format: "rgb,R,G,B" | "hsv,H,S,V" | "xyz,X,Y"
 * Property format specifies allowed color types, e.g. "rgb", "rgb,hsv", "xyz".
 */
function validateColor(value: string, format?: string): boolean {
    if (!format) return false; // color format is required per spec

    const parts = value.split(',');
    const prefix = parts[0];

    switch (prefix) {
        case 'rgb': {
            if (parts.length !== 4) return false;
            const r = parseColorInt(parts[1]);
            const g = parseColorInt(parts[2]);
            const b = parseColorInt(parts[3]);
            if (r === undefined || g === undefined || b === undefined) return false;
            if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) return false;
            break;
        }
        case 'hsv': {
            if (parts.length !== 4) return false;
            const h = parseColorInt(parts[1]);
            const s = parseColorInt(parts[2]);
            const v = parseColorInt(parts[3]);
            if (h === undefined || s === undefined || v === undefined) return false;
            if (h < 0 || h > 360 || s < 0 || s > 100 || v < 0 || v > 100) return false;
            break;
        }
        case 'xyz': {
            if (parts.length !== 3) return false;
            const x = parseFloat(parts[1]);
            const y = parseFloat(parts[2]);
            if (isNaN(x) || isNaN(y)) return false;
            if (x < 0 || x > 1 || y < 0 || y > 1 || (x + y) > 1) return false;
            break;
        }
        default:
            return false;
    }

    // Check the color type is in the property's allowed formats
    const allowedFormats = format.split(',');
    return allowedFormats.includes(prefix);
}

function parseColorInt(s: string): number | undefined {
    if (!/^\d+$/.test(s)) return undefined;
    return parseInt(s, 10);
}

// ---- DateTime validation ----

function validateDateTime(value: string): boolean {
    if (!value) return false;
    const d = new Date(value);
    return !isNaN(d.getTime());
}

// ---- Duration validation ----

const DURATION_REGEX = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/;

/**
 * Validates ISO 8601 duration format: PTxHxMxS
 * Must have at least one component (rejects bare "PT").
 * Mirrors Rust's HomieValue::parse_duration.
 */
function validateDuration(value: string): boolean {
    if (!value) return false;
    const match = DURATION_REGEX.exec(value);
    if (!match) return false;
    // Must have at least one component (reject bare "PT")
    return match[1] !== undefined || match[2] !== undefined || match[3] !== undefined;
}

// ---- JSON validation ----

function validateJson(value: string): boolean {
    if (!value) return false;
    try {
        const parsed = JSON.parse(value);
        // Must be object or array per Homie spec, not a primitive
        return typeof parsed === 'object' && parsed !== null;
    } catch {
        return false;
    }
}
