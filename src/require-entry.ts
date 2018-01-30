
import * as langdetect from "./langdetect";

declare global {
    function define(name: string, deps: Array<string>, factory: () => any): void;
}

define("langdetect", [], () => {
    return langdetect;
});