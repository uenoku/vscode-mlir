import * as vscode from 'vscode'

import {Command} from '../../command';
import {MLIRContext} from '../../mlirContext';
import { assert } from 'console';

/**
 * A command that displays the output of the current Verilog document.
 */
export class LoadMLIRCommand extends Command {
  constructor(context: MLIRContext) { super('circt-verilog-lsp.loadMLIR', context); }

  async execute(args: any) {
    const editor = vscode.window.activeTextEditor;
    let verilogClient;
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.languageId != 'verilog') {
        continue;
      }

      verilogClient =
          this.context.getLanguageClient(editor.document.uri, "verilog");
      if (!verilogClient) {
        continue;
      }

      break;
    }

    // Ask the user for the desired output type.
    const inputFile =
        await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: {'MLIR file': ['mlir', 'mlirbc']}
        });

    const result =
        await verilogClient.sendRequest('verilog/loadMLIR', {
          uri : inputFile[0].fsPath,
        });
    if (!result) {
      return;
    }


    return result;
  }
}
