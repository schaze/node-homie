export * from './Logger';
export * from './Lifecycle';
export * from './DictionaryStore';

export async function asyncTimeout(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}