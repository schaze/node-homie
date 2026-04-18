/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */

import { DeviceAttributes, NodeAttributes, PropertyAttributes } from "./Base.model";
import { Primitive } from "./RXObject.model";

export const ConditionOperators = ['='  , '>' , '<' , '>=' , '<=' , '<>' , 'includes' , 'includesAny' , 'includesAll' , 'includesNone' , 'matchAlways'] as const;

export type ConditionOperator = typeof ConditionOperators[number];

export interface ValueOperatorCondition<T> {
    operator: ConditionOperator;
    value?: T | T[];
}

export function isValueOperatorCondition<T, K>(object: any): object is ValueOperatorCondition<T> {
    return typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, 'operator') &&  ConditionOperators.includes(object['operator']) ;
}

export type ValueCondition<T> = T | T[] | ValueOperatorCondition<T>;

export type BaseRXObjectCondition<T> = {
    [P in keyof T]?: ValueCondition<T[P]>;
};


export type RXObjectQuery<T> = Primitive | BaseRXObjectCondition<T> | undefined | null;

export interface Query {
    device?: DeviceQuery;
    node?: NodeQuery;
    property?: PropertyQuery;
}

export type DeviceQuery = RXObjectQuery<DeviceAttributes>;
export type NodeQuery = RXObjectQuery<NodeAttributes>;
export type PropertyQuery = RXObjectQuery<PropertyAttributes>;
