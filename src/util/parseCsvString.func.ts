export function parseCSVString(value: string): string[] {
    if (value === null || value === undefined || value.length === 0) {
        return [];
    }
    return value.trim().split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
}