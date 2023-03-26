import { BaseRXObjectCondition, isValueOperatorCondition, isPrimitive, RXObjectQuery, ValueCondition } from "../model";

export function evaluateObjectCondition<T>(obj: any, condition: RXObjectQuery<T>, idAttr: string = 'id'): boolean {
    if (condition === null || condition === undefined) { return true; }
    if (isPrimitive(condition)) {
        if (Object.prototype.hasOwnProperty.call(obj, idAttr)) {
            return condition === obj[idAttr];
        }
        return false;
    }
    for (const key in condition) {
        if (Object.prototype.hasOwnProperty.call(condition, key)) {
            const sel = condition[key as keyof BaseRXObjectCondition<T>];
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

export function evaluateValueCondition<T>(value: T, condition: ValueCondition<T>): boolean {

    if (isValueOperatorCondition(condition)) {
        if (condition.operator === 'matchAlways') { return true; }

        if (value instanceof Array) {
            if (condition.value instanceof Array) {
                if (condition.operator === 'includesAny') {
                    return includesAny<T>(value, condition.value);
                } else if (condition.operator === 'includesAll') {
                    return includesAll<T>(value, condition.value);
                } else if (condition.operator === 'includesNone') {
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
                } else if (condition.operator === '<>') {
                    return !condition.value.includes(value);
                }
                // All other operators are not applicable
            } else if (condition.value !== undefined && condition.value !== null) {
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
                        return !(typeof condition.value === 'number' ? Number(value) !== condition.value : value !== condition.value)
                    default:
                        return value === condition.value
                }
            } else if (condition.value === undefined || condition.value === null) {
                switch (condition.operator) {
                    case '=':
                        return value === condition.value
                    case '<>':
                        return value !== condition.value
                    default:
                        return value === condition.value
                }
            }
            return false;
        }
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