import { BaseItemAtrributes } from "./Base.model";

export type DeviceState = 'init' | 'ready' | 'disconnected' | 'sleeping' | 'lost' | 'alert';

export interface HomieDeviceAtrributes extends BaseItemAtrributes {
    homie?: string;
    state?: DeviceState;
    nodes?: string;
    extensions?: string;
    implementation?: string;
}