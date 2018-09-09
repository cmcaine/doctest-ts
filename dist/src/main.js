#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chokidar = require("chokidar");
const minimist = require("minimist");
const internal_1 = require("./internal");
function main() {
    const outputs = Object.keys(internal_1.showScriptInstances);
    const flags = outputs.map(f => '--' + f);
    const boolean = ['watch'].concat(outputs);
    const opts = minimist(process.argv.slice(2), { boolean });
    let output = null;
    let error = null;
    outputs.forEach(k => {
        if (opts[k]) {
            if (output != null) {
                error = `Cannot output both ${output} and ${k}`;
            }
            output = k;
        }
    });
    if (output == null) {
        error = `Choose an output from ${flags.join(' ')}`;
    }
    const files = opts._;
    if (files.length == 0 || output == null) {
        console.error(`
      Error: ${error || `No files specified!`}

      Usage:

        ${flags.join('|')} [-w|--watch] files globs...

    Your options were:`, opts, `
    From:`, process.argv);
        return;
    }
    const d = internal_1.showScriptInstances[output];
    files.forEach(file => internal_1.instrument(d, file));
    if (opts.w == true || opts.watch == true) {
        const watcher = chokidar.watch(files, { ignored: '*.doctest.*' });
        watcher.on('change', file => global.setTimeout(() => internal_1.instrument(d, file, 'watch'), 25));
    }
}
main();
//# sourceMappingURL=main.js.map