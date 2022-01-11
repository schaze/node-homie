/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */

import { HomieID } from "./Base.model";

export interface MetaCondition {
    key: string | string[];
    value?: string | string[];
}

export function instanceOfMetaCondition(object: any): object is MetaCondition {
    return typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, 'key');
}


export type ConditionOperators = '='  | '>' | '<' | '>=' | '<=' | '<>' | 'includes' | 'includesAny' | 'includesAll' | 'includesNone' | 'matchAlways';
// source: string --> selector.value: string -- =
// source: string[] --> select.value: string -- includes
// source: string[] --> selector.value: string[] --- includesAny | includesAll


export interface ValueOperatorCondition<T, K> {
    operator: ConditionOperators;
    value?: T | T[] | K;
}

export function instanceOfConditionSelector<T, K>(object: any): object is ValueOperatorCondition<T, K> {
    return typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, 'operator') && Object.prototype.hasOwnProperty.call(object, 'value');
}

export type ValueCondition<T, K = T> = T | T[] | ValueOperatorCondition<T, K>;

export interface BaseItemCondition {
    id?: ValueCondition<HomieID>;
    name?: ValueCondition<string>;
    tags?: ValueCondition<string>
    meta?: MetaCondition;
}

export interface DeviceCondition extends BaseItemCondition {
    homie?: ValueCondition<string>;
    state?: ValueCondition<string>;
    extensions?: ValueCondition<string>;
    implementation?: ValueCondition<string>;
}

export interface NodeCondition extends BaseItemCondition {
    type?: ValueCondition<string>;
}

export interface PropertyCondition extends BaseItemCondition {
    datatype?: ValueCondition<string>;
    settable?: ValueCondition<boolean>;
    retained?: ValueCondition<boolean>;
    format?: ValueCondition<string>;
    unit?: ValueCondition<string>;
}

export interface Query {
    device?: DeviceQuery;
    node?: NodeQuery;
    property?: PropertyQuery;
}

export type DeviceQuery = '*' | HomieID | DeviceCondition | undefined | null;
export type NodeQuery = '*' | HomieID | NodeCondition  | undefined | null;
export type PropertyQuery = '*' | HomieID | PropertyCondition  | undefined | null;
