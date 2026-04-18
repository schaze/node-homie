import { BASE_HOMIE_VERSION, DEFAULT_TOPIC, notNullish } from "../model"

export function makeV5BaseTopic(rootTopic?: string): string {
    return `${notNullish(rootTopic) ? rootTopic : DEFAULT_TOPIC}/${BASE_HOMIE_VERSION}`;
}