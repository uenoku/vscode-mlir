import * as vscode from 'vscode';

import {MLIRContext} from './mlirContext';
import {registerVerilogExtensions} from './Verilog/verilog';

/**
 *  This method is called when the extension is activated. The extension is
 *  activated the very first time a command is executed.
 */
export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('circt-verilog-lsp');
  context.subscriptions.push(outputChannel);

  const mlirContext = new MLIRContext();
  context.subscriptions.push(mlirContext);

  // Initialize the commands of the extension.
  context.subscriptions.push(
      vscode.commands.registerCommand('circt-verilog-lsp.restart', async () => {
        // Dispose and reactivate the context.
        mlirContext.dispose();
        await mlirContext.activate(outputChannel);
      }));
  registerVerilogExtensions(context, mlirContext);

  mlirContext.activate(outputChannel);
}
