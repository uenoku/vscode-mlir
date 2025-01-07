import * as vscode from 'vscode';

import {MLIRContext} from '../mlirContext';
import {ViewVerilogCommand} from './commands/viewOutput';

/**
 *  Register the necessary extensions for supporting Verilog.
 */
export function registerVerilogExtensions(context: vscode.ExtensionContext,
                                       mlirContext: MLIRContext) {
  context.subscriptions.push(new ViewVerilogCommand(mlirContext));
}
