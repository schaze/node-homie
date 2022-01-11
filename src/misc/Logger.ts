export const LogLevelName = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'];

export const LogLevels = {
    error: 0,
    warn: 1,
    info: 2,
    verbose: 3,
    debug: 4,
    silly: 5
}

export class SimpleLogger {

    static domain: string = '';
    static loglevel: number = LogLevels.info;

    static logOutput: (domain: string, type: string, name: string, logLevel: number, level: number, text: string, obj?: any) => void = (domain: string, type: string, name: string, logLevel: number, level: number, text: string, obj?: any) => {
        if (level <= logLevel) {
            if (obj) {
                console.log(`${(new Date()).toISOString()} ${LogLevelName[level < LogLevelName.length ? level : LogLevelName.length - 1]} [${domain}:${type}:${name}]: ${text}`, obj);
            } else {
                console.log(`${(new Date()).toISOString()} ${LogLevelName[level < LogLevelName.length ? level : LogLevelName.length - 1]} [${domain}:${type}:${name}]: ${text}`);
            }
        }
    }

    constructor(private type: string, private name: string, private domain: string = SimpleLogger.domain, public logLevel: number = SimpleLogger.loglevel) { }

    private log(level: number, text: string, obj?: any) {
        SimpleLogger.logOutput(this.domain, this.type, this.name, this.logLevel, level, text, obj);
    }

    public error(text: string, obj?: any) {
        this.log(LogLevels.error, text, obj);
    }
    public warn(text: string, obj?: any) {
        this.log(LogLevels.warn, text, obj);
    }
    public info(text: string, obj?: any) {
        this.log(LogLevels.info, text, obj);
    }
    public verbose(text: string, obj?: any) {
        this.log(LogLevels.verbose, text, obj);
    }
    public debug(text: string, obj?: any) {
        this.log(LogLevels.debug, text, obj);
    }
    public silly(text: string, obj?: any) {
        this.log(LogLevels.silly, text, obj);
    }
}