import * as vscode from 'vscode';

import {MLIRContext} from '../mlirContext';
import {ViewVerilogCommand} from './commands/viewOutput';
import {SendObjectPathHintsCommand} from './commands/sendObjectPathHints';
import {LoadMLIRCommand} from './commands/loadMLIR';
import {GoToObjectDefinitionCommand} from './commands/goToObjectDefinition';
/**
 *  Register the necessary extensions for supporting Verilog.
 */
export function registerVerilogExtensions(context: vscode.ExtensionContext,
                                       mlirContext: MLIRContext) {
  context.subscriptions.push(new ViewVerilogCommand(mlirContext));
  context.subscriptions.push(new SendObjectPathHintsCommand(mlirContext));
  context.subscriptions.push(new LoadMLIRCommand(mlirContext));
  context.subscriptions.push(new GoToObjectDefinitionCommand(mlirContext));
}
