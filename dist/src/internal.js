"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) if (e.indexOf(p[i]) < 0)
            t[p[i]] = s[p[i]];
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts = require("typescript");
const fs = require("fs");
const path = require("path");
////////////////////////////////////////////////////////////
// Extracting docstrings from program
function Comments(s) {
    const out = [];
    function add_comment(c, context) { }
    function traverse(node) {
        const jsdocs = node.jsDoc || [];
        if (jsdocs.length > 0) {
            let context = null;
            try {
                context = node.name.escapedText || null;
            }
            catch (e) {
                try {
                    const decls = node.declarationList.declarations;
                    if (decls.length == 1) {
                        context = decls[0].name.escapedText || null;
                    }
                }
                catch (e) {
                    // console.dir(node)
                    context = ts.isConstructorDeclaration(node) ? 'constructor' : null;
                }
            }
            jsdocs.forEach((doc) => {
                out.push({ comment: doc.comment || '', context });
            });
        }
        ts.forEachChild(node, traverse);
    }
    const ast = ts.createSourceFile('_.ts', s, ts.ScriptTarget.Latest);
    traverse(ast);
    return out;
}
exports.Comments = Comments;
////////////////////////////////////////////////////////////
// Extracting test scripts from docstrings
/**

  is_doctest('// => true') // => true
  is_doctest('// true') // => false

*/
const is_doctest = (s) => s.match(/\/\/[ \t]*=>/) != null;
/**

  const m = doctest_rhs('// => true') || []
  m[1] // => ' true'

*/
const doctest_rhs = (s) => s.match(/^\s*\/\/[ \t]*=>([^\n]*)/m);
/**

  extractScript('s') // => [{tag: 'Statement', stmt: 's;'}]

  extractScript('foo(\'"bar\'') // => [{tag: 'Statement', stmt: 'foo("\\"bar");'}]

  extractScript('e // => 1') // => [{tag: '==', lhs: 'e', rhs: '1'}]

  extractScript('s; e // => 1') // => [{tag: 'Statement', stmt: 's;'}, {tag: '==', lhs: 'e', rhs: '1'}]

*/
function extractScript(s) {
    const pwoc = ts.createPrinter({ removeComments: true });
    const ast = ts.createSourceFile('_.ts', s, ts.ScriptTarget.Latest);
    return ast.statements.map((stmt, i) => {
        if (ts.isExpressionStatement(stmt)) {
            const next = ast.statements[i + 1]; // zip with next
            const [a, z] = next ? [next.pos, next.end] : [stmt.end, ast.end];
            const after = ast.text.slice(a, z);
            const m = doctest_rhs(after);
            if (m && m[1]) {
                const lhs = pwoc.printNode(ts.EmitHint.Expression, stmt.expression, ast);
                const rhs = m[1].trim();
                return { tag: '==', lhs, rhs };
            }
        }
        return { tag: 'Statement', stmt: pwoc.printNode(ts.EmitHint.Unspecified, stmt, ast) };
    });
}
exports.extractScript = extractScript;
function extractScripts(docstring) {
    const out = [];
    docstring.split(/\n\n+/m).forEach(s => {
        if (is_doctest(s)) {
            out.push(extractScript(s));
        }
    });
    return out;
}
exports.extractScripts = extractScripts;
/** show("hello") // => '"hello"' */
function show(s) {
    return JSON.stringify(s);
}
exports.show = show;
function showContext(c) {
    return show(c || 'doctest');
}
exports.showContext = showContext;
function tapeOrAVA(script, c, before_end = (t) => '') {
    const t = `t`;
    const body = script
        .map(s => {
        if (s.tag == 'Statement') {
            return s.stmt;
        }
        else {
            return `${t}.deepEqual(${s.lhs}, ${s.rhs}, ${show(s.rhs)})`;
        }
    })
        .map(x => '\n      ' + x)
        .join('');
    return `
    __test(${showContext(c)}, ${t} => {
      ${body}
      ${before_end(t)}
    })`;
}
const mochaOrJest = (deepEqual) => (script, c) => {
    const body = script
        .map(s => {
        if (s.tag == 'Statement') {
            return s.stmt;
        }
        else {
            return `it('${s.lhs}', () => __expect(${s.lhs}).${deepEqual}(${s.rhs}))`;
        }
    })
        .map(x => '\n        ' + x)
        .join('');
    return `
    describe(${showContext(c)}, () => {${body}
    })
  `;
};
exports.showScriptInstances = {
    ava: {
        showImports: 'import {test as __test} from "ava"',
        showScript: tapeOrAVA,
    },
    tape: {
        showImports: 'import * as __test from "tape"',
        showScript: (s, c) => tapeOrAVA(s, c, t => `\n;${t}.end()`),
    },
    mocha: {
        showImports: 'import "mocha"\nimport {expect as __expect} from "chai"',
        showScript: mochaOrJest(`to.deep.equal`),
    },
    jest: {
        showImports: 'import "jest"\nconst __expect: jest.Expect = expect',
        showScript: mochaOrJest(`toEqual`),
    },
};
function instrument(d, file, mode) {
    const _a = path.parse(file), { base, ext } = _a, u = __rest(_a, ["base", "ext"]);
    if (base.includes('doctest')) {
        return;
    }
    const buffer = fs.readFileSync(file, { encoding: 'utf8' });
    const tests = Doctests(d, buffer);
    const outfile = path.format(Object.assign({}, u, { ext: '.doctest' + ext }));
    if (tests.length == 0) {
        console.error('No doctests found in', file);
    }
    else {
        console.error('Writing', outfile);
        if (mode == 'watch') {
            console.log(outfile);
        }
        fs.writeFileSync(outfile, buffer + '\n' + d.showImports + '\n' + tests.join('\n'));
    }
}
exports.instrument = instrument;
function Doctests(d, buffer) {
    const out = [];
    for (const c of Comments(buffer)) {
        for (const script of extractScripts(c.comment)) {
            out.push(d.showScript(script, c.context));
        }
    }
    return out;
}
//# sourceMappingURL=internal.js.map