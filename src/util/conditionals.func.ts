import { BaseItemCondition, instanceOfConditionSelector, instanceOfMetaCondition, MetaCondition, ValueCondition, MetaAttributes } from "../model";
import { getMetaByKey } from "./meta.func";

export function evaluateBaseItemCondition(obj: any, condition: string | BaseItemCondition): boolean {
    if (typeof condition === 'string') {
        if (condition === '*') { return true }
        return condition === obj.id;
    }
    for (const key in condition) {
        if (Object.prototype.hasOwnProperty.call(condition, key)) {
            const sel = condition[key as keyof BaseItemCondition];
            if (!evaluateValueCondition(obj[key], sel)) { return false; }
        }
    }
    return true;
}

export function includesAny<T>(toCheckArr: T[], checkWithArr: T[]): boolean {
    if (toCheckArr.length === 0) { return false; }
    for (let index = 0; index < checkWithArr.length; index++) {
        const element = checkWithArr[index];
        if (toCheckArr.includes(element)) { return true; }
    }
    return false;
}

export function includesAll<T>(toCheckArr: T[], checkWithArr: T[]): boolean {
    if (toCheckArr.length === 0) { return false; }
    for (let index = 0; index < checkWithArr.length; index++) {
        const element = checkWithArr[index];
        if (!toCheckArr.includes(element)) { return false; }
    }
    return true;
}

export function evaluateValueCondition<T, K = T>(value: T, condition: ValueCondition<T, K> | MetaCondition): boolean {

    if (instanceOfConditionSelector(condition)) {
        if (condition.operator === 'matchAlways') { return true; }

        if (value instanceof Array) {
            if (condition.value instanceof Array) {
                if (condition.operator === 'includesAny') {
                    return includesAny<T>(value, condition.value);
                } else if (condition.operator === 'includesAll') {
                    return includesAll<T>(value, condition.value);
                } else if (condition.operator === 'includesNone'){
                    return !includesAny<T>(value, condition.value);
                }
                // All other operators are not applicable
                return false;
            } else {
                if (condition.operator === 'includes') {
                    return value.includes(condition.value);
                }
                // All other operators are not applicable
                return false;
            }

        } else {
            if (condition.value instanceof Array) {
                if (condition.operator === '=') {
                    return condition.value.includes(value);
                }else if (condition.operator === '<>'){
                    return !condition.value.includes(value);
                }
                // All other operators are not applicable
            } else if (condition.value !== undefined) {
                switch (condition.operator) {
                    case '=':
                        return typeof condition.value === 'number' ? Number(value) === condition.value : value === condition.value
                    case '<':
                        return value < condition.value
                    case '<=':
                        return value <= condition.value
                    case '>':
                        return value > condition.value
                    case '>=':
                        return value >= condition.value
                    case '<>':
                        return !(typeof condition.value === 'number' ? Number(value) === condition.value : value === condition.value)
                    default:
                        return value === condition.value
                }
            }
            return false;
        }
    } else if (instanceOfMetaCondition(condition)) {
        // const [metakey, subkey, ..._] = condition.key instanceof Array ? condition.key : [condition.key, undefined];
        const meta = value as unknown as MetaAttributes;
        const metaItem = getMetaByKey(condition.key instanceof Array ? condition.key : [condition.key], meta);
        if (!metaItem) { return false; }
       
        if (!condition.value) { return true; }
        if (condition.value instanceof Array) {
            return metaItem.value ? condition.value.includes(metaItem.value) : false;
        }
        return condition.value === metaItem.value;

    } else if (condition instanceof Array) {
        if (value instanceof Array) {
            return includesAny<T>(value, condition);
        } else {
            return condition.includes(value);
        }
    } else {
        return value === condition;
    }



}