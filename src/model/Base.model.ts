/** 
 * Important:
 * ---------------
 * Model files should not use external imports except for other model files.
 * Other model files should also be imported directly not via their module
 * this can otherwise cause issue with ts-to-json-schema conversions in certain scenarios
 * */

import { RXObjectAttributes, ToRXObjectAttributes } from "./RXObject.model";


export type ObjectMap<KEY extends string, VALUE> = {
    [id in KEY]: VALUE;
};


const zeroValue = Buffer.from([0]);
export const ZERO_STRING = zeroValue.toString()


/**
 * Default root topic for homie
 */
export const DEFAULT_TOPIC = 'homie';

export const BASE_HOMIE_VERSION = '5';

export const HOMIE_VERSION: HomieVersion = `${BASE_HOMIE_VERSION}.0`;

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type DevicePointer = string;
export const DevicePointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isDevicePointer(pointer: any): pointer is DevicePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(DevicePointerRegex);
}

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type NodePointer = string;
export const NodePointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isNodePointer(pointer: any): pointer is NodePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(NodePointerRegex);
}

/**
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$
 */
export type PropertyPointer = string;
export const PropertyPointerRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)\/(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isPropertyPointer(pointer: any): pointer is NodePointer {
    return pointer !== undefined && pointer !== null && typeof pointer === 'string' && !!pointer.match(PropertyPointerRegex);
}

export type HomieElementPointer = DevicePointer | NodePointer | PropertyPointer;

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
] as const;

// 
// The following should ideally be expressed as "export type HomieDatatype = typeof HOMIE_DATATYPES[number];",
// however JSON Schema generation is not working with this construct, therefore the complicated verbose definition below.
export type HomieDatatype = typeof HOMIE_TYPE_INT | typeof HOMIE_TYPE_FLOAT | typeof HOMIE_TYPE_BOOL | typeof HOMIE_TYPE_STRING | typeof HOMIE_TYPE_ENUM | typeof HOMIE_TYPE_COLOR | typeof HOMIE_TYPE_DATETIME | typeof HOMIE_TYPE_DURATION;


export type HomieValuesTypes = string | number | boolean | Date | undefined | null;

export interface PublishMessage {
    topic: string;
    payload: string;
}


export enum HomieDeviceMode {
    Device,
    Controller
}

/** 
 *  @title HomieID
 *  
 *  @description
 *  A MQTT topic consists of one or more topic levels, separated by the slash character (/). A topic level ID MAY ONLY contain lowercase letters from a to z, numbers from 0 to 9 as well as the hyphen character (-).
 *  A topic level ID MUST NOT start or end with a hyphen (-). The special character $ is used and reserved for Homie attributes.
 * @pattern ^(?!\\-)[a-z0-9\\-]+(?<!\\-)$ 
*/
export type HomieID = string;
export const HomieIDRegex = "^(?!\\-)[a-z0-9\\-]+(?<!\\-)$";
export function isHomieID(id: any): id is HomieID {
    return id !== undefined && id !== null && typeof id === 'string' && id.length > 0 && !!id.match(HomieIDRegex);
}


/**
 * @title HomieVersion
 * @description
 * The implemented Homie convention version, without the "patch" level. So the format is "5.x", where the 'x' is the minor version.
 * @pattern ^5.([0-9]+)$
 */
export type HomieVersion = string;
export const HomieVersionRegex = "^5.([0-9]+)$";
export function isHomieVersion(input: any): input is HomieVersion {
    return input !== undefined && input !== null && typeof input === 'string' && input.length > 0 && !!input.match(HomieVersionRegex);
}


export interface IDAttributeImpl {
    /** @description ID of element*/
    id: HomieID;
}

export type IDAttribute = ToRXObjectAttributes<IDAttributeImpl>;
export interface BaseAttributesImpl {
    /** @description Friendly name  */
    name?: string,
}

// export interface BaseAttributes extends IDAttributeImpl {
//     /** @description Friendly name  */
//     name?: string,
// }

export type BaseAttributes = ToRXObjectAttributes<BaseAttributesImpl & IDAttributeImpl>;


export const HOMIE_DEVICE_STATE_INIT = 'init';
export const HOMIE_DEVICE_STATE_READY = 'ready';
export const HOMIE_DEVICE_STATE_DISCONNECTED = 'disconnected';
export const HOMIE_DEVICE_STATE_SLEEPING = 'sleeping';
export const HOMIE_DEVICE_STATE_LOST = 'lost';
export const HOMIE_DEVICE_STATE_ALERT = 'alert';


export const HOMIE_DEVICE_STATES = [
    HOMIE_DEVICE_STATE_INIT,
    HOMIE_DEVICE_STATE_READY,
    HOMIE_DEVICE_STATE_DISCONNECTED,
    HOMIE_DEVICE_STATE_SLEEPING,
    HOMIE_DEVICE_STATE_LOST,
    HOMIE_DEVICE_STATE_ALERT,
];



