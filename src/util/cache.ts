class Cache{
    private static _instance?: Cache;

    private constructor(){
        if(Cache._instance)
            throw new Error("cache already created")
        Cache._instance = this;
    }

    static instance = () => {
        return Cache._instance ?? (Cache._instance = new Cache);
    }

    fetch = (key: string) => {
        return localStorage.getItem(key);
    }

    insert = (key: string, value: string) => {
        localStorage.setItem(key, value);
    }

    delete = (key: string) => {
        localStorage.removeItem(key);
    }
}

const cache = Cache.instance()

export default cache