/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */

import { MetaAttributes } from "./Meta.model";

export const HOMIE_TYPE_INT = 'integer';
export const HOMIE_TYPE_FLOAT = 'float';
export const HOMIE_TYPE_BOOL = 'boolean';
export const HOMIE_TYPE_STRING = 'string';
export const HOMIE_TYPE_ENUM = 'enum';
export const HOMIE_TYPE_COLOR = 'color';
export const HOMIE_TYPE_DATETIME = 'datetime';
export const HOMIE_TYPE_DURATION = 'duration';


export const HOMIE_DATATYPES = [
    HOMIE_TYPE_INT,
    HOMIE_TYPE_FLOAT,
    HOMIE_TYPE_BOOL,
    HOMIE_TYPE_STRING,
    HOMIE_TYPE_ENUM,
    HOMIE_TYPE_COLOR,
    HOMIE_TYPE_DATETIME,
    HOMIE_TYPE_DURATION
] as const


export type HomieDatatype = typeof HOMIE_DATATYPES[number];


export type HomieValuesTypes = string | number | boolean | Date | undefined | null;



export type HomieAttributeValues = string | number | boolean | MetaAttributes | undefined | null;

export interface PublishMessage {
    topic: string;
    payload: string;
}

export const HOMIE_EXT_META_4 = 'eu.epnw.meta:1.1.0:4.0';

export enum HomieDeviceMode {
    Device,
    Controller
}

/** @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)$ */
export type HomieID = string;
export const HomieIDRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isHomieID(id: any): id is HomieID {
    return id !== undefined && id !== null && typeof id === 'string' && id.length > 0 && !!id.match(HomieIDRegex);
}


export interface BaseAtrributes {
    id: HomieID;
}

export interface BaseItemAtrributes extends BaseAtrributes {
    name?: string;
    tags?: string[];
    meta?: MetaAttributes;
}

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

export type TypeNullOrUndef<T> = T | null | undefined;

export type TypeOrNull<T> = T | null;


/**
 * Recommended units for HOMIE (+some extra for good measure)
 */

export const HOMIE_UNIT_DEGREE_CELCIUS = '°C';
export const HOMIE_UNIT_DEGREE_FAHRENHEIT = '°F';
export const HOMIE_UNIT_DEGREE = '°';
export const HOMIE_UNIT_LITER = 'L';
export const HOMIE_UNIT_GALLON = 'gal';
export const HOMIE_UNIT_VOLT = 'V';
export const HOMIE_UNIT_WATT = 'W';
export const HOMIE_UNIT_KILOWATT= 'kW';
export const HOMIE_UNIT_KILOWATTHOUR = 'kWh';
export const HOMIE_UNIT_AMPERE = 'A';
export const HOMIE_UNIT_HERTZ = 'Hz';
export const HOMIE_UNIT_MILI_AMPERE = 'mA';
export const HOMIE_UNIT_PERCENT = '%';
export const HOMIE_UNIT_METER = 'm';
export const HOMIE_UNIT_CUBIC_METER = 'm³';
export const HOMIE_UNIT_FEET = 'ft';
export const HOMIE_UNIT_PASCAL = 'Pa';
export const HOMIE_UNIT_PSI = 'psi';
export const HOMIE_UNIT_SECONDS = 's';
export const HOMIE_UNIT_MINUTES = 'min';
export const HOMIE_UNIT_HOURS = 'h';
export const HOMIE_UNIT_LUX = 'lx';
export const HOMIE_UNIT_KELVIN = 'K';
export const HOMIE_UNIT_MIRED = 'MK⁻¹';
export const HOMIE_UNIT_COUNT_AMOUNT = '#';
