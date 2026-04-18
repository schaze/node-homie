
export function mqttTopicMatch(filter: string, topic: string | string[]): boolean {
    if (filter === topic) { return true; } // quick return for non-wildcard filder topics

    const filterArray = filter.split('/');
    const length = filterArray.length;
    const topicArray = Array.isArray(topic) ? topic : topic.split('/');

    for (var i = 0; i < length; ++i) {
        var left = filterArray[i];
        var right = topicArray[i];
        if (left === '#') { return true; }
        if (left !== '+' && left !== right) { return false; }
    }

    return length === topicArray.length;
}

export function isMqttWildcardTopic(topic: string): boolean{
    return topic.includes('+') || topic.includes('#');
}