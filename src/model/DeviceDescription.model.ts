import { DeviceDescriptionBase, HomieID, NodeAttributesImpl, ObjectMap, PropertyAttributesImpl } from "./Base.model";

/** 
 * @title PropertyDescription 
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
export interface PropertyDescription extends PropertyAttributesImpl {

}

/** 
 * @title NodeDescription 
 * @description A device can expose multiple nodes. Nodes are independent or logically separable parjson of a device. For example, a car might expose a wheels node, an engine node and a lighjson node
 * @examples
 * ```json
 *  {
 *     "name": "node name",
 *     "properties": {
 *         "prop-id": {
 *             "name": "property name",
 *             "datatype": "boolean",
 *             "retained": true,
 *             "settable": true,
 *             "unit": "",
 *             "format": ""
 *         }
 *     }
 *  }
 * ```
 * 
*/
export interface NodeDescription extends NodeAttributesImpl {
    /** @title Object of Properties the Node exposes.  */
    properties?: ObjectMap<HomieID, PropertyDescription>;
}

/** 
 * @title DeviceDescription 
 * @description An instance of a physical piece of hardware is called a device. For example, a car, an Arduino/ESP8266 or a coffee machine.
 * @examples 
 * ```json
 * {
 *   "homie": "5.0",
 *   "version": 8,
 *   "name": "device name",
 *   "root": "id of root device",
 *   "parent": "id of parent device", 
 *   "children": ["ids of child devices", "ids of child devices"],
 *   "extensions": ["extention-identifier", "extention-identifier2"],
 *   "nodes": {
 *       "node-id": {
 *           "name": "node name",
 *           "properties": {
 *               "prop-id": {
 *                   "name": "property name",
 *                   "datatype": "boolean",
 *                   "retained": true,
 *                   "settable": true,
 *                   "unit": "",
 *                   "format": ""
 *               }
 *           }
 *       }
 *   }
 * ```
 * */
export interface DeviceDescription extends DeviceDescriptionBase {
    /** @title Object of nodes the device exposes. */
    nodes?: ObjectMap<HomieID, NodeDescription>;
}

export type HomieElementDescription = DeviceDescription | NodeDescription | PropertyDescription;