/** 
 * @title DeviceState 
 * @description
 * Represenjson the current state of the device. Important: for child devices also the root-device state should be taken into account.
 * There are 6 different states:
 *  - `init`: this is the state the device is in when it is connected to the MQTT broker, but has not yet sent all Homie messages and is not yet ready to operate. This state is optional, and may be sent if the device takes a long time to initialize, but wishes to announce to consumers that it is coming online. A device may fall back into this state to do some reconfiguration.
 *  - `ready`: this is the state the device is in when it is connected to the MQTT broker and has sent all Homie messages for describing the device attributes, nodes, properties and their values. The device has subscribed to all appropriate /set topics and is ready to receive messages.
 *  - `disconnected`: this is the state the device is in when it is cleanly disconnected from the MQTT broker. You must send this message before cleanly disconnecting.
 *  - `sleeping`: this is the state the device is in when the device is sleeping. You have to send this message before sleeping.
 *  - `lost`: this is the state the device is in when the device has been "badly" disconnected. Important: If a root-device $state is "lost" then the state of every child device in ijson tree is also "lost". You must define this message as last will (LWT) for root devices.
 *  - `alert`: this is the state the device is when connected to the MQTT broker, but something wrong is happening. E.g. a sensor is not providing data and needs human intervention. You have to send this message when something is wrong.
*/
export type DeviceState =
    typeof HOMIE_DEVICE_STATE_INIT |
    typeof HOMIE_DEVICE_STATE_READY |
    typeof HOMIE_DEVICE_STATE_DISCONNECTED |
    typeof HOMIE_DEVICE_STATE_SLEEPING |
    typeof HOMIE_DEVICE_STATE_LOST |
    typeof HOMIE_DEVICE_STATE_ALERT;

export function isDeviceState(input: any): input is DeviceState {
    return input !== undefined && input !== null && typeof input === 'string' && input.length > 0 && HOMIE_DEVICE_STATES.includes(input);
}


export interface PropertyAttributesImpl extends BaseAttributesImpl {
    /** @description The data type. Any of the following values: "integer", "float", "boolean", "string", "enum", "color", "datetime", "duration". */
    datatype: HomieDatatype;
    /** @description Specifies restrictions or options for the given data type. */
    format?: string;
    /**
     * @description Specifies if the property value can be set (true) or if it is read-only(false).
     * @default false
     */
    settable?: boolean;
    /**
     * @description Whether the Property is retained.
     * @default true
     */
    retained?: boolean;
    /**
     * @description Unit of this property. See @see Base.model.ts HOMIE_UNIT_* consts.
     */
    unit?: string;
}

/** 
 * @title PropertyAttributes 
 * @description Data attributes of property
 * @examples 
 * ```json 
 * { 
 *      "datatype": "integer",
 *      "name": "First Property",
 *      "format": "1:8",
 *      "settable": true,
 *      "retained": true,
 *      "unit": "#"
 * }
 * ```
 * */
export type PropertyAttributes = ToRXObjectAttributes<PropertyAttributesImpl & IDAttributeImpl>;


export interface HomiePropertyOptions {
    readValueFromMqtt: boolean;
    readTimeout?: number;
}


export interface NodeAttributesImpl extends BaseAttributesImpl {
    type?: string;
}

/** 
 * @title NodeAttributes 
 * @description Data attributes of node
 * @examples 
 * ```json 
 * { 
 *      "name": "First Node",
 * ```
 * */
export type NodeAttributes = ToRXObjectAttributes<NodeAttributesImpl & IDAttributeImpl>;
// export interface NodeAttributes extends NodeAttributesImpl {
//     id: HomieID
// }


export interface DeviceDescriptionBase extends BaseAttributesImpl {
    /** version of the devicedescription */
    version: number;

    /** Homie version of the device */
    homie: HomieVersion;


    /**
     * @description  Array of IDs of child devices
     */
    children?: HomieID[],
    /**
     * @description  ID of the root parent device. Required if the device is not the root device, must be omitted otherwise.
     */
    root?: HomieID,
    /**
     * @description  ID of the parent device. Defaults to the root ID. Required if the parent is NOT the root device.
     */
    parent?: HomieID,
    /**
     * @title Array of supported extensions.
     */
    extensions?: string[],
}

export interface DeviceAttributesImpl extends DeviceDescriptionBase {
    /** @description: State of the device */
    state: DeviceState;
}

/** 
 * @title DeviceAttributes 
 * @name DeviceAttributes
 * @alias DeviceAttributes
 * @description Data attributes of node
 * @examples 
 * ```json
 * {
 *   "name": "device name",
 *   "root": "id of root device",
 *   "parent": "id of parent device", 
 *   "children": ["ids of child devices", "ids of child devices"],
 *   "extensions": ["extention-identifier", "extention-identifier2"],
 * ```
 * */
export type DeviceAttributes = ToRXObjectAttributes<DeviceAttributesImpl & IDAttributeImpl>;

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
export const HOMIE_UNIT_KILOWATT = 'kW';
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
