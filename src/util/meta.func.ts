import { MetaAttributes, MetaKeyAttributes, MetaSubkeyAttributes } from "../model/Meta.model";

export function getMetaByKey<T extends MetaKeyAttributes | MetaSubkeyAttributes>(path: string[], meta: MetaAttributes): T | null{
    if (!meta || !path || path.length === 0) { return null; }
    for (let index = 0; index < meta.length; index++) {
        const mainKey = meta[index];
        if (mainKey.key === path[0]){
            if (path.length === 1){
                return mainKey as T;
            }
            for (let subIndex = 0; subIndex < (mainKey.subkeys ? mainKey.subkeys.length : 0); subIndex++) {
                const subKey = mainKey.subkeys![subIndex];
                if (subKey.key === path[1]){
                    return subKey as T;
                }
            }
        }
    }
    return null;
}