import {readFileSync} from 'node:fs';
import ts from 'typescript';

export const compile = source => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
}).outputText).toString('base64');
export const analysisURL = compile(readFileSync('lib/analysis.ts', 'utf8'));
export const ranksURL = compile(readFileSync('lib/ranks.ts', 'utf8').replace("'./analysis'", JSON.stringify(analysisURL)));
export const guideURL = compile(readFileSync('lib/map-guide.ts', 'utf8').replace("'./analysis'", JSON.stringify(analysisURL)).replace("'./ranks'", JSON.stringify(ranksURL)));
