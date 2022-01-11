// this existis so no direct mqtt dependancy is made when only importing node-homie models or functions

// provide our own version of some rudimentary mqtt.js types to not have any dependencies in the model.
export  type QoS = 0 | 1 | 2
export declare type UserProperties = {[index: string]: string | string[]}


export interface MQTTConnectOpts {
    url: string;
    username?: string;
    password?: string;
    topicRoot?: string;

    reconnectPeriod?: number;

    will?: {
        /**
         * the topic to publish
         */
        topic: string
        /**
         * the message to publish
         */
        payload: Buffer | string
        /**
         * the QoS
         */
        qos: QoS
        /**
         * the retain flag
         */
        retain: boolean,
        /*
        *  properies object of will
        * */
        properties?: {
            willDelayInterval?: number,
            payloadFormatIndicator?: boolean,
            messageExpiryInterval?: number,
            contentType?: string,
            responseTopic?: string,
            correlationData?: Buffer,
            userProperties?: UserProperties
        }
    }
}
