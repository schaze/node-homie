
import { HomieValuesTypes, ValueMapping, ValueMappingDefintion, ValueMappingList } from "../model";
import { evaluateValueCondition } from "./conditionals.func";

export function mapValue<FROM = HomieValuesTypes, TO = HomieValuesTypes>(value: FROM, mapping: ValueMapping<FROM, TO>): TO | undefined {
    if (mapping.from === undefined) { return mapping.to; }
    if (evaluateValueCondition(value, mapping.from)) {
        return mapping.to;
    }
    return undefined;
}

export function mapValueList<FROM = HomieValuesTypes, TO = HomieValuesTypes>(value: FROM, mappingList: ValueMappingList<FROM, TO>): TO | undefined {
    for (let index = 0; index < mappingList.length; index++) {
        const mapping = mappingList[index];
        const to = mapValue(value, mapping);
        if (to !== undefined){
            return to;
        }
    }
    return undefined;
}

export function mapValueIn<inFROM = HomieValuesTypes, inTO = HomieValuesTypes, outFROM = HomieValuesTypes, outTO = HomieValuesTypes>(value: inFROM, mappingSet?: ValueMappingDefintion<inFROM, inTO, outFROM, outTO>): inTO | inFROM | undefined {
    return mappingSet !== undefined ? mapValueList(value, mappingSet.in) : value;
}

export function mapValueOut<inFROM = HomieValuesTypes, inTO = HomieValuesTypes, outFROM = HomieValuesTypes, outTO = HomieValuesTypes>(value: outFROM, mappingSet?: ValueMappingDefintion<inFROM, inTO, outFROM, outTO>): outTO | outFROM | undefined {
    return mappingSet !== undefined ? mapValueList(value, mappingSet.out) : value;
}