
import * as langdetect from "./langdetect";

declare global {
    function define(deps: Array<string>, factory: () => any): void;
}

define([], () => {
    return langdetect;
});