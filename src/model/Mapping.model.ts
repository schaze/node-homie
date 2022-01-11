import { HomieValuesTypes } from "./Base.model";
import { ValueCondition } from "./Query.model";

export interface ValueMapping<FROM = HomieValuesTypes, TO = HomieValuesTypes> {
    from?: ValueCondition<FROM>;
    to?: TO;
}
export type ValueMappingList<FROM = HomieValuesTypes, TO = HomieValuesTypes> = ValueMapping<FROM, TO>[];

export interface ValueMappingDefintion<inFROM = HomieValuesTypes, inTO = HomieValuesTypes, outFROM = HomieValuesTypes, outTO = HomieValuesTypes> {
    in: ValueMappingList<inFROM, inTO>;
    out: ValueMappingList<outFROM, outTO>;
}

